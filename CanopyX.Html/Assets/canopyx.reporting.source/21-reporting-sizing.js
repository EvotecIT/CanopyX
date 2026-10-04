  // ---------- viewport remainder allocation and bounded loaded-row auto-fit ----------
  const LAYOUT_WIDTHS = DataGrid.prototype.applyWidths, LAYOUT_SET_WIDTH = DataGrid.prototype.setColumnWidth,
    LAYOUT_START_RESIZE = DataGrid.prototype.startResize, LAYOUT_CELL = DataGrid.prototype.newCell, LAYOUT_BUILD = DataGrid.prototype.build;

  // Reuse the neutral sizing and cell painters; flexible geometry belongs only to the optional reporting view.
  DataGrid.prototype.newCell = function (index, width, kind) {
    return LAYOUT_CELL.call(this, index, kind ? this.cols[index].renderWidth ?? width : width, kind);
  };
  DataGrid.prototype.build = function () {
    LAYOUT_BUILD.call(this);
    this.resizeObserver.disconnect();
    this.resizeObserver = new ResizeObserver(() => { this.applyWidths(); this.scheduleRender(); }); this.resizeObserver.observe(this.grid);
  };

  DataGrid.prototype.applyWidths = function () {
    let total = 0;
    for (const column of this.cols) {
      column.width = reportingWidth(this, column, column.width); column.renderWidth = column.width; total += column.width;
    }
    let remaining = Math.max(0, this.grid.clientWidth - total), flexible = this.cols.filter(column => column.flex &&
      reportingLayout(this, column).maximum > column.renderWidth);
    while (remaining > 0.5 && flexible.length) {
      const weight = flexible.reduce((sum, column) => sum + reportingLayout(this, column).flex, 0);
      if (!weight) break;
      let used = 0;
      for (const column of flexible) {
        const policy = reportingLayout(this, column), extra = Math.min(policy.maximum - column.renderWidth, remaining * policy.flex / weight);
        column.renderWidth += extra; used += extra;
      }
      remaining -= used; flexible = flexible.filter(column => reportingLayout(this, column).maximum - column.renderWidth > 0.5);
      if (used < 0.5) break;
    }
    LAYOUT_WIDTHS.call(this, this.cols.map(column => column.renderWidth));
    this.cols.forEach((column, index) => {
      const grip = this.headCells[index].querySelector(".cx-resize"), policy = reportingLayout(this, column);
      grip.setAttribute("aria-valuemin", String(policy.minimum)); grip.setAttribute("aria-valuemax", String(policy.maximum));
    });
  };
  function reportingManualWidth(grid, column) {
    column.width = column.renderWidth ?? column.width; if (column.flex !== undefined) column.flex = false;
  }
  DataGrid.prototype.setColumnWidth = function (id, width) {
    const column = this.columns.find(item => item.id === id);
    if (column && Number.isFinite(width)) { if (column.flex !== undefined) column.flex = false; width = reportingWidth(this, column, width); }
    return LAYOUT_SET_WIDTH.call(this, id, width);
  };
  DataGrid.prototype.startResize = function (event, column) {
    if (!this.destroyed && event.button === 0) reportingManualWidth(this, column);
    return LAYOUT_START_RESIZE.call(this, event, column);
  };

  GRID_REPORTING.fitColumn = (grid, id) => {
    const column = grid.columns.find(item => item.id === id);
    if (!column || grid.destroyed || grid.pendingQuery || !grid.acceptedQuery) throw new Error("CanopyX: auto-fit needs a declared column and an accepted query.");
    const context = document.createElement("canvas").getContext("2d"), style = getComputedStyle(grid.grid);
    if (!context) throw new Error("CanopyX: text measurement is unavailable.");
    context.font = style.font || style.fontSize + " " + style.fontFamily;
    let width = context.measureText(column.title.slice(0, 2048)).width + 76, sampled = 0;
    for (const row of grid.rowCache.values()) {
      if (sampled === 200) break;
      width = Math.max(width, context.measureText(cellText(row.h.cells[column.id], column, grid.fmt).slice(0, 2048)).width + 32); sampled++;
    }
    grid.setColumnWidth(id, Math.ceil(Math.min(800, width)));
    return Object.freeze({ width: column.width, sampled: sampled, scope: "loaded" });
  };
