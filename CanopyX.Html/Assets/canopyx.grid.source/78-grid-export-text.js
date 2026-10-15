  // ---------- export part: record enumeration, CSV and clipboard text, and the host export hook ----------
  // This part ships in the lazy export file. The grid runtime keeps stable methods that capture the export first and
  // call these implementations once the part is installed, so reporting wrappers of those methods keep working. Trees load
  // it too, for exportText, the CSV of tree captures.
  function gridExportField(value, delimiter) {
    if (value == null) return "";
    let text = String(value);
    // Raw negative numbers remain numeric. Text and headings cannot start spreadsheet formulas: a field that starts with
    // = + - @ (or their full-width forms), after any spaces, or with a tab or carriage return, gets a leading apostrophe.
    if (typeof value !== "number" && /^(?:[\t\r]|\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/.test(text)) text = "'" + text;
    return text.includes(delimiter) || /["\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function gridWriteClipboard(grid, text, signal) {
    return grid.runGridHook(() => {
      const clipboard = global.navigator.clipboard;
      if (typeof clipboard?.writeText !== "function") throw new Error("CanopyX: clipboard unavailable.");
      return clipboard.writeText(text);
    }, signal);
  }

  Object.assign(EXPORT_IMPL, {
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
        // Tree rows indent the tree column by level, two spaces a level, as the tree shows them.
        lines.push(request.columns.map(column => { const value = request.values === "raw" ? row.cells[column.id]?.value : row.cells[column.id]?.text;
          return gridExportField(row.level > 1 && column.id === this.columns[0].id ? "  ".repeat(row.level - 1) + (value ?? "") : value, delimiter); }).join(delimiter));
      }
      gridOperationActive(this, signal);
      return lines.join("\r\n") + "\r\n";
    },

    toCsv(capture, options) { return this.exportText(capture, options.maxRows, ",", options.signal); },

    async copy(capture, options) {
      const text = await this.exportText(capture, options.maxRows === undefined ? 10000 : options.maxRows, "\t", options.signal);
      await gridWriteClipboard(this, text, options.signal); return text;
    },

    copyFocused(row, cell) {
      if (this.selected.size) return this.copy({ scope: "selected" });
      // The row may have been recycled while the export part loaded; the whole row is copied then.
      const columns = this.visibleColumns(), element = this.rendered.get(row), index = cell && element ? this.rowCells(element).indexOf(cell) : -1;
      const text = index >= 0 ? gridExportField(cellText(row.h.cells[columns[index].id], columns[index], this.fmt), "\t") :
        columns.map(column => gridExportField(cellText(row.h.cells[column.id], column, this.fmt), "\t")).join("\t");
      return gridWriteClipboard(this, text);
    },

    // The host hook is a writer: it runs under the export safety timeout, not the source request deadline.
    exportToHost(capture, format, options) {
      if (typeof format !== "string" || !format.trim() || typeof this.opts.onExport !== "function") throw new Error("CanopyX: invalid host export.");
      return this.runGridHook(signal => this.opts.onExport({ format, request: capture.request, capture, signal }), options.signal, exportTimeout(this, options));
    }
  });
