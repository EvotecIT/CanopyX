  // Shared accepted-source range reader for pointer selection and reporting selection controls.
  Object.assign(DataGrid.prototype, {
    async readSelectionRange(start, end, options, controller) {
      const first = Math.min(start, end), last = Math.max(start, end), selected = options.selected ?? true, additive = options.additive ?? false;
      if (!Number.isInteger(start) || !Number.isInteger(end) || first < 0 || last >= this.rowCount() || last - first + 1 > 10000 ||
          typeof selected !== "boolean" || typeof additive !== "boolean" || options.signal !== undefined && !(options.signal instanceof AbortSignal))
        throw new Error("CanopyX: selection ranges need accepted positions and at most 10,000 records.");
      if (this.cursor && (first < this.pageOffset || last >= this.cursorWindow.end))
        throw new Error("CanopyX: sequential-source selection ranges stay on the accepted page.");
      const dataSignal = this.dataLifetime.signal, epoch = this.queryEpoch;
      const abort = () => controller.abort();
      const active = () => { if (this.destroyed || controller.signal.aborted) throw new DOMException("Selection was superseded.", "AbortError"); };
      dataSignal.addEventListener("abort", abort, { once: true }); options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();
      const query = this.acceptedQuery, snapshot = { ...this.snapshot }, ids = [], seen = new Set(), scope = this.querySelection;
      try {
        active();
        if (this.cursor) {
          for (let index = first; index <= last; index++) {
            const row = this.rowCache.get(index);
            if (!row || row.status) throw new Error("CanopyX: the complete accepted cursor page is required for page/range selection.");
            ids.push(row.key);
          }
        } else for (let offset = Math.floor(first / this.pageSize) * this.pageSize; offset <= last; offset += this.pageSize) {
          const request = gridQuery(this.view, { ...query, offset, limit: this.pageSize });
          const page = validateGridPage(await this.requestPage(request, controller.signal), this.view, request, snapshot);
          active();
          for (const [index, row] of page.items.entries()) {
            if (seen.has(row.id)) throw new Error("CanopyX: a selection range repeated a record identity.");
            seen.add(row.id);
            if (page.offset + index >= first && page.offset + index <= last) ids.push(row.id);
          }
        }
        active();
        if (epoch !== this.queryEpoch || ids.length !== last - first + 1)
          throw new DOMException("Selection range was superseded or incomplete.", "AbortError");
        if (scope) {
          const excluded = new Set(this.selectionExcluded);
          for (const id of ids) if (selected) excluded.delete(id); else excluded.add(id);
          if (excluded.size > 10000) throw new Error("CanopyX: query selection supports at most 10,000 exclusions.");
          this.selectionExcluded = excluded; this.publishQuerySelection();
        } else {
          const next = additive || !selected ? new Set(this.selected) : new Set();
          for (const id of ids) if (selected) next.add(id); else next.delete(id);
          this.setSelection([...next]);
        }
        if (this.selectionAnchor == null) this.selectionAnchor = start;
        return;
      } finally {
        dataSignal.removeEventListener("abort", abort); options.signal?.removeEventListener("abort", abort); controller.abort();
        if (this.selectionController === controller) this.selectionController = null;
      }
    }
  });
