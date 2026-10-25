  // Ordinary grids carry only this shell. The optional part uses the shared record panel for every layer.
  const GRID_STACK = definePart(DataGrid, "stack", "stack view", () => ({ DataGrid, h, setText, fill, cellValue, cellText, badgeElement, applyTone, toneOf, PROTOCOL }));
  const GRID_STACK_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const start = () => GRID_STACK_INIT.call(this);
    return this.view.stack ? loadPart(GRID_STACK).then(start).then(async result => {
      if (this.view.rowData) await this.source.decoded;
      if (!this.destroyed) this.startStack();
      return result;
    }) : start();
  };
