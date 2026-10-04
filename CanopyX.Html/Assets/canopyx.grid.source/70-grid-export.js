  // ---------- immutable export requests, independent of viewport pages ----------
  function gridFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(gridFreeze); Object.freeze(value);
    }
    return value;
  }

  function gridExportField(value, delimiter) {
    if (value == null) return "";
    let text = String(value);
    // Raw negative numbers remain numeric. Text and headings cannot start spreadsheet formulas.
    if (typeof value !== "number" && /^[\s\uFEFF]*[=+\-@]/.test(text)) text = "'" + text;
    return text.includes(delimiter) || /["\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function gridOperationActive(grid, signal) {
    if (grid.destroyed || signal && signal.aborted) throw new DOMException("Grid operation was cancelled.", "AbortError");
  }

  Object.assign(DataGrid.prototype, {
    prepareExport(options) {
      if (this.destroyed || !this.acceptedQuery) throw new Error("CanopyX: export needs an accepted grid query.");
      if (!options || !["filtered", "selected", "all"].includes(options.scope)) throw new Error("CanopyX: choose an explicit export scope.");
      const columnIds = options.columns === undefined ? this.visibleColumns().map(column => column.id) : options.columns;
      if (!Array.isArray(columnIds) || !columnIds.length || new Set(columnIds).size !== columnIds.length ||
          columnIds.some(id => !this.columns.some(column => column.id === id))) throw new Error("CanopyX: export columns must be unique declared IDs.");
      if (options.values !== undefined && !["raw", "display"].includes(options.values)) throw new Error("CanopyX: export values are raw or display.");
      if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw new Error("CanopyX: export cancellation needs an AbortSignal.");
      const selected = options.scope === "selected" ? [...this.selected] : [];
      const query = gridQuery(this.view, Object.assign({}, this.acceptedQuery, { offset: 0, limit: this.pageSize,
        search: options.scope === "filtered" ? this.acceptedQuery.search : "",
        filters: options.scope === "filtered" ? this.acceptedQuery.filters : [] }));
      const request = gridFreeze({ scope: options.scope, query: query, revision: this.snapshot.revision,
        total: this.snapshot.total, matched: this.snapshot.matched, selection: selected,
        columns: columnIds.map(id => { const column = this.columns.find(item => item.id === id); return { id: id, title: column.title, kind: column.kind }; }),
        values: options.values || "display", timeZone: this.local ? "local" : "utc" });
      const signal = options.signal, grid = this;
      // The descriptor is captured now, before the iterator is consumed or the UI query changes.
      return Object.freeze({ request: request, rows: () => grid.exportRows(request, signal) });
    },

    async *exportRows(request, signal) {
      const controller = new AbortController(), abort = () => controller.abort();
      this.lifetime.signal.addEventListener("abort", abort, { once: true });
      if (signal) signal.addEventListener("abort", abort, { once: true });
      try {
        if (this.destroyed || signal && signal.aborted) controller.abort();
        gridOperationActive(this, controller.signal);
        const remaining = new Set(request.selection), seen = new Set();
        if (request.scope === "selected" && !remaining.size) return;
        const expected = { revision: request.revision, total: request.total,
          matched: request.scope === "filtered" ? request.matched : request.total };
        for (let offset = 0; offset < expected.matched; offset += request.query.limit) {
          const query = gridQuery(this.view, Object.assign({}, request.query, { offset: offset }));
          const page = validateGridPage(await this.requestPage(query, controller.signal), this.view, query, expected);
          for (const row of page.items) {
            gridOperationActive(this, controller.signal);
            if (seen.has(row.id)) throw new Error("CanopyX: export encountered a repeated row identity.");
            seen.add(row.id);
            if (request.scope !== "selected" || remaining.delete(row.id)) {
              const cells = Object.create(null);
              for (const column of request.columns) if (Object.prototype.hasOwnProperty.call(row.cells, column.id)) cells[column.id] = row.cells[column.id];
              yield gridFreeze({ id: row.id, cells: cells });
              gridOperationActive(this, controller.signal);
            }
          }
        }
        gridOperationActive(this, controller.signal);
        if (remaining.size) throw new Error("CanopyX: selected records are absent from the accepted dataset revision.");
      } finally {
        controller.abort(); this.lifetime.signal.removeEventListener("abort", abort);
        if (signal) signal.removeEventListener("abort", abort);
      }
    },

    async exportText(exported, maxRows, delimiter) {
      if (maxRows === undefined) maxRows = 50000;
      if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 1000000) throw new Error("CanopyX: export row limit is between 1 and 1000000.");
      const request = exported.request, expected = request.scope === "selected" ? request.selection.length : request.scope === "all" ? request.total : request.matched;
      if (expected > maxRows) throw new Error("CanopyX: export exceeds the client row limit; use a host export hook.");
      const fmt = formatting(this.lang, request.timeZone === "local", this.labels);
      const lines = [request.columns.map(column => gridExportField(column.title, delimiter)).join(delimiter)];
      let count = 0;
      for await (const row of exported.rows()) {
        if (++count > maxRows) throw new Error("CanopyX: export exceeds the client row limit.");
        lines.push(request.columns.map(column => gridExportField(request.values === "raw" ? cellValue(row.cells[column.id]) :
          cellText(row.cells[column.id], column, fmt), delimiter)).join(delimiter));
      }
      return lines.join("\r\n") + "\r\n";
    },

    toCsv(options) { return this.exportText(this.prepareExport(options), options.maxRows, ","); },

    exportToHost(format, options) {
      const exported = this.prepareExport(options);
      if (typeof format !== "string" || !format.trim() || typeof this.opts.onExport !== "function") throw new Error("CanopyX: host export needs a format and an onExport hook.");
      return this.runGridHook(signal => this.opts.onExport({ format: format, request: exported.request, signal: signal }), options.signal);
    }
  });
