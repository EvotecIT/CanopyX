  // ---------- declared width bounds for manual sizing; the shared grid layout fills the width ----------
  const LAYOUT_WIDTHS = DataGrid.prototype.applyWidths, LAYOUT_SET_WIDTH = DataGrid.prototype.setColumnWidth,
    LAYOUT_START_RESIZE = DataGrid.prototype.startResize;

  DataGrid.prototype.applyWidths = function () {
    LAYOUT_WIDTHS.call(this);
    this.cols.forEach((column, index) => {
      const grip = this.headCells[index].querySelector(".cx-resize"), policy = reportingLayout(this, column);
      grip.setAttribute("aria-valuemin", String(policy.minimum)); grip.setAttribute("aria-valuemax", String(policy.maximum));
    });
    const active = document.activeElement;
    if (active && this.headRow.contains(active) && active.matches(".cx-column-move,.cx-resize")) this.focusReportingHeader(active);
  };
  function reportingManualWidth(grid, column) {
    grid.noteViewPreferenceIntent?.();
    grid.fitManual(column); if (column.flex !== undefined) column.flex = false;
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
    return grid.autoFitColumn(id);
  };
