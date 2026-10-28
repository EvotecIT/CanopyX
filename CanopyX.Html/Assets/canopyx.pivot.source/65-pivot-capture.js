  // The reporting delivery owner decorates requests; the frozen descriptor retains the private table ownership.
  const PIVOT_EXPORT_ROWS = new WeakMap(), PIVOT_EXPORT_OWNERS = new WeakMap(), PIVOT_EXPORT_BASE = DataGrid.prototype.exportRows;
  GRID_PIVOT.prepareExport = (grid, options) => {
    if (options.pivot !== true || options.scope !== "filtered" || options.columns !== undefined)
      throw new Error("CanopyX: pivot table capture needs filtered scope and the complete pivot columns.");
    if (options.values !== undefined && !["raw", "display"].includes(options.values)) throw new Error("CanopyX: export values must be raw/display.");
    if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw new Error("CanopyX: export requires AbortSignal.");
    const presentation = Object.create(grid);
    presentation.lang = options.locale || grid.lang; presentation.local = (options.timeZone || (grid.local ? "local" : "utc")) === "local";
    presentation.fmt = formatting(presentation.lang, presentation.local, grid.labels);
    const snapshot = grid.pivotExport.call(presentation);
    const { definition, rowAxis, columnAxis, columnGroups, distinctColumns, retainedColumns, columnsLimited } = snapshot;
    const pivot = gridFreeze({ definition, rowAxis, columnAxis, columnGroups, distinctColumns, retainedColumns, columnsLimited });
    const request = gridFreeze({ scope: "filtered", query: snapshot.query, revision: snapshot.query.revision,
      total: grid.snapshot.total, matched: snapshot.matched, recordCount: snapshot.rows.length, selection: [], columns: snapshot.columns,
      presentation: "semantic", values: options.values || "display", timeZone: presentation.local ? "local" : "utc", formatRules: [], pivot });
    if (!PIVOT_EXPORT_OWNERS.has(grid)) PIVOT_EXPORT_OWNERS.set(grid, Symbol());
    PIVOT_EXPORT_ROWS.set(pivot, { owner: PIVOT_EXPORT_OWNERS.get(grid), rows: snapshot.rows, query: request.query, revision: request.revision, columns: request.columns,
      projection: GRID_CALCULATIONS.revision?.(grid.view) });
    return Object.freeze({ request, rows: extra => grid.exportRows(request, gridExportSignal(options.signal, extra)) });
  };
  DataGrid.prototype.exportRows = async function* (request, signal) {
    if (!request.pivot) { yield* PIVOT_EXPORT_BASE.call(this, request, signal); return; }
    const capture = PIVOT_EXPORT_ROWS.get(request.pivot);
    if (!capture || capture.owner !== PIVOT_EXPORT_OWNERS.get(this) || request.scope !== "filtered" || request.query !== capture.query || request.revision !== capture.revision ||
        request.columns !== capture.columns || request.recordCount !== capture.rows.length) throw new Error("CanopyX: pivot table capture ownership differs.");
    const active = () => {
      gridOperationActive(this, signal);
      if (this.snapshot.revision !== capture.revision || GRID_CALCULATIONS.revision?.(this.view) !== capture.projection)
        throw new Error("CanopyX: pivot table capture revision changed; capture it again.");
    };
    for (const row of capture.rows) { active(); yield row; }
    active();
  };
