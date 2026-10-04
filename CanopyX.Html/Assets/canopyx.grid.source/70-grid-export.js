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
    if (grid.destroyed || signal?.aborted) throw new DOMException("Grid operation was cancelled.", "AbortError");
  }

  Object.assign(DataGrid.prototype, {
    prepareExport(options) {
      if (!this.view.reporting && ["fileName", "locale", "timeZone", "onProgress"].some(key => options?.[key] !== undefined))
        throw new Error("CanopyX: this view needs the reporting runtime.");
      if (this.destroyed || !this.acceptedQuery) throw new Error("CanopyX: export needs an accepted grid query.");
      if (!options || !["filtered", "selected", "all"].includes(options.scope)) throw new Error("CanopyX: choose an explicit export scope.");
      const { scope, values, signal } = options, filtered = scope === "filtered";
      const columnIds = options.columns === undefined ? this.visibleColumns().map(column => column.id) : options.columns;
      if (!Array.isArray(columnIds) || !columnIds.length || new Set(columnIds).size !== columnIds.length ||
          columnIds.some(id => !this.columns.some(column => column.id === id))) throw new Error("CanopyX: export columns must be unique declared IDs.");
      if (values !== undefined && !["raw", "display"].includes(values)) throw new Error("CanopyX: export values are raw or display.");
      if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error("CanopyX: export cancellation needs an AbortSignal.");
      const query = gridQuery(this.view, { ...this.acceptedQuery, offset: 0, cursor: undefined, limit: this.pageSize,
        search: filtered ? this.acceptedQuery.search : "",
        filterGroup: filtered ? this.acceptedQuery.filterGroup : undefined,
        filters: filtered ? this.acceptedQuery.filters : [] });
      const request = gridFreeze({ scope, query, revision: this.snapshot.revision,
        total: this.snapshot.total, matched: this.snapshot.matched, selection: scope === "selected" ? [...this.selected] : [],
        columns: columnIds.map(id => { const column = this.columns.find(item => item.id === id); return { id, title: column.title, kind: column.kind }; }),
        values: values || "display", timeZone: this.local ? "local" : "utc" });
      // The descriptor is captured now, before the iterator is consumed or the UI query changes.
      return Object.freeze({ request, rows: () => this.exportRows(request, signal) });
    },

    async *exportRows(request, signal) {
      const { scope } = request;
      // Each source request owns its deadline and linked grid/caller cancellation in runGridHook.
      // The iterator checks the same lifetime between records and owns no background request at a yield.
      gridOperationActive(this, signal);
      const remaining = new Set(request.selection), seen = new Set();
      if (scope === "selected" && !remaining.size) return;
      const expected = { revision: request.revision, total: request.total,
        matched: scope === "filtered" ? request.matched : this.cursor ? undefined : request.total };
      const tokens = new Set(); let cursor, offset = 0;
      while (this.cursor || offset < expected.matched) {
          gridOperationActive(this, signal);
          const query = gridQuery(this.view, { ...request.query, offset: this.cursor ? undefined : offset, cursor });
          const page = (this.cursor ? validateGridCursorPage : validateGridPage)(await this.requestPage(query, signal), this.view, query, expected);
          if (this.cursor && (page.offset !== offset || scope !== "filtered" && page.total !== null &&
              (page.matched !== null && page.matched !== page.total || page.nextCursor === undefined && page.offset + page.items.length !== page.total)))
            throw new Error("CanopyX: incomplete or noncontiguous cursor export.");
          expected.matched = page.matched;
          for (const row of page.items) {
            gridOperationActive(this, signal);
            if (seen.has(row.id)) throw new Error("CanopyX: export encountered a repeated row identity.");
            seen.add(row.id);
            if (scope !== "selected" || remaining.delete(row.id)) {
              const cells = Object.create(null);
              for (const column of request.columns) if (Object.prototype.hasOwnProperty.call(row.cells, column.id)) cells[column.id] = row.cells[column.id];
              yield gridFreeze({ id: row.id, cells });
            }
          }
          offset += this.cursor ? page.items.length : request.query.limit;
          if (this.cursor) {
            cursor = page.nextCursor; if (cursor === undefined) break;
            if (tokens.has(cursor)) throw new Error("CanopyX: cursor export repeated a traversal token.");
            tokens.add(cursor);
          }
      }
      gridOperationActive(this, signal);
      if (remaining.size) throw new Error("CanopyX: selected records are absent from the accepted dataset revision.");
    },

    async exportText(exported, maxRows = 50000, delimiter, signal) {
      if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 1000000) throw new Error("CanopyX: export row limit is between 1 and 1000000.");
      const request = exported.request, expected = request.scope === "selected" ? request.selection.length : request.scope === "all" ? request.total : request.matched;
      if (expected > maxRows) throw new Error("CanopyX: export exceeds the client row limit; use a host export hook.");
      const fmt = formatting(request.locale || this.lang, request.timeZone === "local", this.labels);
      const lines = [request.columns.map(column => gridExportField(column.title, delimiter)).join(delimiter)];
      let count = 0;
      for await (const row of exported.rows()) {
        if (++count > maxRows) throw new Error("CanopyX: export exceeds the client row limit; use a host export hook.");
        lines.push(request.columns.map(column => gridExportField(request.values === "raw" ? cellValue(row.cells[column.id]) :
          cellText(row.cells[column.id], column, fmt), delimiter)).join(delimiter));
      }
      gridOperationActive(this, signal);
      return lines.join("\r\n") + "\r\n";
    },

    toCsv(options) { return this.exportText(this.prepareExport(options), options.maxRows, ",", options.signal); },

    exportToHost(format, options) {
      const { request } = this.prepareExport(options);
      if (typeof format !== "string" || !format.trim() || typeof this.opts.onExport !== "function") throw new Error("CanopyX: host export needs a format and an onExport hook.");
      return this.runGridHook(signal => this.opts.onExport({ format, request, signal }), options.signal);
    }
  });
