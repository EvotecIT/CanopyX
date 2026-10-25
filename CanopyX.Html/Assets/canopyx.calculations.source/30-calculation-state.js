  const CALCULATION_STATE = { get: DataGrid.prototype.getState, read: DataGrid.prototype.readGridState, set: DataGrid.prototype.setState };
  const CALCULATION_EXPORT_ROWS = DataGrid.prototype.exportRows;
  DataGrid.prototype.exportRows = async function* (request, signal) {
    const revision = GRID_CALCULATIONS.revision(this.view), changed = () => { throw new Error("CanopyX: calculated columns changed during export; capture it again."); };
    if (revision && request.revision !== revision) changed();
    for await (const record of CALCULATION_EXPORT_ROWS.call(this, request, signal)) {
      if (GRID_CALCULATIONS.revision(this.view) !== revision) changed();
      yield record;
    }
  };
  Object.assign(DataGrid.prototype, {
    getCalculatedColumns() { return GRID_CALCULATIONS.definitions(this.view); },
    getState() {
      const state = CALCULATION_STATE.get.call(this);
      if (this.view.calculatedColumnsEditable) state.calculatedColumns = calculationDefinitions(this.view);
      return state;
    },
    readGridState(input) {
      if (!this.view.calculatedColumnsEditable) {
        if (input.calculatedColumns !== undefined) throw new Error("CanopyX: this view does not allow saved calculated columns.");
        return CALCULATION_STATE.read.call(this, input);
      }
      const definitions = input.calculatedColumns || calculationDefinitions({ columns: this.calculationAuthoredColumns || this.view.columns.filter(column => column.calculation !== undefined) }),
        columns = calculationColumns(this, definitions), state = calculationProspective(this, columns, () => CALCULATION_STATE.read.call(this, input));
      state.calculatedColumns = JSON.parse(JSON.stringify(definitions)); return state;
    },
    async setState(input) {
      if (this.view.calculatedColumnsEditable) {
        const state = this.readGridState(input), columns = calculationColumns(this, state.calculatedColumns);
        if (this.source.decoded) await this.source.decoded;
        calculationInstall(this, columns);
      }
      return CALCULATION_STATE.set.call(this, input);
    },
    async setCalculatedColumns(definitions) {
      if (!this.view.calculatedColumnsEditable || this.view.source.kind !== "inline") throw new Error("CanopyX: calculated-column editing is not enabled.");
      const columns = calculationColumns(this, definitions), query = calculationProspective(this, columns, () => gridQuery(this.view, gridQueryStart(this.queryForChange(true))));
      if (this.source.decoded) await this.source.decoded;
      calculationInstall(this, columns); this.noteViewPreferenceIntent?.();
      await this.setQuery(query); this.stateChanged(); this.emit("calculations", { columns: this.getCalculatedColumns() });
      return this.getCalculatedColumns();
    }
  });
