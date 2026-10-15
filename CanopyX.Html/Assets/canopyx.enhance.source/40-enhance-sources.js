  // ---------- sources: rows in the page, a URL read once, or a server that answers each query ----------
  // Rows in the page are searched, filtered and sorted in the browser like inline data, except that rows equal under the
  // sort keep their order in the page or the data (inline data breaks ties by id). A URL source is read once and then
  // behaves the same; the grid shows its loading state meanwhile and Retry reads it again after a failure. A server source
  // posts each canopyx/2 grid query to the URL and accepts a grid page, or a plain answer with total, matched and records.

  /** The browser-side source over a store of rows ({ rows, version, loading }), keeping page order for ties. */
  function enhanceRowSource(store, view, compare) {
    const columns = new Map(view.columns.map(column => [column.id, column]));
    let shape = null, version = -1, ordered = null;
    const order = query => {
      const key = gridResultShape(query);
      if (key === shape && version === store.version) return ordered;
      const rows = gridQueryRows({ ...view, rows: store.rows }, query, columns, null);
      if (query.sort.length) rows.sort((a, b) => {
        for (const sort of query.sort) { const result = compare(a, b, columns.get(sort.column), sort.direction); if (result) return result; }
        return 0;
      });
      shape = key; version = store.version; ordered = rows; return rows;
    };
    const page = (query, signal) => {
      if (signal.aborted) throw new DOMException("Grid cancelled.", "AbortError");
      const rows = order(query);
      return { protocol: PROTOCOL, type: "gridPage", view: view.id, revision: "v" + store.version, offset: query.offset, total: store.rows.length,
        matched: rows.length, items: rows.slice(query.offset, query.offset + query.limit) };
    };
    return {
      order,
      // A read that failed before any query is the first query's error; the next query (Retry) reads again.
      query(query, options) {
        if (store.error) { const error = store.error; store.error = null; return Promise.reject(error); }
        if (store.failed) store.load();
        return store.loading ? store.loading.then(() => page(query, options.signal), error => { store.error = null; throw error; }) : page(query, options.signal);
      }
    };
  }

  /** A URL source in its object form: { url, method, headers, data, dataSrc, credentials, fetch, serverSide, facetUrl }. */
  function enhanceUrlSource(value) {
    const source = typeof value === "string" ? { url: value } : value;
    if (!source || typeof source.url !== "string" || !source.url ||
        ["method", "credentials"].some(name => source[name] !== undefined && typeof source[name] !== "string") ||
        source.headers !== undefined && (source.headers === null || typeof source.headers !== "object") ||
        source.fetch !== undefined && typeof source.fetch !== "function" ||
        source.dataSrc !== undefined && typeof source.dataSrc !== "string" && typeof source.dataSrc !== "function")
      throw new Error("CanopyX: a URL source is a URL or { url, method?, headers?, data?, dataSrc?, credentials?, fetch?, serverSide?, facetUrl? }.");
    return source;
  }

  /** Requests JSON: GET with the extra data as query parameters, or a JSON body for any other method; a server source posts by default. */
  function enhanceRequest(source, url, body, signal, post) {
    const address = new URL(url, document.baseURI), method = (source.method || (post ? "POST" : "GET")).toUpperCase();
    const init = { method, credentials: source.credentials || "same-origin", headers: { Accept: "application/json", ...source.headers }, signal };
    if (body !== undefined && method === "GET") {
      for (const [name, value] of Object.entries(body)) if (value !== undefined) address.searchParams.set(name, typeof value === "object" ? JSON.stringify(value) : String(value));
    } else if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
    return Promise.resolve((source.fetch || global.fetch)(address.href, init)).then(response => {
      if (!response.ok) throw new Error("CanopyX: " + address.pathname + " answered " + response.status + ".");
      return response.json();
    });
  }

  /** The extra request data of a source: an object, or a function of the grid query (or of nothing for a URL read once). */
  function enhanceExtra(source, query) {
    const data = typeof source.data === "function" ? source.data(query) : source.data;
    if (data !== undefined && data !== null && (typeof data !== "object" || Array.isArray(data))) throw new Error("CanopyX: URL source data is an object.");
    return data || undefined;
  }

  /** Finds the records in an answer: dataSrc as a path ("" for the answer itself) or a function, else the answer, data or items. */
  function enhanceRecordsOf(json, dataSrc) {
    const records = typeof dataSrc === "function" ? dataSrc(json) : dataSrc === "" ? json : dataSrc !== undefined ? enhancePath(json, dataSrc) :
      Array.isArray(json) ? json : json && (Array.isArray(json.data) ? json.data : json.items);
    if (!Array.isArray(records)) throw new Error("CanopyX: the URL source answered without an array of records.");
    return records;
  }

  /** The server source: each grid query goes to the URL; value lists go to facetUrl when it is given. */
  function enhanceServerSource(source, view, columns, rowId, store) {
    const server = {
      query(query, { signal }) {
        const extra = enhanceExtra(source, query);
        return enhanceRequest(source, source.url, extra ? { ...query, ...extra } : query, signal, true).then(answer => {
          if (answer && answer.type === "gridPage") { store.rows = answer.items || []; return answer; }
          // A plain answer: records (found as for a URL read once) mapped through the columns, with the answer's counts.
          const records = enhanceRecordsOf(answer, source.dataSrc);
          const ready = records.every(record => record && typeof record.id === "string" && record.cells && typeof record.cells === "object");
          const built = ready ? { rows: records, records: new Map(records.map(record => [record.id, record])) } : enhanceRecordRows(records, columns, rowId, query.offset);
          const total = Number(answer.total ?? records.length), matched = Number(answer.matched ?? total);
          store.rows = built.rows; store.records = built.records;
          // Without a revision of its own, an answer is the snapshot the query names: the same data while the query keeps its revision.
          return { protocol: PROTOCOL, type: "gridPage", view: view.id,
            revision: typeof answer.revision === "string" && answer.revision ? answer.revision : query.revision || "server",
            offset: query.offset, total, matched, items: built.rows };
        });
      }
    };
    if (source.facetUrl) server.facet = (request, { signal }) => enhanceRequest(source, source.facetUrl, request, signal, true);
    return server;
  }
