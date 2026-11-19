  // ---------- rows from an address: an inline grid whose static page reads its rows as JSON (docs/data-protocol.md) ----------
  // source.url names the address; the url-rows part reads it with the grid's first query (see that part for the rules).
  /** An http(s) or relative address, or null: never another scheme, a host-relative //address, control characters or backslashes. */
  function gridRowsAddress(raw) {
    if (typeof raw !== "string" || !raw.trim() || raw.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(raw) || /^\s*\/\//.test(raw)) return null;
    try { const url = new URL(raw.trim(), document.baseURI); return /^\s*[a-z][a-z\d+.-]*:/i.test(raw) && !["http:", "https:"].includes(url.protocol) ? null : url.href; }
    catch (_) { return null; }
  }
  const GRID_URL_IMPL = {}, GRID_URL_ROWS = definePart(DataGrid, "url-rows", "rows from an address",
    () => ({ GRID_URL_IMPL, validateGridRows, repairGridCell, inlineGridSource, gridQueryStart, gridRowsAddress }));
  function gridUrlRows(grid) {
    let inner = null;
    const source = { reset: () => { inner = null; }, query: (query, options) =>
      (inner ||= loadPart(GRID_URL_ROWS).then(() => GRID_URL_IMPL.source(grid, source)).catch(error => { inner = null; throw error; })).then(rows => rows.query(query, options)) };
    return source;
  }
