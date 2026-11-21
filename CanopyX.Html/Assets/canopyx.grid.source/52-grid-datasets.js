  // ---------- shared datasets: several views read one set of rows (docs/datasets.md) ----------
  // A flat grid names a dataset with source.dataset. The datasets part reads, decodes and validates its rows once for every
  // view, shares them and replaces them; a view's queries and the page's CanopyX.dataset calls wait for it. A hosted dataset's
  // source comes from CanopyX.defineDataset before its views mount, so a hosted view takes it at once.
  const GRID_DATASET_DEFS = new Map(), GRID_DATASETS_IMPL = {}, GRID_DATASETS = definePart(DataGrid, "datasets", "shared datasets",
    () => ({ GRID_DATASETS_IMPL, GRID_DATASET_DEFS, PROTOCOL, requireIdentifier, validateGridRows, repairGridCell, inlineGridSource, gridRowsAddress,
      gridYield, loadPart, GRID_DATA, GRID_DATA_IMPL, GRID_URL_ROWS, GRID_URL_IMPL }));
  const gridDatasets = () => loadPart(GRID_DATASETS);
  function gridDatasetSource(grid) {
    const id = grid.view.source.dataset;
    if (grid.view.source.kind === "host") {
      const source = GRID_DATASET_DEFS.get(id)?.source;
      if (typeof source?.query !== "function") throw new Error("CanopyX: hosted dataset " + id + " has no source; give it one with CanopyX.defineDataset before the grid mounts.");
      gridDatasets().then(() => GRID_DATASETS_IMPL.attach(grid)).catch(error => grid.emit("error", { error }));
      return source;
    }
    let inner = null, loaded = null;
    const reader = () => inner ||= gridDatasets().then(() => loaded = GRID_DATASETS_IMPL.source(grid)).catch(error => { inner = null; throw error; });
    const source = { query: (query, options) => reader().then(rows => rows.query(query, options)),
      position: (query, row) => loaded ? loaded.position(query, row) : -1, row: row => loaded ? loaded.row(row) : null,
      invalidate: () => loaded?.invalidate(), datasetChanged: () => loaded?.changed() };
    if (grid.view.reporting?.facetColumns?.length) source.facet = (request, options) => reader().then(rows => rows.facet(request, options));
    return source;
  }
  /** The page's handle on a dataset: its rows once read, replacing them, reading its address again, and the views that read it. */
  function gridDataset(id) {
    requireIdentifier(id, "dataset ID");
    const run = name => (...args) => gridDatasets().then(() => GRID_DATASETS_IMPL[name](id, ...args));
    return Object.freeze({ id, ready: run("ready"), setRows: run("setRows"), refresh: run("refresh"),
      getRows: () => GRID_DATASETS_IMPL.rows?.(id) ?? null, views: () => GRID_DATASETS_IMPL.views?.(id) ?? [] });
  }
  /** Defines a dataset from the page's script before its views mount, or gives a hosted dataset the page declares its source. */
  function gridDefineDataset(definition) {
    requireIdentifier(definition?.id, "dataset ID");
    if (GRID_DATASET_DEFS.has(definition.id)) throw new Error("CanopyX: dataset " + definition.id + " is already defined.");
    if (definition.kind === "host" && typeof definition.source?.query !== "function") throw new Error("CanopyX: a hosted dataset needs a source with a query function.");
    GRID_DATASET_DEFS.set(definition.id, Array.isArray(definition.rows) ? { ...definition, rows: structuredClone(definition.rows) } : { ...definition });
    return gridDataset(definition.id);
  }
