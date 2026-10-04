  // ---------- bounded range reads use the accepted source, not the mounted viewport ----------
  Object.assign(DataGrid.prototype, {
    selectPage(selected = true, options = {}) {
      this.requireReportingSelection(true);
      if (typeof selected !== "boolean" || options.signal !== undefined && !(options.signal instanceof AbortSignal))
        throw new Error("CanopyX: page selection needs a boolean and optional AbortSignal.");
      if (!this.paged) throw new Error("CanopyX: page selection requires paged presentation.");
      const bounds = this.rowBounds();
      return bounds.last < bounds.first ? Promise.resolve(this.getSelectionDescriptor()) :
        this.selectRange(bounds.first, bounds.last, { ...options, selected, additive: true });
    },
    async selectRange(start, end, options = {}) {
      this.requireReportingSelection(true);
      const first = Math.min(start, end), last = Math.max(start, end), selected = options.selected ?? true, additive = options.additive ?? false;
      if (!Number.isInteger(start) || !Number.isInteger(end) || first < 0 || last >= this.rowCount() || last - first + 1 > REPORTING_SELECTION_LIMIT ||
          typeof selected !== "boolean" || typeof additive !== "boolean" || options.signal !== undefined && !(options.signal instanceof AbortSignal))
        throw new Error("CanopyX: selection ranges need accepted positions and at most 10,000 records.");
      if (this.cursor && (first < this.pageOffset || last >= this.cursorWindow.end))
        throw new Error("CanopyX: sequential-source selection ranges stay on the accepted page.");
      this.selectionController?.abort();
      const controller = this.selectionController = new AbortController(), dataSignal = this.dataLifetime.signal, epoch = this.queryEpoch;
      const abort = () => controller.abort();
      dataSignal.addEventListener("abort", abort, { once: true }); options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();
      const query = this.acceptedQuery, snapshot = { ...this.snapshot }, ids = [], seen = new Set(), scope = this.querySelection;
      try {
        gridOperationActive(this, controller.signal);
        if (this.cursor) {
          for (let index = first; index <= last; index++) {
            const row = this.rowCache.get(index);
            if (!row || row.status) throw new Error("CanopyX: the complete accepted cursor page is required for page/range selection.");
            ids.push(row.key);
          }
        } else for (let offset = Math.floor(first / this.pageSize) * this.pageSize; offset <= last; offset += this.pageSize) {
          const request = gridQuery(this.view, { ...query, offset, limit: this.pageSize });
          const page = validateGridPage(await this.requestPage(request, controller.signal), this.view, request, snapshot);
          gridOperationActive(this, controller.signal);
          for (const [index, row] of page.items.entries()) {
            if (seen.has(row.id)) throw new Error("CanopyX: a selection range repeated a record identity.");
            seen.add(row.id);
            if (page.offset + index >= first && page.offset + index <= last) ids.push(row.id);
          }
        }
        gridOperationActive(this, controller.signal);
        if (epoch !== this.queryEpoch || ids.length !== last - first + 1)
          throw new DOMException("Selection range was superseded or incomplete.", "AbortError");
        if (scope) {
          const excluded = new Set(this.selectionExcluded);
          for (const id of ids) if (selected) excluded.delete(id); else excluded.add(id);
          if (excluded.size > REPORTING_SELECTION_LIMIT) throw new Error("CanopyX: query selection supports at most 10,000 exclusions.");
          this.selectionExcluded = excluded; this.publishQuerySelection();
        } else {
          const next = additive || !selected ? new Set(this.selected) : new Set();
          for (const id of ids) if (selected) next.add(id); else next.delete(id);
          this.setSelection([...next]);
        }
        if (this.selectionAnchor == null) this.selectionAnchor = start;
        return this.getSelectionDescriptor();
      } finally {
        dataSignal.removeEventListener("abort", abort); options.signal?.removeEventListener("abort", abort); controller.abort();
        if (this.selectionController === controller) this.selectionController = null;
      }
    }
  });
