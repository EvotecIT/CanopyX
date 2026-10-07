  // ---------- desired placement and responsive intent are separate from effective geometry ----------
  const COLUMN_PINS = ["none", "left", "right"], PLACEMENT_VALIDATE = GRID_REPORTING.validate,
    PLACEMENT_PREPARE = DataGrid.prototype.prepareState, PLACEMENT_STATE_COLUMN = gridStateColumn,
    PLACEMENT_STATE_COLUMNS = gridStateColumns, PLACEMENT_API = GRID_REPORTING.api;

  GRID_REPORTING.validate = view => {
    PLACEMENT_VALIDATE(view);
    const options = view.reporting;
    if (options.responsive !== undefined && typeof options.responsive !== "boolean" || options.minimumCenterWidth !== undefined &&
        (!Number.isInteger(options.minimumCenterWidth) || options.minimumCenterWidth < 40 || options.minimumCenterWidth > 4096))
      throw new Error("CanopyX: invalid responsive flag or minimum center width.");
    for (const policy of Object.values(options.layout || {})) {
      if (policy.pin !== undefined && !COLUMN_PINS.includes(policy.pin) || policy.priority !== undefined &&
          (!Number.isInteger(policy.priority) || policy.priority < 0 || policy.priority > MAX_PROTOCOL_INTEGER) ||
          policy.alwaysVisible !== undefined && typeof policy.alwaysVisible !== "boolean")
        throw new Error("CanopyX: invalid reporting placement policy.");
    }
  };
  DataGrid.prototype.prepareState = function () {
    const policies = this.view.reporting && this.view.reporting.layout || {};
    for (const column of this.columns) column.pin = policies[column.id]?.pin ?? column.pin;
    return PLACEMENT_PREPARE.call(this);
  };
  gridStateColumn = column => Object.assign(PLACEMENT_STATE_COLUMN(column), { pin: column.pin });
  gridStateColumns = (grid, input) => {
    const result = PLACEMENT_STATE_COLUMNS(grid, input), sources = new Map(input.map(column => [column.id, column]));
    for (const saved of result) {
      const source = sources.get(saved.id) || saved;
      if (source.pin !== undefined && !COLUMN_PINS.includes(source.pin)) throw new Error("CanopyX: invalid saved column pin.");
      saved.pin = source.pin === undefined ? reportingLayout(grid, saved).pin || "none" : source.pin;
    }
    return result;
  };
  GRID_REPORTING.api = (api, grid) => {
    PLACEMENT_API(api, grid);
    api.setColumnPinned = (id, pin) => grid.setColumnPinned(id, pin);
    api.getColumnLayout = () => grid.columns.map(column => Object.freeze({ id: column.id, requestedPin: column.pin,
      pin: column.effectivePin || "none", visible: !column.hidden && !column.responsiveHidden,
      responsiveHidden: !!column.responsiveHidden, width: column.renderWidth || column.width }));
  };

  DataGrid.prototype.setColumnPinned = function (id, pin) {
    const column = this.columns.find(item => item.id === id);
    if (this.destroyed || !column || !COLUMN_PINS.includes(pin)) throw new Error("CanopyX: pin needs a live grid, declared column and none, left or right.");
    if (this.cancelResize) this.cancelResize();
    const held = this.heldCell(), columnId = held && this.cols[held.index] && this.cols[held.index].id;
    column.pin = pin; this.buildHeader(); this.syncColumnControls(); this.render();
    this.restoreReportingFocus(held, columnId); this.stateChanged(); this.emit("columnPin", { column: id, pin });
  };
