  // ---------- inline row actions come with a part (docs/row-actions.md) ----------
  // A view's rowActions adds the grid's own actions column at the end edge: buttons and a More menu that raise host
  // proposals. The column belongs to the grid, so the source, queries, exports, the record drawer and the static renderer
  // never see it. Its cells stay empty until canopyx-row-actions.js is in, which also carries the rowAction… labels; a grid
  // with row actions loads the part with its first query. requestRowAction loads the part first; cancelRowAction answers
  // false until then.
  const GRID_ROW_ACTIONS = definePart(DataGrid, "row-actions", "row actions", () => ({ DataGrid, UI_IMPL, h, setText, fill, gridFreeze, gridIcon,
    svgIcon, cellValue, foldText, boundedPattern, wildcardMatch, requireIdentifier, gridQueryStart, MAX_PROTOCOL_INTEGER }));
  /** The actions column: as wide as its inline buttons and the More button; the part validates the definition. */
  function gridRowActionColumn(grid) {
    const spec = grid.view.rowActions, total = spec.actions?.length || 0, inline = spec.inline ?? 2;
    return { id: "cx-row-actions", title: spec.label || grid.labels.rowActionColumn || "Actions", kind: "text", width: 16 + 30 * Math.max(1, Math.min(total, inline + (total > inline + 1))),
      fixed: true, alwaysVisible: true, exportable: false, filterable: false, drawer: false, pin: spec.pin || "right", rowActions: true, hostRenderer: false,
      render: (row, element) => !!grid.paintRowActions?.(row, element) };
  }
  Object.assign(DataGrid.prototype, {
    loadRowActions() { return this.rowActionLoad ||= loadPart(GRID_ROW_ACTIONS).then(() => this.destroyed || this.startRowActions()).catch(error => { this.rowActionLoad = null; throw error; }); },
    requestRowAction(...args) { return this.loadRowActions().then(() => this.requestRowAction(...args)); },
    cancelRowAction() { return false; }
  });
  const GRID_ROW_ACTIONS_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const ready = GRID_ROW_ACTIONS_INIT.call(this);
    return this.view.rowActions ? Promise.all([ready, this.loadRowActions().catch(error => this.emit("error", { error }))]).then(([result]) => result) : ready;
  };
