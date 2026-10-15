  // ---------- pasting: tab-separated text into editable cells ----------
  // A paste fills the cells from the first range's top-left corner (or the focused cell), as many rows and columns as the
  // text has; a single value fills every range. Each value is read as its column's kind: numbers as the page language or
  // plainly writes them, dates as ISO or the language's day, month and year order (in the grid's time zone), true and false.
  // CanopyX never writes data itself. The cancelable paste event (onPaste) offers the cells to the host first; with the
  // editing part each cell then goes through the editing API: its read-only rules, its checks, and one undo step for all.
  // Cells that cannot take their value are refused and listed in a report above the grid.
  function crParse(text) {
    const rows = [[]];
    let field = "", quoted = false;
    const source = String(text).replace(/\r\n?/g, "\n").replace(/\n$/, "");
    for (let index = 0; index < source.length; index++) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') { field += '"'; index++; }
        else if (character === '"') quoted = false;
        else field += character;
      } else if (character === '"' && field === "") quoted = true;
      else if (character === "\t") { rows[rows.length - 1].push(field); field = ""; }
      else if (character === "\n") { rows[rows.length - 1].push(field); field = ""; rows.push([]); }
      else field += character;
    }
    rows[rows.length - 1].push(field);
    return rows;
  }

  // The separators of the page language's numbers, read once per language.
  const crSeparators = new Map();
  function crNumber(text, lang) {
    if (!crSeparators.has(lang || "")) {
      const parts = new Intl.NumberFormat(lang || undefined).formatToParts(12345.6);
      crSeparators.set(lang || "", { group: parts.find(part => part.type === "group")?.value || ",", decimal: parts.find(part => part.type === "decimal")?.value || "." });
    }
    const { group, decimal } = crSeparators.get(lang || ""), escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Spaces and apostrophes only ever group digits, in every language, so they go first.
    let value = text.trim().replace(/^\((.*)\)$/, "-$1").replace(/[\s\u00a0\u202f'\u2019]/g, "").replace(/^[^\d+\-.,]+|[^\d.,]+$/g, "");
    const negative = value[0] === "-";
    value = value.replace(/^[-+]/, "");
    const groups = /[\s\u2019']/.test(group) ? "(?!)" : escape(group), local = new RegExp("^\\d{1,3}(" + groups + "\\d{3})*(" + escape(decimal) + "\\d+)?$|^\\d+(" + escape(decimal) + "\\d+)?$");
    let number = NaN;
    if (local.test(value)) number = Number(value.replace(new RegExp(groups, "g"), "").replace(decimal, "."));
    else if (/^(\d{1,3}(,\d{3})*|\d+)(\.\d+)?$/.test(value)) number = Number(value.replace(/,/g, ""));
    else if (/^\d+(\.\d+)?e[-+]?\d+$/i.test(value)) number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? negative ? -number : number : undefined;
  }

  // The order of day, month and year in the page language's dates.
  function crDateOrder(lang) {
    try { return new Intl.DateTimeFormat(lang || undefined).formatToParts(new Date(2001, 10, 22)).filter(part => ["day", "month", "year"].includes(part.type)).map(part => part.type); }
    catch (_) { return ["month", "day", "year"]; }
  }
  function crDateValue(text, grid) {
    let value = text.trim();
    for (const affix of [...grid.fmt.utc, ...grid.fmt.other]) if (affix.trim()) value = value.split(affix.trim()).join("").trim();
    if (/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
    let parts = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value), year, month, day;
    if (parts) [, year, month, day] = parts.map(Number);
    else {
      parts = /^(\d{1,4})[./\-\s]+(\d{1,2})[./\-\s]+(\d{1,4})\.?(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
      if (!parts) return undefined;
      const order = crDateOrder(grid.lang), read = {};
      order.forEach((name, index) => read[name] = Number(parts[index + 1]));
      ({ year, month, day } = read);
      if (year < 100) year += 2000;
    }
    const [hours = 0, minutes = 0, seconds = 0] = parts.slice(4, 7).map(item => item === undefined ? 0 : Number(item));
    const date = grid.local ? new Date(year, month - 1, day, hours, minutes, seconds) : new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
    const check = grid.local ? [date.getFullYear(), date.getMonth() + 1, date.getDate()] : [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    return check[0] === year && check[1] === month && check[2] === day && hours < 24 && minutes < 60 && seconds < 60 ? date.toISOString() : undefined;
  }

  /** A pasted text as a value of the column: undefined when it is not one. */
  function crValue(grid, column, text, previous) {
    const spec = grid.edit?.specs.get(column.id), trimmed = text.trim();
    if (!trimmed) return column.kind === "text" && spec?.type !== "toggle" && typeof previous !== "boolean" ? "" : null;
    if (column.kind === "number") return crNumber(trimmed, grid.lang);
    if (column.kind === "datetime") return crDateValue(trimmed, grid);
    if (spec?.type === "toggle" || typeof previous === "boolean") {
      const folded = foldText(trimmed);
      if (["true", "1", "yes", foldText(grid.labels.yes)].includes(folded)) return true;
      if (["false", "0", "no", foldText(grid.labels.no)].includes(folded)) return false;
      return undefined;
    }
    const option = spec?.options?.find(item => foldText(item.label) === foldText(trimmed) || foldText(String(item.value)) === foldText(trimmed));
    return option ? option.value : text;
  }

  /** The cells a paste of rows of texts covers, from an origin or the ranges, with their parsed values. */
  async function crTargets(grid, matrix, origin) {
    const rects = crRects(grid), bounds = crBounds(grid), single = matrix.length === 1 && matrix[0].length === 1;
    let blocks;
    if (single && rects.length && !origin) blocks = rects.map(rect => ({ rows: Array.from({ length: rect.bottom - rect.top + 1 }, (_, index) => rect.top + index), left: rect.left, right: rect.right }));
    else {
      const start = origin || (rects[0] ? { row: rects[0].top, column: grid.cols[rects[0].left].id } : crHit(grid, document.activeElement));
      const left = start ? grid.cols.findIndex(column => column.id === start.column) : -1;
      if (!start || left < 0 || start.row < bounds.first || start.row > bounds.last) crBad("pasting needs a range, a focused cell or a row and column to start at");
      const width = Math.max(...matrix.map(line => line.length)), rows = [], view = crRows(grid);
      for (let position = start.row; rows.length < matrix.length && position <= bounds.last; position++) {
        const row = view.rowItem(position);
        if (row && (!row.status || row.status === "loading" || row.status === "error")) rows.push(position);
      }
      blocks = [{ rows, left, right: Math.min(grid.cols.length - 1, left + width - 1) }];
    }
    if (!single && grid.cellOptions?.enabled && blocks[0].rows.length) {
      const block = blocks[0];
      grid.cellRanges = [{ anchor: { row: block.rows[0], column: grid.cols[block.left].id }, end: { row: block.rows[block.rows.length - 1], column: grid.cols[block.right].id } }];
      grid.cellAnchor = grid.cellRanges[0].anchor; crChanged(grid, false);
    }
    const loaded = await crLoad(grid, blocks), cells = [], refused = [];
    for (const block of blocks) block.rows.forEach((position, line) => {
      const row = loaded.get(position);
      if (!row) return;
      for (let index = block.left; index <= block.right; index++) {
        const column = grid.cols[index], text = single ? matrix[0][0] : matrix[line]?.[index - block.left];
        if (text === undefined) continue;
        const previous = cellValue(row.h.cells[column.id]), value = crValue(grid, column, text, previous);
        const cell = { id: row.key, column: column.id, row: position, text, value, previous: previous ?? null };
        if (value === undefined) refused.push({ ...cell, value: null, reason: fill(grid.labels.gridPasteType, { value: text, column: column.title }) });
        else cells.push(cell);
      }
    });
    return { cells, refused };
  }

  /** Applies cells through the editing part: one undo step, each cell's rules and checks; returns how many it applied. */
  async function crApplyEditing(grid, cells, source, refused) {
    let applied = 0;
    const candidates = [], proposals = new Map(), epoch = grid.queryEpoch;
    const current = proposed => {
      if (grid.destroyed || epoch !== grid.queryEpoch || JSON.stringify(proposed.record.cells) !== proposed.original)
        throw new DOMException("The paste row or query changed during validation.", "AbortError");
    };
    const reject = (candidate, reason) => { refused.push({ ...candidate.cell, reason }); candidate.refused = true; };
    grid.cancelEdit?.();
    for (const cell of cells) {
      const spec = grid.edit.specs.get(cell.column), record = grid.editRecord(cell.id);
      if (!spec || !record || !grid.canEditCell(record, cell.column)) { refused.push({ ...cell, reason: grid.labels.gridPasteReadOnly }); continue; }
      const proposed = proposals.get(cell.id) || { record, original: JSON.stringify(record.cells), pending: [], rounds: 0, dirty: true };
      const candidate = { cell, spec, proposed };
      proposed.pending.push(candidate); proposals.set(cell.id, proposed); candidates.push(candidate);
    }
    // A rejected proposal can invalidate another cell in its row. Shrink and recheck that row, never checking a value
    // against one that will not be applied. At most eight rounds per row (and never more than its candidate count) keep
    // a 200,000-cell paste linear in validator calls; a longer dependency chain conservatively refuses its remainder.
    for (const proposed of proposals.values()) proposed.limit = Math.min(8, proposed.pending.length);
    while ([...proposals.values()].some(proposed => proposed.dirty && proposed.pending.length)) {
      for (const proposed of proposals.values()) {
        while (proposed.dirty && proposed.pending.length) {
          current(proposed);
          if (proposed.rounds++ === proposed.limit) {
            for (const candidate of proposed.pending) reject(candidate, proposed.reason || grid.labels.gridPasteReadOnly);
            proposed.pending = []; break;
          }
          proposed.dirty = false;
          proposed.preview = grid.editPreview(proposed.record, proposed.pending.map(({ spec, cell }) => [spec, cell.value]));
          proposed.checked = { result: null, row: JSON.stringify(proposed.preview.cells), prepared: true };
          for (const candidate of proposed.pending) {
            let message = grid.editRules(candidate.spec, candidate.cell.value, proposed.preview);
            if (message && typeof message.then === "function") { message = await message; current(proposed); }
            if (message) { reject(candidate, message); proposed.reason = message; proposed.dirty = true; }
          }
          current(proposed);
          proposed.pending = proposed.pending.filter(candidate => !candidate.refused);
        }
      }
      // Guards and cancelable changing hooks see each row's accepted prefix in the offered order. They all run before
      // any real mutation; a veto therefore joins the same shrinking validation pass without undoing escaped changes.
      const prefixes = new Map();
      for (const candidate of candidates) {
        if (candidate.refused) continue;
        const { cell, spec, proposed } = candidate;
        let prefix = prefixes.get(proposed);
        if (!prefix) { prefix = grid.editPreview(proposed.record, []); prefixes.set(proposed, prefix); }
        const previous = cellValue(prefix.cells[cell.column]);
        let accepted = grid.canEditCell(prefix, cell.column);
        if (accepted && !candidate.prepared && !(previous === cell.value || previous == null && cell.value == null))
          accepted = grid.emit("cellValueChanging", { id: cell.id, column: cell.column, value: cell.value, previous,
            row: gridFreeze(JSON.parse(JSON.stringify(prefix))), source });
        if (!accepted) { reject(candidate, grid.labels.gridPasteReadOnly); proposed.dirty = true; }
        else { candidate.prepared = true; prefix.cells[cell.column] = proposed.preview.cells[cell.column]; }
      }
      for (const proposed of proposals.values()) { current(proposed); proposed.pending = proposed.pending.filter(candidate => !candidate.refused); }
    }
    for (const proposed of proposals.values()) current(proposed);
    grid.editGroup(() => {
      for (const { cell, spec, proposed, refused: rejected } of candidates) {
        if (rejected) continue;
        if (grid.editApply(cell.id, spec, cell.value, source, proposed.record, proposed.checked)) applied++;
        else refused.push({ ...cell, reason: grid.labels.gridPasteReadOnly });
      }
    });
    return applied;
  }

  /**
   * Offers the cells to the host (the cancelable paste event, whose handler may answer with respondWith), then applies them
   * through the editing part when the grid edits. Resolves with { applied, refused, cancelled }.
   */
  async function crApply(grid, cells, refused, source) {
    let answer;
    const detail = { source, cells: gridFreeze(JSON.parse(JSON.stringify(cells))), refused: gridFreeze(JSON.parse(JSON.stringify(refused))), respondWith(result) { answer = result; } };
    if (!grid.emit("paste", detail)) return Object.freeze({ applied: 0, refused: [], cancelled: true });
    const declined = new Set(), editing = !!grid.edit && typeof grid.editApply === "function";
    if (answer !== undefined) {
      const result = await answer, list = Array.isArray(result?.refused) ? result.refused : result === false ? cells : [];
      for (const item of list) {
        const cell = cells.find(entry => entry.id === item?.id && entry.column === item?.column);
        if (!cell || declined.has(cell)) continue;
        declined.add(cell);
        refused.push({ ...cell, reason: typeof item.reason === "string" && item.reason.trim() && item !== cell ? item.reason : grid.labels.gridPasteReadOnly });
      }
    }
    // Without the editing part the grid changes nothing: what the host's answer did not refuse counts as applied by the host.
    const remaining = cells.filter(cell => !declined.has(cell));
    const applied = editing ? await crApplyEditing(grid, remaining, source, refused) : answer !== undefined ? remaining.length : 0;
    crReport(grid, applied, refused, source);
    return gridFreeze({ applied, refused: JSON.parse(JSON.stringify(refused)), cancelled: false });
  }

  async function crPaste(grid, text, origin, source) {
    if (typeof text !== "string") crBad("pasteCells takes text");
    const matrix = crParse(text);
    if (!text) return gridFreeze({ applied: 0, refused: [], cancelled: false });
    const { cells, refused } = await crTargets(grid, matrix, origin);
    return crApply(grid, cells, refused, source);
  }

  /** Announces what a paste or fill changed and lists the refused cells above the grid until dismissed. */
  function crReport(grid, applied, refused, source) {
    const count = value => numberFormat(grid.lang).format(value);
    const said = [fill(grid.labels[source === "fill" ? "gridCellsFilled" : "gridCellsPasted"], { count: count(applied) })];
    if (refused.length) said.push(fill(grid.labels.gridPasteRefused, { count: count(refused.length) }));
    setText(grid.live, said.join(". "));
    grid.pasteReport?.remove(); grid.pasteReport = null;
    if (!refused.length) return;
    const panel = h("div", "cx-paste-report"), summary = h("p"), details = h("details"), title = h("summary"), list = h("ul");
    panel.setAttribute("role", "region"); panel.setAttribute("aria-label", grid.labels.gridPasteReport);
    setText(summary, said.join(". ")); setText(title, grid.labels.gridPasteReport);
    const identity = grid.columns.find(column => column.rowHeader) || grid.cols[0], rows = crRows(grid);
    for (const cell of refused.slice(0, 200)) {
      const item = h("li"), row = rows.rowItem(cell.row), column = grid.columns.find(entry => entry.id === cell.column);
      const name = row && !row.status ? cellText(row.h.cells[identity.id], identity, grid.fmt) || cell.id : String(cell.row + 1);
      setText(item, fill(grid.labels.gridPasteCell, { row: name, column: column ? column.title : cell.column, reason: cell.reason })); list.appendChild(item);
    }
    const close = gridDecorateButton(gridButton("", () => { panel.remove(); if (grid.pasteReport === panel) grid.pasteReport = null; grid.grid.focus({ preventScroll: true }); }), "close", true);
    close.classList.add("icon"); close.setAttribute("aria-label", grid.labels.gridDone);
    details.append(title, list); panel.append(summary, close, details);
    grid.host.insertBefore(panel, grid.grid); grid.pasteReport = panel;
  }
