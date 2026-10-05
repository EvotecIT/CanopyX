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
    const budget = Math.max(0, this.grid.clientWidth - ((this.view.reporting || {}).minimumCenterWidth || 128));
    for (const column of this.columns) column.effectivePin = "none";
    const left = this.cols.filter(column => column.pin === "left"), right = this.cols.filter(column => column.pin === "right").reverse();
    let used = 0; const stopped = [false, false];
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
      for (const [side, column] of [left[index], right[index]].entries()) if (column && !stopped[side]) {
        if (used + column.renderWidth > budget) stopped[side] = true;
        else { used += column.renderWidth; column.effectivePin = column.pin; }
      }
    }
    let start = 0, end = 0;
    for (const column of this.cols) {
      column.pinOffset = column.effectivePin === "left" ? start : 0;
      if (column.effectivePin === "left") start += column.renderWidth;
    }
    for (const column of [...this.cols].reverse()) if (column.effectivePin === "right") {
      column.pinOffset = end; end += column.renderWidth;
    }
    this.pinnedLeftWidth = start; this.pinnedRightWidth = end;
    this.cols.forEach((column, index) => this.applyColumnPin(this.headCells[index], column));
    for (const row of [...this.rendered.values(), ...this.pool]) if (row._kind === "node")
      this.cols.forEach((column, index) => { if (row.children[index]) this.applyColumnPin(row.children[index], column); });
    const active = document.activeElement;
    if (active && this.headRow.contains(active)) this.focusReportingHeader(active);
    const cell = active && active.closest(".cx-cell");
    if (cell && this.canvas.contains(cell)) this.revealInRow(cell, active, false);
  };
  DataGrid.prototype.applyColumnPin = function (cell, column) {
    const pin = column.effectivePin || "none";
    if (pin === "none") cell.removeAttribute("data-cx-pin"); else cell.setAttribute("data-cx-pin", pin);
    cell.style.left = pin === "left" ? column.pinOffset + "px" : "";
    cell.style.right = pin === "right" ? column.pinOffset + "px" : "";
  };
  DataGrid.prototype.newCell = function (index, width, kind) {
    const cell = PLACEMENT_CELL.call(this, index, width, kind);
    if (kind && this.cols[index]) this.applyColumnPin(cell, this.cols[index]); return cell;
  };
