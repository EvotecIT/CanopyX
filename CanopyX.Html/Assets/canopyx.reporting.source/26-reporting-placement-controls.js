  // ---------- stable layout order and user controls ----------

  function reportingColumnOrder(columns) { return ["left", "none", "right"].flatMap(pin => columns.filter(column => column.pin === pin)); }
  const PLACEMENT_HEADER = DataGrid.prototype.buildHeader, PLACEMENT_MOVE = DataGrid.prototype.moveReportingColumn;
  DataGrid.prototype.buildHeader = function () {
    this.columns = reportingColumnOrder(this.columns); return PLACEMENT_HEADER.call(this);
  };
  DataGrid.prototype.moveReportingColumn = function (column, target, after) {
    column.pin = target.pin; return PLACEMENT_MOVE.call(this, column, target, after);
  };
  DataGrid.prototype.setColumnVisible = function (id, visible) {
    const column = this.columns.find(item => item.id === id);
    if (!column || typeof visible !== "boolean") throw new Error("CanopyX: visibility needs a declared column and boolean.");
    if (!visible && !column.hidden && this.columns.filter(item => !item.hidden).length === 1) throw new Error("CanopyX: keep at least one column visible.");
    const held = this.heldCell(), columnId = held && this.cols[held.index] && this.cols[held.index].id;
    column.hidden = !visible; this.buildHeader(); this.syncColumnControls(); this.render(); this.restoreReportingFocus(held, columnId); this.stateChanged();
  };
