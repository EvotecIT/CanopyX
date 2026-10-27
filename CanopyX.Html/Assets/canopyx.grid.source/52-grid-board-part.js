  // Board definitions load their optional renderer before the first query; ordinary grids carry only this shell.
  const GRID_BOARD = definePart(DataGrid, "board", "board view", () => ({ DataGrid, h, setText, fill, cellValue, cellText, gridScalar,
    gridQueryRows, gridQuery, validateGridPage, validateGridCursorPage, numberFormat, PROTOCOL }));
  const GRID_BOARD_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const start = () => GRID_BOARD_INIT.call(this);
    return this.view.board ? loadPart(GRID_BOARD).then(() => { if (!this.destroyed) this.startBoard(); }).then(start) : start();
  };
