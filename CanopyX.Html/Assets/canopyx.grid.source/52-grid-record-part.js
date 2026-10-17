  // ---------- flat grids: the record panel part ----------
  // The part (87-record-part.js) is one definition for trees and flat grids; a flat grid's runtime hands it the grid helpers.
  // A grid with a structured summary column loads it with its first query (as the history presenters do), a grid whose view
  // declares a record panel when its drawer first opens, and a grid with record deep links once its first rows are ready.
  DataGrid.prototype.parts["record-panel"] = RECORD_PART;
  RECORD_IMPL.grid = { DataGrid, gridCellRenderer, createDataGrid, gridFreeze, gridQuery, gridResultShape, validatePresenter: gridPresenter };
  DataGrid.prototype.openRecord = TreeGrid.prototype.openRecord;
  DataGrid.prototype.loadRecordPanel = function () {
    return this.recordLoad ||= loadRecordPanel().then(() => { this.version++; this.scheduleRender(); }, error => this.emit("error", { error }));
  };
  /** Whether a record's drawer needs the part: a declared record panel, a structured summary column or a structured cell. */
  DataGrid.prototype.recordNeeded = function (row) {
    return !!this.view.record || this.columns.some(column => column.presenter?.kind === "structured") ||
      !!row && Object.values(row.cells).some(cell => isCellObject(cell) && RECORD_STRUCTURE.some(name => cell[name] !== undefined));
  };
  const GRID_RECORD_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const ready = GRID_RECORD_INIT.call(this);
    return this.columns.some(column => column.presenter?.kind === "structured") ? Promise.all([ready, this.loadRecordPanel()]).then(([result]) => result) : ready;
  };
