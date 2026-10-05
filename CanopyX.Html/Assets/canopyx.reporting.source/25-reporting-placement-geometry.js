  // ---------- one DOM order: left group, scrolling center, right group ----------
  const PLACEMENT_WIDTHS = DataGrid.prototype.applyWidths, PLACEMENT_CELL = DataGrid.prototype.newCell;
  DataGrid.prototype.visibleColumns = function () {
    const requested = this.columns.filter(column => !column.hidden), options = this.view.reporting || {};
    for (const column of this.columns) column.responsiveHidden = false;
    if (options.responsive && this.grid && this.grid.clientWidth) {
      let total = requested.reduce((sum, column) => sum + reportingWidth(this, column, column.width), 0), remaining = requested.length;
      const candidates = requested.filter(column => !reportingLayout(this, column).alwaysVisible).sort((a, b) =>
        (reportingLayout(this, b).priority ?? MAX_PROTOCOL_INTEGER) - (reportingLayout(this, a).priority ?? MAX_PROTOCOL_INTEGER) ||
        requested.indexOf(b) - requested.indexOf(a));
      for (const column of candidates) {
        if (total <= this.grid.clientWidth || remaining === 1) break;
        column.responsiveHidden = true; total -= reportingWidth(this, column, column.width); remaining--;
      }
    }
    const visible = requested.filter(column => !column.responsiveHidden);
    return ["left", "none", "right"].flatMap(pin => visible.filter(column => column.pin === pin));
  };
  DataGrid.prototype.applyWidths = function () {
    this.fitInitialColumns();
    const visible = this.visibleColumns();
    if (this.cols && (visible.length !== this.cols.length || visible.some((column, index) => column !== this.cols[index]))) {
      const held = this.heldCell(), columnId = held && this.cols[held.index] && this.cols[held.index].id;
      const heldHeader = this.headRow.contains(document.activeElement);
      this.buildHeader(); this.syncColumnControls(); this.render(); this.restoreReportingFocus(held, columnId);
      if (heldHeader && document.activeElement === document.body) {
        if (this.focused) this.setFocus(this.focused, true);
        else this.focusReportingHeader(this.headRow.querySelector("button,.cx-resize"));
      }
      return;
    }
    PLACEMENT_WIDTHS.call(this);
    gridPinGeometry(this);
    const active = document.activeElement;
    if (active && this.headRow.contains(active)) this.focusReportingHeader(active);
    const cell = active && active.closest(".cx-cell");
    if (cell && this.canvas.contains(cell)) this.revealInRow(cell, active, false);
  };
  DataGrid.prototype.newCell = function (index, width, kind) {
    const cell = PLACEMENT_CELL.call(this, index, width, kind);
    if (kind && this.cols[index]) this.applyColumnPin(cell, this.cols[index]); return cell;
  };
