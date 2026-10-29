  // Planning extends the optional resource timeline and leaves the ordinary calendar untouched.
  const GRID_PLAN = definePart(DataGrid, "plan", "plan view", () => ({ DataGrid, h, setText, fill, cellValue, cellText, gridFreeze }));
  const GRID_PLAN_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const start = () => GRID_PLAN_INIT.call(this);
    return this.view.plan ? loadPart(GRID_PLAN).then(async () => {
      this.validatePlanDefinition(); const result = await start();
      if (this.view.rowData && !this.opts.source) { await this.source.decoded; this.validatePlanDefinition(true); }
      return result;
    }) : start();
  };
