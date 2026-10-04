  // ---------- read-only host hooks, clipboard and record details ----------
  Object.assign(DataGrid.prototype, {
    scrollToRow(index) {
      if (this.destroyed || !this.acceptedQuery || this.pendingQuery || !Number.isInteger(index) ||
          index < (this.cursor ? this.pageOffset : 0) || index >= this.rowCount())
        throw new Error("CanopyX: scroll to a row position in the accepted result.");
      return this.focusResult(index, false);
    },
    async runGridHook(run, signal) {
      const controller = new AbortController(); let rejectHook;
      const cancelled = new Promise((resolve, reject) => { rejectHook = reject; });
      const abort = () => { controller.abort(); rejectHook(new DOMException("Grid operation cancelled.", "AbortError")); };
      this.lifetime.signal.addEventListener("abort", abort, { once: true });
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => { controller.abort(); rejectHook(new Error("CanopyX: host operation timed out.")); }, this.requestTimeoutMs);
      try {
        if (this.destroyed || signal?.aborted) abort();
        return await Promise.race([Promise.resolve().then(() => {
          gridOperationActive(this, controller.signal);
          return run(controller.signal);
        }), cancelled]);
      } finally {
        clearTimeout(timer); controller.abort(); this.lifetime.signal.removeEventListener("abort", abort);
        signal?.removeEventListener("abort", abort);
      }
    },

    async copy(options) {
      const exported = this.prepareExport(options);
      const text = await this.exportText(exported, options.maxRows === undefined ? 10000 : options.maxRows, "\t", options.signal);
      await this.writeClipboard(text, options.signal); return text;
    },
    writeClipboard(text, signal) {
      gridOperationActive(this, signal);
      const clipboard = global.navigator.clipboard;
      if (typeof clipboard?.writeText !== "function")
        return Promise.reject(new Error("CanopyX: clipboard unavailable."));
      return this.runGridHook(() => clipboard.writeText(text), signal);
    },
    copyFocused(row, cell) {
      if (this.selected.size) return this.copy({ scope: "selected" });
      const columns = this.visibleColumns(), index = cell ? this.rowCells(this.rendered.get(row)).indexOf(cell) : -1;
      const text = index >= 0 ? gridExportField(cellText(row.h.cells[columns[index].id], columns[index], this.fmt), "\t") :
        columns.map(column => gridExportField(cellText(row.h.cells[column.id], column, this.fmt), "\t")).join("\t");
      return this.writeClipboard(text);
    },

    openDetails(id) {
      requireIdentifier(id, "detail row ID");
      if (this.destroyed || !this.acceptedQuery || this.pendingQuery || typeof this.opts.onDetails !== "function")
        throw new Error("CanopyX: record details need an accepted query and an onDetails hook.");
      const row = [...this.rowCache.values()].find(item => item.key === id);
      if (!row) throw new Error("CanopyX: open details for a loaded record.");
      if (this.detailController) this.detailController.abort();
      const controller = this.detailController = new AbortController(), dataSignal = this.dataLifetime.signal;
      const abort = () => controller.abort(); dataSignal.addEventListener("abort", abort, { once: true });
      const record = gridFreeze(JSON.parse(JSON.stringify(row.h))), query = this.acceptedQuery, returnFocus = document.activeElement;
      return this.runGridHook(signal => this.opts.onDetails({ row: record, query, signal, returnFocus }), controller.signal)
        .finally(() => { dataSignal.removeEventListener("abort", abort); if (this.detailController === controller) this.detailController = null; });
    }
  });
