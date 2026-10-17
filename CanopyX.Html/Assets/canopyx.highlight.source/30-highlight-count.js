  // ---------- search highlighting: the match count and next/previous navigation ----------
  // A match is one hit in a shown cell, in the cell text the view formats. An inline grid counts its whole result, a tree
  // its visible rows, a grid with a host source the rows it has loaded (complete once every row is loaded; pages that arrive
  // later count again). Counting runs in slices of a few milliseconds between frames, so typing and scrolling stay smooth on
  // large results; marking needs no count, so painted rows are marked at once. The counts are one number per row. The
  // current match is held by record id and column, so it survives rows moving in a tree or a new page of a grid.
  const HL_SLICE_MS = 8;
  const hlYield = () => new Promise(resolve => setTimeout(resolve, 0));

  // The records a view counts, by row position: the whole result (inline grids), the visible rows (trees), or the loaded
  // rows with gaps (host grids, also when the source cannot count its result).
  async function hlRecords(view, signal) {
    if (view.kind !== "grid") return { list: view.rows.map(row => row.status || row.h.detail ? null : row.h), complete: true };
    const query = view.acceptedQuery, matched = view.snapshot?.matched;
    if (!query) return { list: [], complete: true };
    if (view.view.source.kind === "inline" && (!view.opts.source || view.enhanceStore) && Number.isInteger(matched)) {
      const page = await view.source.query({ ...query, offset: 0, limit: Math.max(1, matched) }, { signal });
      return { list: page.items, complete: true };
    }
    let length = view.rowCount() || 0;
    for (const index of view.rowCache.keys()) length = Math.max(length, index + 1);
    const list = new Array(length).fill(null);
    for (const [index, row] of view.rowCache) list[index] = row.h;
    return { list, complete: Number.isInteger(matched) && view.rowCache.size >= matched };
  }
  // The columns a view counts, in order, with the terms that apply to each. Columns a host renderer draws are not marked.
  function hlCountedColumns(view) {
    const state = view.hl, cols = view.kind === "grid" ? view.columns : (view.cols || []).slice(0, 1);
    return cols.map(column => [column, !hlHostDrawn(column) && state.columns.get(column.id)]).filter(([, applicable]) => applicable);
  }
  function hlCellText(view, record, column) {
    const cell = view.kind === "grid" ? record.cells[column.id] : view.cellOf(record, column, view.columns.indexOf(column));
    return cellText(cell, column, view.fmt);
  }
  // Hits per counted column of one record: [[column, count], ...] for the columns with hits.
  function hlRowHits(view, record) {
    const hits = [];
    if (!record) return hits;
    for (const [column, applicable] of view.hl.counted) {
      const count = hlCount(hlCellText(view, record, column), applicable, view.highlightOptions, record);
      if (count) hits.push([column, count]);
    }
    return hits;
  }

  /** Counts the matches of the view's current terms, superseding a count in progress. */
  function hlRecount(view) {
    const state = view.hl;
    state.counter?.abort(); clearTimeout(state.retopTimer); state.retopTimer = 0;
    const controller = state.counter = new AbortController(), signal = controller.signal;
    state.counted = hlCountedColumns(view);
    state.complete = false;
    return state.counting = (async () => {
      if (!state.active || !state.counted.length) { Object.assign(state, { counts: new Uint32Array(0), list: [], total: 0, complete: true, current: null }); hlSync(view); return; }
      const { list, complete } = await hlRecords(view, signal);
      if (signal.aborted) return;
      const counts = new Uint32Array(list.length);
      let total = 0, started = performance.now();
      for (let i = 0; i < list.length; i++) {
        const record = list[i];
        if (record) { let sum = 0; for (const [, count] of hlRowHits(view, record)) sum += count; counts[i] = sum; total += sum; }
        if ((i & 127) === 127 && performance.now() - started > HL_SLICE_MS) {
          state.total = total; hlSync(view, true);
          await hlYield();
          if (signal.aborted) return;
          started = performance.now();
        }
      }
      Object.assign(state, { counts, list, total, complete });
      // The current match follows its record to its new position, or ends when the record no longer has a hit.
      const current = state.current;
      if (current) {
        const index = list[current.index]?.id === current.key ? current.index : list.findIndex(record => record && record.id === current.key);
        state.current = index >= 0 && counts[index] > 0 ? { ...current, index } : null;
        if (state.current?.index !== current.index) { view.version++; view.scheduleRender(); }
      }
      hlSync(view);
      // The finished count is announced once typing pauses; the count itself is not a live region.
      clearTimeout(state.announceTimer);
      // A recount that changes nothing (a layout switch, a repaint) leaves the live region to the other announcements.
      state.announceTimer = setTimeout(() => {
        const text = !view.destroyed && state.active && hlCountText(view);
        if (text && text !== state.announced) { state.announced = text; hlAnnounce(view, text); }
      }, 700);
      view.emit("matches", { total, current: hlPosition(view), complete });
    })().catch(error => { if (error.name !== "AbortError") view.emit("error", { error }); });
  }

  // The 1-based rank of the current match, or 0.
  function hlPosition(view) {
    const state = view.hl, current = state.current;
    if (!current || !state.counts || current.index >= state.counts.length) return 0;
    let rank = 0;
    for (let i = 0; i < current.index; i++) rank += state.counts[i];
    for (const [column, count] of hlRowHits(view, state.list[current.index])) {
      if (column.id === current.column) return rank + Math.min(current.n, count - 1) + 1;
      rank += count;
    }
    return 0;
  }

  // The next or previous match from the current one, or from the focused row (or, on a flat grid, the first row in view).
  // Both wrap at either end.
  function hlFind(view, direction) {
    const state = view.hl, counts = state.counts, length = counts.length;
    if (!state.total || !length) return null;
    const current = state.current;
    const focusedIndex = view.kind === "grid" ? view.focused && !view.focused.status ? view.focused._ri : view.rowAt(view.logicalTop()) : Math.max(0, view.indexOf(view.focused));
    const start = current ? current.index : Math.max(0, Math.min(length - 1, focusedIndex ?? 0));
    const inRow = (index, from) => {
      const record = state.list[index], flat = [];
      for (const [column, count] of hlRowHits(view, record)) for (let n = 0; n < count; n++) flat.push({ index, key: record.id, column: column.id, n });
      if (!flat.length) return null;
      if (from === undefined) return direction > 0 ? flat[0] : flat[flat.length - 1];
      const at = flat.findIndex(item => item.column === from.column && item.n === from.n);
      return flat[at + direction] || null;
    };
    if (current) { const next = inRow(start, current); if (next) return next; }
    // Without a current match, Next starts at the anchor row and Previous before it.
    else if (counts[start] && direction > 0) { const first = inRow(start); if (first) return first; }
    for (let step = 1; step <= length; step++) {
      const index = (start + direction * step + length * step) % length;
      if (counts[index]) return inRow(index);
    }
    return null;
  }

  /** Moves to the next (1) or previous (-1) match: scrolls its row into view, marks it current and focuses its cell. */
  async function hlStep(view, direction, focus) {
    const state = view.hl;
    if (!state || !state.active) return false;
    // Rows that moved since the last count (a tree that expanded) are counted now; then the count of the current terms is
    // awaited, and a count that a newer one superseded is followed by that one.
    if (state.retopTimer) hlRecount(view);
    for (let counting = state.counting; !state.complete && counting; counting = state.counting === counting ? null : state.counting) await counting;
    const next = hlFind(view, direction);
    if (!next) { hlAnnounce(view, view.labels.matchesNone); return false; }
    state.current = next; view.version++;
    const position = hlPosition(view), column = view.columns.find(item => item.id === next.column);
    let row;
    if (view.kind === "grid") {
      await view.focusResult(next.index, false);
      row = view.rowItem(next.index);
    } else {
      row = view.rows[next.index];
      view.setFocus(row, false);
    }
    view.render();
    const element = row && view.rendered.get(row), cells = view.rowCells(element), at = view.cols.indexOf(column);
    if (element && at >= 0) {
      if (focus) view.focusCell(row, at, null);
      else view.revealInRow(cells[at], cells[at], cells[0]);
    } else if (row && view.kind === "grid" && focus) {
      await view.openDetails(row.key);
    }
    hlSync(view);
    hlAnnounce(view, fill(view.labels.matchesAnnounce, { current: hlFormat(view, position), count: hlFormat(view, state.total), column: column ? column.title : "" }));
    view.emit("matches", { total: state.total, current: position, complete: state.complete });
    return true;
  }
  function hlFormat(view, value) { return numberFormat(view.lang).format(value); }
  function hlAnnounce(view, text) { if (view.live) { setText(view.live, ""); setText(view.live, text); } }
