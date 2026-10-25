  // Explicit paths reuse grid records and the shared record panel; ordinary grids carry only this lazy shell.
  const GRID_PATH = definePart(DataGrid, "path", "path view", () => ({ DataGrid, h, setText, fill, cellValue, cellText,
    badgeElement, applyTone, toneOf, PROTOCOL }));
  const GRID_PATH_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const start = () => this.destroyed ? undefined : GRID_PATH_INIT.call(this);
    return this.view.path ? loadPart(GRID_PATH).then(() => { if (!this.destroyed) this.validatePathSource(); }).then(start).then(async result => {
      if (!this.destroyed) await this.startPath();
      return result;
    }) : start();
  };
