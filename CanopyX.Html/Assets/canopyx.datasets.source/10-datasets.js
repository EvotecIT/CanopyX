  // ---------- datasets part: one set of rows for several views (docs/datasets.md) ----------
  // A dataset comes from the page's .cx-dataset element (CanopyDataset.ToHtmlFragment) or from CanopyX.defineDataset. Its
  // rows are read, decoded and validated once, against the dataset's own columns, and every view keeps the same row objects:
  // grids, pivots and record panels over one dataset cost one copy of the rows. Views read the rows and never change them; a
  // change replaces them (setRows, an address read again) and every view runs its own query again over the new rows, at its
  // place. A hosted dataset shares its host source; each view still asks its own queries.
  const DATASET_KEYS = ["protocol", "type", "id", "kind", "columns", "rows", "rowData", "url", "refreshSeconds", "source"];
  const DATASET_SLICE = 256, DATASET_SLICE_MS = 8, DATASET_TIMEOUT_MS = 30000;
  const datasetEntries = new Map();

  /** Checks a dataset document, or a definition from the page's script, which may also carry a hosted dataset's source. */
  function datasetEntry(raw, element) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(key => !DATASET_KEYS.includes(key)) ||
        raw.protocol !== undefined && raw.protocol !== PROTOCOL || raw.type !== undefined && raw.type !== "dataset")
      throw new Error("CanopyX: invalid dataset.");
    requireIdentifier(raw.id, "dataset ID");
    const kind = raw.kind ?? "inline", columns = raw.columns ?? [], ids = new Set();
    if (!["inline", "host"].includes(kind) || !Array.isArray(columns) || kind === "inline" && !columns.length ||
        columns.some(column => !column || typeof column !== "object" || ids.has(column.id) || !["text", "number", "datetime"].includes(column.kind) || !ids.add(column.id)))
      throw new Error("CanopyX: dataset " + raw.id + " needs unique columns with a text, number or datetime kind.");
    columns.forEach(column => requireIdentifier(column.id, "dataset column ID"));
    // A page's dataset element may name a hosted dataset; the page's script gives it its source with defineDataset.
    const carried = ["rows", "rowData", "url"].filter(key => raw[key] !== undefined);
    if (kind === "inline" ? carried.length !== 1 || raw.source !== undefined : carried.length || (element ? raw.source !== undefined : typeof raw.source?.query !== "function"))
      throw new Error("CanopyX: dataset " + raw.id + " has rows, rowData or url when inline, and a host source when hosted.");
    if (raw.url !== undefined && !gridRowsAddress(raw.url) || raw.refreshSeconds !== undefined &&
        (raw.url === undefined || !Number.isInteger(raw.refreshSeconds) || raw.refreshSeconds < 5 || raw.refreshSeconds > 86400))
      throw new Error("CanopyX: invalid dataset address or refresh.");
    if (raw.rows !== undefined && !Array.isArray(raw.rows)) throw new Error("CanopyX: dataset rows must be an array.");
    return { id: raw.id, kind, columns: columns.map(column => ({ id: column.id, kind: column.kind })), definition: raw, element,
      source: raw.source || null, rows: null, generation: 0, loading: null, grids: new Set() };
  }

  /** The dataset with an id, read on first use: the page's element (with a source the page's script gave it) or a definition. */
  function datasetLookup(id) {
    if (datasetEntries.has(id)) return datasetEntries.get(id);
    const element = [...document.querySelectorAll("div.cx-dataset[data-cx-dataset]")].find(item => item.dataset.cxDataset === id);
    const config = element?.querySelector(":scope>script.cx-config"), defined = GRID_DATASET_DEFS.get(id);
    let entry = null;
    if (config) {
      entry = datasetEntry(JSON.parse(config.textContent), element);
      if (entry.id !== id) throw new Error("CanopyX: the dataset element " + id + " holds dataset " + entry.id + ".");
      if (defined && (entry.kind !== "host" || defined.kind !== "host")) throw new Error("CanopyX: dataset " + id + " is defined twice.");
      if (defined) { entry.source = defined.source; if (!entry.columns.length) entry.columns = datasetEntry(defined, null).columns; }
    } else if (defined) entry = datasetEntry(defined, null);
    if (entry) datasetEntries.set(id, entry);
    return entry;
  }
  function datasetRequire(id) {
    const entry = datasetLookup(id);
    if (!entry) throw new Error("CanopyX: no dataset " + id + " on the page.");
    return entry;
  }

  /** Decodes compact rows completely, validated against the dataset's columns, in slices that yield to the page. */
  async function datasetDecode(data, columns, read) {
    GRID_DATA_IMPL.checkRowData(data, new Set(columns.map(column => column.id)), false);
    const rows = [], ids = new Set(), expand = GRID_DATA_IMPL.compactExpander(data.columns), total = Array.isArray(data.chunks) ? data.chunks.length : data.chunks;
    for (let index = 0; index < total && rows.length <= data.count; index++) {
      let chunk = await read(index);
      if (typeof chunk === "string") chunk = JSON.parse(data.encoding ? await GRID_DATA_IMPL.inflateRows(chunk) : chunk);
      if (!Array.isArray(chunk)) throw new Error("CanopyX: a row data chunk is not an array of rows.");
      let started = performance.now();
      for (let from = 0; from < chunk.length; from += DATASET_SLICE) {
        for (const row of validateGridRows(chunk.slice(from, from + DATASET_SLICE).map(expand), columns, ids, repairGridCell)) rows.push(row);
        if (performance.now() - started > DATASET_SLICE_MS) { await gridYield(); started = performance.now(); }
      }
    }
    expand.release();
    if (rows.length !== data.count) throw new Error("CanopyX: row data holds " + rows.length + " rows, not " + data.count + ".");
    return rows;
  }

  /** Reads, decodes and validates the rows once; every view waits for the same promise, and a failure lets the next read retry. */
  function datasetLoad(entry) {
    if (entry.kind === "host") return Promise.resolve(entry);
    return entry.loading ||= (async () => {
      const raw = entry.definition;
      if (raw.rows) entry.rows = validateGridRows(raw.rows, entry.columns, undefined, repairGridCell);
      else if (raw.rowData) {
        await loadPart(GRID_DATA);
        const scripts = entry.element ? [...entry.element.querySelectorAll(':scope>script[type="application/x-canopyx-rows"]')] : [], chunks = raw.rowData.chunks;
        if (!Array.isArray(chunks) && scripts.length !== chunks) throw new Error("CanopyX: dataset " + entry.id + " has " + scripts.length + " row data scripts, not " + chunks + ".");
        entry.rows = await datasetDecode(raw.rowData, entry.columns, index => Array.isArray(chunks) ? chunks[index] : scripts[index].textContent);
        // The decoded rows are the only copy kept: the chunks' text is released.
        scripts.forEach(script => { script.textContent = ""; });
      } else {
        await loadPart(GRID_URL_ROWS);
        entry.rows = await GRID_URL_IMPL.read(raw.url, entry.columns, DATASET_TIMEOUT_MS, null);
        if (raw.refreshSeconds) setInterval(() => datasetRead(entry, true).catch(() => {}), raw.refreshSeconds * 1000);
      }
      entry.definition = { ...raw, rows: undefined, rowData: undefined };
      entry.generation++;
      return entry;
    })().catch(error => { entry.loading = null; throw error; });
  }

  /** Gives every view the new rows: each runs its accepted query again over them. */
  function datasetChanged(entry) {
    entry.generation++;
    for (const grid of entry.grids) grid.source.datasetChanged?.();
  }

  /** Reads an address again; a timed read skips a hidden page, a dataset no view reads, and a read still running. */
  async function datasetRead(entry, timed) {
    if (timed && (document.hidden || !entry.grids.size || entry.reading)) return;
    entry.reading = true;
    try { entry.rows = await GRID_URL_IMPL.read(entry.definition.url, entry.columns, DATASET_TIMEOUT_MS, null); datasetChanged(entry); }
    finally { entry.reading = false; }
  }

  /** A view's columns must be dataset columns of the same kind: the rows were validated against the dataset's. */
  function datasetAttach(entry, grid) {
    const view = grid.view;
    if (entry.kind !== view.source.kind) throw new Error("CanopyX: grid " + view.id + " and dataset " + entry.id + " differ in kind.");
    const kinds = new Map(entry.columns.map(column => [column.id, column.kind]));
    if (kinds.size) for (const column of view.columns) {
      if (!kinds.has(column.id)) throw new Error("CanopyX: column " + column.id + " of grid " + view.id + " is not in dataset " + entry.id + ".");
      if (kinds.get(column.id) !== column.kind) throw new Error("CanopyX: column " + column.id + " of grid " + view.id + " has another kind than in dataset " + entry.id + ".");
    }
    if (!entry.grids.has(grid)) { entry.grids.add(grid); grid.lifetime.signal.addEventListener("abort", () => entry.grids.delete(grid), { once: true }); }
    return entry;
  }

  /** The inline queries of a grid over a dataset's shared rows. Every new set of rows is a new revision. */
  function datasetSource(grid) {
    const view = grid.view, id = view.source.dataset;
    let base = null, revision = null, loading = null;
    const accept = entry => { view.rows = entry.rows; base = inlineGridSource(view); revision = "dataset-" + entry.generation; };
    // A failed read fails the query that waits for it, and its Retry reads again.
    const ready = () => loading ||= Promise.resolve().then(() => datasetLoad(datasetAttach(datasetRequire(id), grid))).then(entry => {
      if (grid.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
      if (!base) accept(entry);
    }, error => { loading = null; throw error; });
    const stamp = async page => ({ ...await page, revision });
    return {
      query: (query, options) => ready().then(() => stamp(base.query(query, options))),
      facet: (request, options) => ready().then(() => stamp(base.facet(request, options))),
      position: (query, row) => base ? base.position(query, row) : -1, row: row => base ? base.row(row) : null,
      invalidate: () => { if (base) base = inlineGridSource(view); },
      changed() {
        if (grid.destroyed || !base) return;
        accept(datasetRequire(id));
        // The grouping part keeps the summary of a query and revision; the rows changed under the same view.
        grid.summaryCandidate = null;
        if (!grid.acceptedQuery) return;
        const query = grid.queryForChange(true), queued = query.search !== grid.acceptedQuery.search;
        grid.setQuery({ ...query, offset: grid.paged && !queued ? grid.pageOffset : 0, revision: undefined })
          .catch(error => { if (error?.name !== "AbortError") grid.emit("error", { error }); });
      }
    };
  }

  Object.assign(GRID_DATASETS_IMPL, {
    source: datasetSource,
    attach: grid => datasetAttach(datasetRequire(grid.view.source.dataset), grid),
    ready: id => datasetLoad(datasetRequire(id)).then(() => undefined),
    rows: id => datasetEntries.get(id)?.rows ?? null,
    views: id => [...datasetEntries.get(id)?.grids || []].map(grid => grid.host.canopyx).filter(Boolean),
    async setRows(id, rows) {
      const entry = datasetRequire(id);
      if (entry.kind === "host") throw new Error("CanopyX: a hosted dataset's rows change at its source; call refresh().");
      await datasetLoad(entry);
      entry.rows = validateGridRows(structuredClone(rows), entry.columns);
      datasetChanged(entry);
    },
    async refresh(id) {
      const entry = datasetRequire(id);
      if (entry.kind === "host") { await Promise.all([...entry.grids].map(grid => grid.host.canopyx?.reload())); return; }
      if (!entry.definition.url) throw new Error("CanopyX: dataset " + id + " carries its rows; replace them with setRows.");
      await datasetLoad(entry);
      await datasetRead(entry, false);
    }
  });
