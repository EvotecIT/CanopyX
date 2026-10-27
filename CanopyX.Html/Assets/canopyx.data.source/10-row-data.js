  // ---------- row data: compact rows in chunks (docs/data-protocol.md, "Row data") ----------
  // The chunks come from rowData.chunks (an array), from the host's application/x-canopyx-rows scripts (a count), or from
  // sidecar files under rowData.base (a count, for bundles). Each is decoded, validated and appended in its own task, so
  // the page stays responsive and paints between chunks; a gzip chunk is base64 text inflated with DecompressionStream.
  const ROW_SCRIPTS = ':scope>script[type="application/x-canopyx-rows"]';
  const nextTask = () => globalThis.scheduler?.yield ? scheduler.yield() : new Promise(resolve => setTimeout(resolve));

  async function inflateRows(text) {
    if (typeof DecompressionStream !== "function") throw new Error("CanopyX: this browser cannot read compressed row data.");
    let bytes;
    if (Uint8Array.fromBase64) bytes = Uint8Array.fromBase64(text);
    else {
      const binary = atob(text);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    }
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }

  // outer is the grid's source (52-grid-row-data.js): reset() makes its next query, a retry, start a new decoding.
  function rowDataSource(grid, outer) {
    const view = grid.view, data = view.rowData, rows = view.rows, ids = new Set(), declared = new Set(view.columns.map(column => column.id));
    const columns = data.columns, chunks = data.chunks, sidecar = data.base !== undefined;
    if (data.version !== 1 || !Array.isArray(columns) || !columns.length || new Set(columns).size !== columns.length || columns.some(id => !declared.has(id)) ||
        ![undefined, "gzip"].includes(data.encoding) || ![undefined, true, false].includes(data.ordered) ||
        sidecar && typeof data.base !== "string" ||
        !(Array.isArray(chunks) ? !sidecar : Number.isInteger(chunks) && chunks >= 0))
      throw new Error("CanopyX: invalid grid rowData.");
    const scripts = !sidecar && !Array.isArray(chunks) ? grid.host.querySelectorAll(ROW_SCRIPTS) : null;
    const total = Array.isArray(chunks) ? chunks.length : chunks;
    if (scripts && scripts.length !== total) throw new Error("CanopyX: the grid has " + scripts.length + " row data scripts, not " + total + ".");
    const files = [];
    rows.length = 0;
    const read = index => Array.isArray(chunks) ? chunks[index] : sidecar ? files[index] ||= loadSidecar(data.base, view.id, "rows/" + index) : scripts[index].textContent;
    // A compact row is [id, cell, ...] in the order of rowData.columns, or [{ id, tone?, className? }, cell, ...]; trailing
    // empty cells may be left out, and null is an empty cell as in the object form.
    const expand = row => {
      if (!Array.isArray(row) || row.length > columns.length + 1) throw new Error("CanopyX: invalid compact grid row.");
      const key = row[0], cells = {};
      for (let c = 1; c < row.length; c++) {
        if (row[c] === undefined) throw new Error("CanopyX: compact grid cells cannot be undefined; use null for an empty cell.");
        // A column named __proto__ is an own property, as JSON.parse makes it in the object form.
        if (row[c] != null) columns[c - 1] === "__proto__" ? Object.defineProperty(cells, "__proto__", { value: row[c], enumerable: true, writable: true, configurable: true }) : cells[columns[c - 1]] = row[c];
      }
      if (key === null || typeof key !== "object") return { id: key, cells };
      const record = { id: key.id, cells };
      if (key.tone !== undefined) record.tone = key.tone;
      if (key.className !== undefined) record.className = key.className;
      return record;
    };
    let previous = null, finished = false, ordered = data.ordered === true, legacyOrder = false, advance, progress;
    const retirePrefix = () => {
      // Wire positions are invalid even if a replacement request later times out. Retire them before that request.
      grid.pages.clear(); grid.rowCache.clear(); grid.placeholders.clear(); grid.focused = null;
      if (grid.snapshot && !grid.pendingQuery) grid.setQuery(grid.queryForChange(true), { pageLength: grid.pageLength, allRows: grid.pageAll }).catch(() => {});
      grid.version++; grid.scheduleRender();
    };
    const waitForChunk = () => progress = new Promise(resolve => advance = resolve);
    waitForChunk();
    const done = (async () => {
      const active = () => { if (grid.destroyed) throw new DOMException("Grid was destroyed.", "AbortError"); };
      for (let index = 0; index < total; index++) {
        active();
        let chunk = await read(index);
        active();
        if (sidecar && index + 1 < total) read(index + 1).catch(() => {});
        if (typeof chunk === "string") {
          if (data.encoding) { chunk = await inflateRows(chunk); active(); }
          chunk = JSON.parse(chunk);
        }
        if (!Array.isArray(chunk)) throw new Error("CanopyX: a row data chunk is not an array of rows.");
        const decoded = validateGridRows(chunk.map(expand), view.columns, ids, repairGridCell);
        // Identity order puts canonical integer ids first, as numbers. Rows written by an older writer in plain code-unit order
        // are still read: from the first row out of order on, queries wait for every chunk, like unordered rows, and the windows
        // answered before it are drawn again in identity order when decoding finishes.
        if (ordered) for (const row of decoded) {
          if (previous !== null && gridIdOrder(previous, row.id) >= 0) {
            if (!(previous < row.id)) throw new Error("CanopyX: row data is not in its declared identity order.");
            ordered = false; legacyOrder = true;
            // setQuery retires page loads; an existing pending query has already done so and must keep its own promise.
            retirePrefix();
            break;
          }
          previous = row.id;
        }
        for (const row of decoded) rows.push(row);
        if (rows.length > data.count) break;
        files[index] = null;
        advance(); waitForChunk();
        await nextTask();
      }
      active();
      if (rows.length !== data.count) throw new Error("CanopyX: row data holds " + rows.length + " rows, not " + data.count + ".");
      // The grid's copies of chunks given in the document are released once all rows are decoded.
      finished = true; ids.clear();
      // A pending query may have expired while the final sidecar loaded. Retry the accepted query with the complete source,
      // dropping error pages too, while preserving a newer user query if one is still pending.
      if (legacyOrder) retirePrefix();
      if (Array.isArray(chunks)) chunks.fill(null);
      scripts?.forEach(script => { script.textContent = ""; });
      // The first ordered window may already be visible with only a prefix decoded. Refresh once with the complete rows.
      grid.version++; grid.scheduleRender();
    })();
    done.catch(() => outer.reset());
    // Whatever was worked out from the rows decoded so far (bounds of formatting bars and scales) is worked out again.
    done.then(() => { if (!grid.destroyed) { grid.version++; grid.scheduleRender?.(); } }, () => { });
    let complete = null;
    // Saved values invalidate the completed result cache while an active decoder keeps its remaining chunks.
    outer.invalidate = () => { complete = null; };
    const all = async () => { await done; return complete ||= inlineGridSource(view); };
    // Value lists of the column filters and a reporting grid's facets count the complete rows.
    outer.decoded = done;
    if (!Object.hasOwn(grid, "columnFacetItems")) grid.columnFacetItems = async function (...args) { await outer.decoded; return Object.getPrototypeOf(this).columnFacetItems.apply(this, args); };
    if (view.reporting?.facetColumns?.length) outer.facet = async (request, options) => (await all()).facet(request, options);
    return {
      async query(query, options) {
        // Without search, filters or sort the order is the identity order, which ordered rows already have: the first windows
        // need only the chunks that hold them. Reporting grids also total and group the complete rows, so they wait for all.
        if (ordered && !view.reporting && !view.footers?.length && !query.search && !query.filters.length && !query.filterGroup && !query.sort.length) {
          const end = Math.min(data.count, query.offset + query.limit);
          while (rows.length < end && !finished) await Promise.race([progress, done]);
          if (options.signal.aborted) throw new DOMException("Grid cancelled.", "AbortError");
          if (!finished && ordered) return { protocol: PROTOCOL, type: "gridPage", view: view.id, revision: "inline", offset: query.offset,
            total: data.count, matched: data.count, items: rows.slice(query.offset, end) };
        }
        return (await all()).query(query, options);
      }
    };
  }
