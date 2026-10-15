  // ---------- read-only host hooks, clipboard and record details ----------
  // Parts that extend the record drawer register a hook once: every drawer a grid opens runs the hooks in order before its
  // first paint, so each can follow the dialog's cx-drawer-paint events (editing 10, formatting 20, search highlighting 30).
  DataGrid.drawerHooks = [];
  DataGrid.drawerHook = (order, hook) => { DataGrid.drawerHooks.push({ order, hook }); DataGrid.drawerHooks.sort((a, b) => a.order - b.order); };
  Object.assign(DataGrid.prototype, {
    // The record drawer (filter editor part) focuses its title through this, with the ring after a key press only.
    focusRing: focusDrawerTitle,
    scrollToRow(index) {
      if (this.destroyed || !this.acceptedQuery || this.pendingQuery || !Number.isInteger(index) ||
          index < (this.cursor ? this.pageOffset : 0) || index >= this.rowCount())
        throw new Error("CanopyX: invalid accepted row position.");
      return this.focusResult(index, false);
    },
    async runGridHook(run, signal, timeout = this.requestTimeoutMs) {
      const controller = new AbortController(); let rejectHook;
      const cancelled = new Promise((resolve, reject) => { rejectHook = reject; });
      const abort = () => { controller.abort(); rejectHook(new DOMException("Grid cancelled.", "AbortError")); };
      this.lifetime.signal.addEventListener("abort", abort, { once: true });
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => { controller.abort(); rejectHook(new Error("CanopyX: operation timed out.")); }, timeout);
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

    openDetails(id) {
      requireIdentifier(id, "detail row ID");
      if (this.destroyed || !this.acceptedQuery || this.pendingQuery)
        throw new Error("CanopyX: details require an accepted query.");
      const row = [...this.rowCache.values()].find(item => item.key === id);
      if (!row) throw new Error("CanopyX: details require a loaded record.");
      if(typeof this.opts.onDetails!=="function"){
        const epoch=this.queryEpoch,returnFocus=document.activeElement;
        // A record panel (sections, tabs, structured values) loads its part with the drawer.
        return Promise.all([loadGridFilterEditor(),this.recordNeeded(row.h)&&loadRecordPanel()]).then(()=>{if(!this.destroyed&&!this.pendingQuery&&epoch===this.queryEpoch)this.openGridDrawer(row.h,row._ri,returnFocus);});
      }
      if (this.detailController) this.detailController.abort();
      const controller = this.detailController = new AbortController(), dataSignal = this.dataLifetime.signal;
      const abort = () => controller.abort(); dataSignal.addEventListener("abort", abort, { once: true });
      const record = gridFreeze(JSON.parse(JSON.stringify(row.h))), query = this.acceptedQuery, returnFocus = document.activeElement;
      return this.runGridHook(signal => this.opts.onDetails({ row: record, query, signal, returnFocus }), controller.signal)
        .finally(() => { dataSignal.removeEventListener("abort", abort); if (this.detailController === controller) this.detailController = null; });
    }
  });
