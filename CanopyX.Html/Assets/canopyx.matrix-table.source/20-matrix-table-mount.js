  // ---------- matrix table: the matrix mounted in the table's place, and the table put back by destroy() ----------
  // The document is checked before the table leaves the page, so a table that does not read as a matrix stays as it is and
  // the promise rejects with the reason. details: "host" hands cell clicks to the page; otherwise a cell's link is followed.
  const MX_TABLE_OPTIONS = ["view", "details", "labels", "state", "theme", "height", "onReady", "onCell", "onStateChange"], mxTables = new WeakMap();

  /** Mounts a matrix from a table; resolves with the matrix's API plus the table and a destroy() that puts it back. */
  function matrixTableCreate(target, options) {
    const table = typeof target === "string" ? document.querySelector(target) : target;
    if (!table || table.tagName !== "TABLE") throw new Error("CanopyX: CanopyX.matrix needs a table element or selector.");
    if (mxTables.has(table)) return mxTables.get(table);
    for (const key of Object.keys(options)) if (!MX_TABLE_OPTIONS.includes(key)) throw new Error("CanopyX: a matrix table has no option '" + key + "'.");
    const view = mxTableDocument(table, options);
    MATRIX_IMPL.validate(view);
    const host = h("div", "cx-matrix-table"), theme = options.theme || table.getAttribute("data-theme");
    host.style.height = options.height || table.getAttribute("data-height") || "min(720px, 85vh)";
    if (theme) host.setAttribute("data-cx-theme", theme);
    table.replaceWith(host);
    const api = createMatrix(host, { view, labels: options.labels, state: options.state, onReady: options.onReady, onCell: options.onCell, onStateChange: options.onStateChange });
    let destroyed = false;
    const own = {
      /** The original table, put back by destroy(). */
      table,
      destroy() {
        if (destroyed) return;
        destroyed = true; mxTables.delete(table); api.destroy(); host.replaceWith(table);
      }
    };
    // The matrix's API is frozen, so the controller inherits it and defines its own members.
    const controller = Object.freeze(Object.create(api, Object.getOwnPropertyDescriptors(own)));
    const ready = api.ready.then(() => controller, error => { controller.destroy(); throw error; });
    mxTables.set(table, ready);
    return ready;
  }
