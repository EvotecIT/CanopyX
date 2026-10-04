  // ---------- pinned regions keep the scrolling center reachable ----------
  const PLACEMENT_REVEAL = DataGrid.prototype.revealInRow, PLACEMENT_FOCUS_HEADER = DataGrid.prototype.focusReportingHeader,
    PLACEMENT_EXPORT = DataGrid.prototype.prepareExport;
  function revealReportingCenter(grid, target, pin) {
    if (pin && pin !== "none") return;
    const frame = grid.grid.getBoundingClientRect(), left = frame.left + grid.grid.clientLeft + (grid.pinnedLeftWidth || 0),
      right = frame.left + grid.grid.clientLeft + grid.grid.clientWidth - (grid.pinnedRightWidth || 0), box = target.getBoundingClientRect();
    if (box.left < left) grid.grid.scrollLeft -= left - box.left;
    else if (box.right > right) grid.grid.scrollLeft += Math.min(box.right - right, Math.max(0, box.left - left));
  }
  DataGrid.prototype.revealInRow = function (cell, target, treeCell) {
    PLACEMENT_REVEAL.call(this, cell, target, treeCell);
    if (cell.parentNode && cell.parentNode._kind === "node") revealReportingCenter(this, target, cell.getAttribute("data-cx-pin"));
  };
  DataGrid.prototype.focusReportingHeader = function (control) {
    PLACEMENT_FOCUS_HEADER.call(this, control);
    if (control) revealReportingCenter(this, control, control.closest(".cx-hcell").getAttribute("data-cx-pin"));
  };
  DataGrid.prototype.prepareExport = function (options) {
    const columns = options && options.columns === undefined ? reportingColumnOrder(this.columns.filter(column => !column.hidden)).map(column => column.id) : undefined;
    return PLACEMENT_EXPORT.call(this, columns ? Object.assign({}, options, { columns }) : options);
  };
