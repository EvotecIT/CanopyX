  // ---------- host preference hooks are bounded and writes are serial/coalesced ----------
  const VIEW_STORE_INITIALIZE = DataGrid.prototype.initializeState, VIEW_STORE_QUERY = DataGrid.prototype.setQuery,
    VIEW_STORE_API = GRID_REPORTING.api;
  GRID_REPORTING.api = (api, grid) => {
    VIEW_STORE_API?.(api, grid);
    for (const name of ["getViewSettings", "getDefaultView", "setDefaultView", "renameSavedView", "getShareState", "flushViewSettings"])
      api[name] = grid[name].bind(grid);
  };

  Object.assign(DataGrid.prototype, {
    setQuery(input, paging) {
      const pending = VIEW_STORE_QUERY.call(this, input, paging);
      this.viewQueryPromise = pending; return pending;
    },
    async initializeState() {
      if (!this.opts.viewStore) return VIEW_STORE_INITIALIZE.call(this);
      this.loadingViewSettings = true; this.setViewPreferenceError(this.labels.loading);
      const epoch = this.queryEpoch, intent = this.viewSettingsIntent;
      try {
        const input = await this.runGridHook(signal => this.opts.viewStore.load({ key: this.storageKey, view: this.view.id, signal }));
        gridOperationActive(this);
        this.setViewPreferenceError("");
        if (input !== null && input !== undefined && intent === this.viewSettingsIntent) {
          const settings = reportingStoredSettings(this, input);
          this.savedViews = new Map(settings.views.map(entry => [entry.name, entry.state]));
          this.defaultSavedView = settings.defaultView;
          if (epoch === this.queryEpoch) this.initialState = this.defaultSavedView ? this.savedViews.get(this.defaultSavedView) : settings.current;
          this.syncSavedViews(); this.setViewPreferenceError(this.viewPreferenceError || "");
        }
      } catch (error) {
        if (this.destroyed) throw error;
        this.viewStoreFaulted = true; this.setViewPreferenceError(error.message);
      } finally { this.loadingViewSettings = false; }
      return epoch === this.queryEpoch ? VIEW_STORE_INITIALIZE.call(this) : this.viewQueryPromise;
    },
    queueViewSettings(settings) {
      if (this.viewStoreFaulted) return;
      this.pendingViewSettings = settings;
      if (this.viewStoreWriting) return;
      this.viewStoreWriting = true;
      this.viewStoreWrite = (async () => {
        try {
          while (this.pendingViewSettings && !this.destroyed) {
            const current = this.pendingViewSettings; this.pendingViewSettings = null;
            await this.runGridHook(signal => this.opts.viewStore.save({ key: this.storageKey, view: this.view.id, settings: current, signal }));
            gridOperationActive(this); this.setViewPreferenceError("");
          }
        } catch (error) {
          this.pendingViewSettings = null; this.viewStoreFaulted = true;
          if (!this.destroyed) this.setViewPreferenceError(error.message);
          throw error;
        } finally { this.viewStoreWriting = false; }
      })();
      this.viewStoreWrite.catch(() => {});
    },
    flushViewSettings() {
      if (this.destroyed) return Promise.reject(new DOMException("Grid was destroyed.", "AbortError"));
      if (this.loadingViewSettings) return Promise.reject(new Error("CanopyX: wait for saved views to finish loading."));
      this.writeStoredState(this.getState());
      if (this.viewPersistenceError) return Promise.reject(this.viewPersistenceError);
      if (this.viewStorageRejected) return Promise.reject(new Error(this.viewPreferenceError));
      if (this.viewStoreFaulted) return Promise.reject(new Error(this.viewPreferenceError || "CanopyX: preference persistence is paused."));
      return this.viewStoreWrite || Promise.resolve();
    }
  });
