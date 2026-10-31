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
      await this.selectRowRange(start, end, options);
      return this.getSelectionDescriptor();
    }
  });
