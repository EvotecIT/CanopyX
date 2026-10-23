  // ---------- sparse measured offsets over estimated rows; shared virtual viewport and detail observer ----------
  class GridRowOffsets {
    constructor(count, estimate) { this.count = count; this.estimate = estimate; this.heights = new Map(); this.deltas = new Map(); }
    top(index) {
      let sum = index * this.estimate;
      for (let at = index; at > 0; at -= at & -at) sum += this.deltas.get(at) || 0;
      return sum;
    }
    set(index, height) {
      const delta = height - (this.heights.get(index) ?? this.estimate); this.heights.set(index, height);
      for (let at = index + 1; at <= this.count; at += at & -at) this.deltas.set(at, (this.deltas.get(at) || 0) + delta);
    }
    at(y) {
      let index = 0, sum = 0;
      for (let step = 2 ** Math.floor(Math.log2(this.count || 1)); step >= 1; step /= 2) {
        const next = index + step, block = step * this.estimate + (this.deltas.get(next) || 0);
        if (next <= this.count && sum + block <= y) { index = next; sum += block; }
      }
      return Math.max(0, Math.min(this.count - 1, index));
    }
  }
  const GRID_ROW_TOP = DataGrid.prototype.rowTop, GRID_ROW_AT = DataGrid.prototype.rowAt;
  // Hidden density changes cannot render to rebuild offsets. Metric reads must still use retained tall-row
  // measurements, rather than a minimum-height estimate that can clip an intra-row anchor to one short row.
  DataGrid.prototype.rowTop = function (index) {
    if (this.autoRows && !this.rowProjection && !this.rowOffsets) this.syncRowOffsets();
    return GRID_ROW_TOP.call(this, index);
  };
  DataGrid.prototype.rowAt = function (top) {
    if (this.autoRows && !this.rowProjection && !this.rowOffsets) this.syncRowOffsets();
    return GRID_ROW_AT.call(this, top);
  };
  const AUTO_WIDTHS = DataGrid.prototype.applyWidths;
  DataGrid.prototype.applyWidths = function (widths) {
    AUTO_WIDTHS.call(this, widths);
    if (!this.autoRows) return;
    const shape = JSON.stringify(this.cols.map((column, i) => [column.id, widths?.[i] ?? column.width]));
    if (shape !== this.rowWidthShape) {
      this.rowWidthShape = shape;
      // Keep previous measurements as estimates until each row is seen at its new width. Resetting to the
      // minimum can move an anchor's intra-row offset beyond its estimated bottom before it can be measured.
      this.measureNeeded = true;
      this.scheduleRender();
    }
  };
  Object.assign(DataGrid.prototype, {
    observeDetail(element, auto) { if (this.autoRows) TreeGrid.prototype.observeDetail.call(this, element, auto); },
    gridRowAnchor() {
      const rows = this.rowProjection || this, top = this.logicalTop(), index = rows.rowAt(top);
      return { index, offset: top - rows.rowTop(index) };
    },
    syncRowOffsets() {
      const rows = this.rowProjection, bounds = this.rowBounds(), count = rows ? rows.rowCount() : Math.max(0, bounds.last - bounds.first + 1);
      if (this.rowOffsets && this.rowOffsetOwner === rows && this.rowOffsetFirst === bounds.first && this.rowOffsets.count === count) return;
      this.rowOffsets = new GridRowOffsets(count, this.rowH); this.rowOffsetOwner = rows; this.rowOffsetFirst = bounds.first;
      for (const [ordinal, height] of this.rowHeights) {
        const index = rows ? rows.recordIndex(ordinal) : ordinal - bounds.first;
        if (index >= 0 && index < count) this.rowOffsets.set(index, height);
      }
      this.total = this.rowOffsets.top(count); this.syncScrollRange(this.logicalTop());
      this.measureNeeded = true;
    },
    measureGridRows() {
      if (!this.measureNeeded || !this.rowOffsets || !this.hasGridSize()) return false;
      this.measureNeeded = false;
      const rows = this.rowProjection || this, anchor = this.gridRowAnchor(); let changed = false;
      for (const [row, element] of this.rendered) {
        if (row.status || row.group) continue;
        const index = rows.indexOf(row) - (this.rowProjection ? 0 : this.pageOffset), measured = element.offsetHeight;
        if (index < 0 || !measured) continue;
        const height = Math.max(this.rowH, measured); row.hpx = height;
        if (height !== (this.rowOffsets.heights.get(index) ?? this.rowH)) {
          this.rowOffsets.set(index, height); this.rowHeights.set(row._ri, height); changed = true;
        }
      }
      if (changed) {
        this.total = this.rowOffsets.top(this.rowOffsets.count);
        this.syncScrollRange(rows.rowTop(anchor.index) + anchor.offset);
      }
      return changed;
    },
    revealGridRow(row, index, rows = this) {
      const top = rows.rowTop(index), viewport = Math.max(0, this.grid.clientHeight - this.head.offsetHeight);
      if (top < this.logicalTop()) this.setLogicalTop(top);
      else if (top + Math.min(row.hpx, viewport) > this.logicalTop() + viewport) this.setLogicalTop(top + Math.min(row.hpx, viewport) - viewport);
    },
    gridPageStep(row, direction, rows = this) {
      const index = this.rowProjection ? rows.indexOf(row) : row._ri;
      if (!this.autoRows) return index + direction * Math.max(1,
        Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH));
      const proposed = rows.rowAt(Math.max(0, rows.rowTop(index) + direction * (this.grid.clientHeight - this.head.offsetHeight)));
      return direction > 0 ? Math.max(index + 1, proposed) : Math.min(index - 1, proposed);
    }
  });
