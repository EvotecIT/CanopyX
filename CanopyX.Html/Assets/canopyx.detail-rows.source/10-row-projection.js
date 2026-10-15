  // ---------- row projection: group headings, records and detail rows over the accepted record range ----------
  // Paging, matched counts, selection ranges and scrollToRow keep counting records. The projection places headings (from
  // the grouping part) and expanded detail rows between them without a wrapper per record: runs of records are ranges, and
  // a run knows the sorted ordinals of its expanded records, so a position resolves with two binary searches. Heights live
  // in sparse measured offsets, so detail rows and wrapped records keep their measured height and everything else its estimate.
  const ROWS_BASE = {};
  for (const name of ["render", "renderPass", "trimInactiveCache", "syncRowOffsets", "setFocus", "onKey", "fillRow", "destroy"])
    ROWS_BASE[name] = DataGrid.prototype[name];
  GRID_ROWS.view = ROWS_BASE;
  // The position of the first entry of a sorted list whose value (or field) is at least value; the entry at or before value.
  function rowsLowerBound(list, value) {
    let low = 0, high = list.length;
    while (low < high) { const middle = (low + high) >>> 1; if (list[middle] < value) low = middle + 1; else high = middle; }
    return low;
  }
  function rowsAtOrBefore(list, value, field) {
    let low = 0, high = list.length;
    while (low < high) { const middle = (low + high) >>> 1; if (list[middle][field] <= value) low = middle + 1; else high = middle; }
    return low ? list[low - 1] : null;
  }
  // Inside a run, record r sits at (r - first) plus the expanded records before it, and its detail row right after it.
  function rowsResolve(segment, k) {
    const list = segment.details, first = segment.first;
    let low = 0, high = list.length;
    while (low < high) { const middle = (low + high) >>> 1; if (list[middle] - first + middle + 1 < k) low = middle + 1; else high = middle; }
    return low < list.length && list[low] - first + low + 1 === k ? [list[low], true] : [first + k - low, false];
  }

  Object.assign(DataGrid.prototype, {
    prepareRowProjection() {
      this.resolveDetails();
      const bounds = this.rowBounds(), groups = this.projectionGroups?.() || null;
      const key = [this.snapshot, groups, bounds.first, bounds.last, this.groupCollapseVersion || 0, this.detailVersion || 0, this.rowH];
      if (this.rowProjectionKey?.every((value, index) => value === key[index])) return;
      const previous = this.rowProjection, sameResult = previous && this.rowProjectionKey[0] === this.snapshot, top = this.logicalTop();
      const anchorIndex = sameResult && previous.rowCount() ? previous.rowAt(top) : -1;
      const anchor = anchorIndex >= 0 ? { item: previous.rowItem(anchorIndex), offset: top - previous.rowTop(anchorIndex) } : null;
      const details = this.detailOrdinals || [], segments = [], runs = [], headers = new Map();
      let count = 0;
      const run = (first, last) => {
        if (first > last) return;
        const list = details.slice(rowsLowerBound(details, first), rowsLowerBound(details, last + 1));
        const segment = { start: count, length: last - first + 1 + list.length, first, last, details: list };
        segments.push(segment); runs.push(segment); count += segment.length;
      };
      const walk = (list, level, path) => {
        for (const group of list) {
          const first = Math.max(bounds.first, group.offset), last = Math.min(bounds.last, group.offset + group.count - 1);
          if (first > last) continue;
          headers.set(group.key, count); segments.push({ start: count, length: 1, header: this.groupHeader(group, level, path) }); count++;
          if (this.collapsedGroups?.has(group.key)) continue;
          if (group.groups?.length) walk(group.groups, level + 1, [...path, group]); else run(first, last);
        }
      };
      if (groups) walk(groups, 1, []); else run(bounds.first, bounds.last);
      const recordIndex = ordinal => {
        const segment = rowsAtOrBefore(runs, ordinal, "first");
        return !segment || ordinal > segment.last ? -1 : segment.start + ordinal - segment.first + rowsLowerBound(segment.details, ordinal);
      };
      const offsets = new GridRowOffsets(count, this.rowH);
      for (const segment of runs) segment.details.forEach((ordinal, index) => {
        const height = this.detailHeights?.get(this.detailKeyAt(ordinal));
        offsets.set(segment.start + ordinal - segment.first + index + 1, height ?? this.detailEstimate());
      });
      if (this.autoRows) for (const [ordinal, height] of this.rowHeights) { const index = recordIndex(ordinal); if (index >= 0) offsets.set(index, height); }
      const projection = {
        rowCount: () => count,
        rowAt: top => offsets.at(top),
        rowTop: index => offsets.top(index),
        recordIndex,
        rowItem: index => {
          const segment = rowsAtOrBefore(segments, index, "start");
          if (!segment || index >= segment.start + segment.length) return null;
          if (segment.header) return segment.header;
          const [ordinal, detail] = rowsResolve(segment, index - segment.start);
          return detail ? this.detailItem(ordinal) : this.rowItem(ordinal);
        },
        indexOf: row => {
          if (!row) return -1;
          if (row.group) return this.groupHeaders?.get(row.group.key) === row ? headers.get(row.group.key) ?? -1 : -1;
          if (row.status === "detail") {
            const index = this.detailRecords?.get(row.detailOf) === row && details.includes(row.ordinal) ? recordIndex(row.ordinal) : -1;
            return index < 0 ? -1 : index + 1;
          }
          return row._ri < 0 || this.indexOf(row) < 0 ? -1 : recordIndex(row._ri);
        },
        // Hidden groups can separate adjacent presentation rows by millions of record positions; each visible record
        // interval is kept for paging and cache retention.
        recordWindow: (first, last) => {
          const ranges = [];
          for (const segment of runs) {
            const start = Math.max(first, segment.start), end = Math.min(last, segment.start + segment.length - 1);
            if (start <= end) ranges.push({ first: rowsResolve(segment, start - segment.start)[0], last: rowsResolve(segment, end - segment.start)[0] });
          }
          return { first: ranges[0]?.first ?? bounds.first, last: ranges.at(-1)?.last ?? -1, ranges };
        }
      };
      this.rowProjection = projection; this.rowProjectionKey = key;
      this.rowOffsets = offsets; this.rowOffsetOwner = projection; this.rowOffsetFirst = bounds.first;
      this.relocateFocus?.(projection);
      this.total = offsets.top(count);
      this.grid.setAttribute("aria-rowcount", String(count + (this.summaryControls?.parentElement === this.grid ? 2 : 1) + (this.headDepth || 0)));
      const index = anchor ? projection.indexOf(anchor.item) : -1;
      this.syncScrollRange(index >= 0 ? projection.rowTop(index) + anchor.offset : top);
    },
    // The projection keeps its own offsets; the grid's record offsets are rebuilt with it.
    syncRowOffsets() { if (!this.rowProjection) ROWS_BASE.syncRowOffsets.call(this); },
    render() {
      if (!this.rowsAttached) return ROWS_BASE.render.call(this);
      if (!this.destroyed && this.acceptedQuery) { this.acceptRows?.(); this.prepareRowProjection(); }
      let measured = ROWS_BASE.render.call(this);
      for (let pass = 0; this.rowProjection && pass < 3 && this.measureDetailRows(); pass++) { measured = true; ROWS_BASE.render.call(this); }
      return measured;
    },
    renderPass() { return ROWS_BASE.renderPass.call(this, this.rowProjection || this); },
    trimInactiveCache() {
      if (this.rowProjection) this.window = this.rowProjection.recordWindow(this.window.first, this.window.last);
      return ROWS_BASE.trimInactiveCache.call(this);
    },
    // Detail rows are as tall as their content. A row that grows above the reader's place keeps that place.
    measureDetailRows() {
      if (!this.detailMeasure || !this.rowProjection || !this.hasGridSize()) return false;
      this.detailMeasure = false;
      const rows = this.rowProjection, anchor = this.gridRowAnchor(); let changed = false;
      for (const [row, element] of this.rendered) {
        if (row.status !== "detail") continue;
        const index = rows.indexOf(row), measured = element.offsetHeight;
        if (index < 0 || !measured) continue;
        const height = Math.max(this.rowH, measured); row.hpx = height;
        if (height !== (this.rowOffsets.heights.get(index) ?? this.rowH)) {
          this.rowOffsets.set(index, height); this.detailHeights.set(row.detailOf, height); changed = true;
        }
      }
      if (changed) { this.total = this.rowOffsets.top(rows.rowCount()); this.syncScrollRange(rows.rowTop(anchor.index) + anchor.offset); }
      return changed;
    },
    setFocus(row, focus) {
      if (!this.rowProjection) return ROWS_BASE.setFocus.call(this, row, focus);
      if (row && !row.group && row.status !== "detail" && !this.pendingQuery) this.revealRecord?.(row);
      if (this.rowProjection.indexOf(row) < 0 || this.destroyed) return;
      this.pendingNavigation = null; this.focused = row;
      this.revealGridRow(row, this.rowProjection.indexOf(row), this.rowProjection);
      if (this.render()) { this.revealGridRow(row, this.rowProjection.indexOf(row), this.rowProjection); this.render(); }
      if (focus) this.rendered.get(this.focused)?.focus({ preventScroll: true });
    },
    // Up, Down and the Page keys walk headings, records and detail rows alike; records load through focusResult.
    onKey(event) {
      const row = event.target.closest(".cx-row")?._w;
      if (!row || !this.rowProjection || event.defaultPrevented || event.isComposing || event.altKey || event.target.matches(OWN_ARROWS))
        return ROWS_BASE.onKey.call(this, event);
      const navigation = this.pendingNavigation;
      if (navigation?.focus && navigation.epoch === this.queryEpoch && this.focused === row) return ROWS_BASE.onKey.call(this, event);
      if (this.pendingQuery && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) { event.preventDefault(); return; }
      if (this.projectedRowKey?.(event, row) || this.detailRowKey(event, row)) return;
      const synthetic = row.group || row.status === "detail";
      if (synthetic && ["Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (event.ctrlKey || event.metaKey) this.focusResult(event.key === "Home" ? 0 : this.rowCount() - 1, true)
          .catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
        else this.setFocus(row, true);
        return;
      }
      if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) return ROWS_BASE.onKey.call(this, event);
      const rows = this.rowProjection, step = event.key.startsWith("Page") ? Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH)) : 1;
      // Page keys move by the viewport's height in the projection's measured offsets, so tall detail rows count as tall.
      const direction = /Up$/.test(event.key) ? -1 : 1, here = rows.indexOf(row), page = Math.max(this.rowH, this.grid.clientHeight - this.head.offsetHeight);
      const proposed = !event.key.startsWith("Page") ? here + direction * step : !this.detailOrdinals?.length ? (this.autoRows ? this.gridPageStep(row, direction, rows) : here + direction * step) :
        direction > 0 ? Math.max(here + 1, rows.rowAt(rows.rowTop(here) + page)) : Math.min(here - 1, rows.rowAt(Math.max(0, rows.rowTop(here) - page + this.rowH - 1)));
      const cells = this.rowCells(this.rendered.get(row)), column = synthetic ? -1 : cells.findIndex(cell => cell.contains(event.target));
      event.preventDefault(); event.stopPropagation();
      if (this.paged && (proposed < 0 || proposed >= rows.rowCount())) {
        const bounds = this.rowBounds();
        if (synthetic && (direction < 0 && bounds.first === 0 || direction > 0 && bounds.last === this.rowCount() - 1)) {
          this.setFocus(rows.rowItem(Math.max(0, Math.min(rows.rowCount() - 1, proposed))), true); return;
        }
        const ordinal = synthetic ? (direction < 0 ? bounds.first - step : bounds.last + step) : row._ri + direction * step;
        this.focusResult(Math.max(0, Math.min(this.rowCount() - 1, ordinal)), true, column, null)
          .catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
        return;
      }
      const target = rows.rowItem(Math.max(0, Math.min(rows.rowCount() - 1, proposed)));
      if (target?.group || target?.status === "detail") this.setFocus(target, true);
      else if (target) this.focusResult(target._ri, true, column, null).catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
    }
  });
