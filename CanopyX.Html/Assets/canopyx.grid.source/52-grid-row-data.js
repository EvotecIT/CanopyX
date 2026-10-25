  // ---------- row data: compact inline rows come with the data part ----------
  // A grid whose view carries rowData instead of rows (docs/data-protocol.md, "Row data") loads canopyx-data.js with its
  // first query. The part decodes the chunks in slices that yield to the page, answers the first windows of an unsorted,
  // unfiltered query as soon as their chunks are decoded when the rows are in identity order, and every other query once
  // all rows are decoded. A failed load or decoding fails the query, and its retry starts over with a new decoding.
  const GRID_DATA_IMPL = {}, GRID_DATA = definePart(DataGrid, "data", "row data",
    () => ({ GRID_DATA_IMPL, PROTOCOL, validateGridRows, inlineGridSource, loadSidecar, gridIdOrder, gridInlineRevision }));
  function rowDataSource(grid) {
    let inner = null;
    const source = { reset: () => { inner = null; }, query: (query, options) =>
      (inner ||= loadPart(GRID_DATA).then(() => GRID_DATA_IMPL.source(grid, source)).catch(error => { inner = null; throw error; })).then(rows => rows.query(query, options)) };
    return source;
  }
