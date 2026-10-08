  // ---------- optional width policies and saved flex intent ----------
  const LAYOUT_VALIDATE = GRID_REPORTING.validate, LAYOUT_PREPARE = DataGrid.prototype.prepareState;
  GRID_REPORTING.api = (api, grid) => { api.autoFitColumn = id => GRID_REPORTING.fitColumn(grid, id); };
  function reportingLayout(grid, column) {
    const declared = column.kind ? column : grid.columns.find(item => item.id === column.id) || column, policy = grid.columnLayouts.get(column.id) || {};
    return { minimum: declared.minWidth ?? policy.minimum ?? 40, maximum: declared.maxWidth ?? policy.maximum ?? MAX_COLUMN_WIDTH,
      flex: declared.flexWeight ?? (typeof declared.flex === "number" ? declared.flex : policy.flex || 0),
      priority: declared.priority === undefined ? policy.priority : gridRank(declared),
      alwaysVisible: declared.alwaysVisible ?? policy.alwaysVisible,
      pin: declared.pinned === undefined ? policy.pin : declared.pinned || "none" };
  }
  function reportingWidth(grid, column, width) {
    const policy = reportingLayout(grid, column); return Math.min(policy.maximum, Math.max(policy.minimum, width));
  }

  GRID_REPORTING.validate = view => {
    LAYOUT_VALIDATE(view);
    const options = view.reporting;
    if (options.columnReorder !== undefined && typeof options.columnReorder !== "boolean") throw new Error("CanopyX: columnReorder must be boolean.");
    if (options.layout === undefined) return;
    if (!options.layout || typeof options.layout !== "object" || Array.isArray(options.layout)) throw new Error("CanopyX: layout is keyed by column ID.");
    for (const [id, policy] of Object.entries(options.layout)) {
      const column = view.columns.find(item => item && item.id === id);
      if (!column || !policy || typeof policy !== "object" || Array.isArray(policy) ||
          !Number.isInteger(policy.minimum) || policy.minimum < 40 || !Number.isInteger(policy.maximum) ||
          policy.maximum < policy.minimum || policy.maximum > MAX_COLUMN_WIDTH ||
          policy.flex !== undefined && (!Number.isFinite(policy.flex) || policy.flex < 0 || policy.flex > 100) ||
          column.width !== undefined && (column.width < policy.minimum || column.width > policy.maximum))
        throw new Error("CanopyX: invalid column layout or initial width.");
    }
  };

  DataGrid.prototype.prepareState = function () {
    this.columnLayouts = new Map(Object.entries(this.view.reporting && this.view.reporting.layout || {}).map(([id, policy]) =>
      [id, Object.assign({ flex: 0 }, policy)]));
    for (const column of this.columns) {
      column.presenter ??= this.view.reporting?.presenters?.[column.id];
      const policy = this.columnLayouts.get(column.id);
      if (policy) {
        column.minWidth ??= policy.minimum; column.maxWidth ??= policy.maximum;
        column.flex ??= policy.flex; column.alwaysVisible ??= policy.alwaysVisible;
      }
    }
    return LAYOUT_PREPARE.call(this);
  };
  const LAYOUT_STATE_COLUMN = gridStateColumn, LAYOUT_STATE_COLUMNS = gridStateColumns;
  gridStateColumn = column => Object.assign(LAYOUT_STATE_COLUMN(column), column.flex === undefined ? {} : { flex: column.flex });
  gridStateColumns = (grid, input) => {
    const result = LAYOUT_STATE_COLUMNS(grid, input), sources = new Map(input.map(column => [column.id, column]));
    for (const saved of result) {
      const source = sources.get(saved.id) || saved, column = grid.columns.find(item => item.id === saved.id);
      if (source.flex !== undefined && typeof source.flex !== "boolean") throw new Error("CanopyX: saved flex must be boolean.");
      saved.width = reportingWidth(grid, column, saved.width);
      if (reportingLayout(grid, column).flex > 0) saved.flex = source.flex === undefined ? true : source.flex;
    }
    return result;
  };
