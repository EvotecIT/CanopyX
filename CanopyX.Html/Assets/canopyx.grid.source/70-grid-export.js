  // ---------- immutable export requests, independent of viewport pages ----------
  const gridExportSignal = (signal, options) => AbortSignal.any([signal, options?.signal].filter(Boolean));

  function gridExportField(value, delimiter) {
    if (value == null) return "";
    let text = String(value);
    // Raw negative numbers remain numeric. Text and headings cannot start spreadsheet formulas.
    if (typeof value !== "number" && /^[\s\uFEFF]*[=+\-@]/.test(text)) text = "'" + text;
    return text.includes(delimiter) || /["\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function gridOperationActive(grid, signal) {
    if (grid.destroyed || signal?.aborted) throw new DOMException("Grid cancelled.", "AbortError");
  }

  Object.assign(DataGrid.prototype, {
    prepareExport(options) {
      if (!this.view.reporting && ["fileName", "locale", "timeZone", "onProgress"].some(key => options?.[key] !== undefined))
        throw new Error("CanopyX: export metadata requires reporting.");
      if (this.destroyed || !this.acceptedQuery) throw new Error("CanopyX: export needs an accepted query.");
      if (!options || !["filtered", "selected", "all"].includes(options.scope)) throw new Error("CanopyX: explicit export scope required.");
      const { scope, values, signal } = options, filtered = scope === "filtered";
      const selection = scope === "selected" ? [...this.selected] : [];
      const columnIds = options.columns === undefined ? this.visibleColumns().map(column => column.id) : options.columns;
      const columns = Array.isArray(columnIds) ? columnIds.map(id => this.columns.find(column => column.id === id)) : [];
      if (!Array.isArray(columnIds) || !columnIds.length || new Set(columnIds).size !== columnIds.length ||
          columns.some(column => !column)) throw new Error("CanopyX: invalid export columns.");
      if (values !== undefined && !["raw", "display"].includes(values)) throw new Error("CanopyX: export values must be raw/display.");
      if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error("CanopyX: export requires AbortSignal.");
      const query = gridQuery(this.view, { ...this.acceptedQuery, offset: 0, cursor: undefined, limit: this.pageSize,
        search: filtered ? this.acceptedQuery.search : "",
        filterGroup: filtered ? this.acceptedQuery.filterGroup : undefined,
        filters: filtered ? this.acceptedQuery.filters : [] });
      const { revision, total, matched } = this.snapshot;
      const request = gridFreeze({ scope, query, revision, total, matched, recordCount: scope === "selected" ? selection.length :
          filtered ? matched : total, selection,
        columns: columns.map(({ id, title, kind, format }) => ({ id, title, kind, ...(format ? { format: { ...format } } : {}) })), presentation: GRID_REPORTING.exportRecord ? "semantic" : "text",
        values: values || "display", timeZone: this.local ? "local" : "utc" });
      // The descriptor is captured now, before the iterator is consumed or the UI query changes.
      return Object.freeze({ request, rows: options => this.exportRows(request, gridExportSignal(signal, options)) });
    },

    async *exportRows(request, signal) {
      const { scope } = request;
      const fmt = formatting(request.locale || this.lang, request.timeZone === "local", this.labels);
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
            throw new Error("CanopyX: incomplete cursor export.");
          expected.matched = page.matched;
          for (const row of page.items) {
            gridOperationActive(this, signal);
            if (seen.has(row.id)) throw new Error("CanopyX: repeated export row ID.");
            seen.add(row.id);
            if (scope !== "selected" || remaining.delete(row.id)) {
              yield GRID_REPORTING.exportRecord ? GRID_REPORTING.exportRecord(this, request, row) : gridFreeze({ id: row.id,
                cells: Object.fromEntries(request.columns.map(column => [column.id,
                  { value: cellValue(row.cells[column.id]) ?? null, text: cellText(row.cells[column.id], column, fmt) }])) });
            }
          }
          offset += this.cursor ? page.items.length : request.query.limit;
          if (this.cursor) {
            cursor = page.nextCursor; if (cursor === undefined) break;
            if (tokens.has(cursor)) throw new Error("CanopyX: cursor export repeated a token.");
            tokens.add(cursor);
          }
      }
      gridOperationActive(this, signal);
      if (remaining.size) throw new Error("CanopyX: selected IDs absent from revision.");
    },

    async exportText(exported, maxRows = 50000, delimiter, signal) {
      if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 1000000) throw new Error("CanopyX: export row limit is 1 to 1000000.");
      const request = exported.request;
      if (request.recordCount > maxRows) throw new Error("CanopyX: client row limit exceeded.");
      const lines = [request.columns.map(column => gridExportField(column.title, delimiter)).join(delimiter)];
      let count = 0;
      for await (const row of exported.rows()) {
        if (++count > maxRows) throw new Error("CanopyX: client row limit exceeded.");
        lines.push(request.columns.map(column => gridExportField(request.values === "raw" ? row.cells[column.id]?.value :
          row.cells[column.id]?.text, delimiter)).join(delimiter));
      }
      gridOperationActive(this, signal);
      return lines.join("\r\n") + "\r\n";
    },

    toCsv(options) { return this.exportText(this.prepareExport(options), options.maxRows, ",", options.signal); },

    exportToHost(format, options) {
      const capture = this.prepareExport(options);
      if (typeof format !== "string" || !format.trim() || typeof this.opts.onExport !== "function") throw new Error("CanopyX: invalid host export.");
      return this.runGridHook(signal => this.opts.onExport({ format, request: capture.request, capture, signal }), options.signal);
    }
  });
