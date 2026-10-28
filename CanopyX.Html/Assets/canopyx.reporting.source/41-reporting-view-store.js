  // ---------- host preference hooks are bounded and writes are serial/coalesced ----------
  const VIEW_STORE_INITIALIZE = DataGrid.prototype.initializeState, VIEW_STORE_QUERY = DataGrid.prototype.setQuery,
    VIEW_STORE_SEARCH = DataGrid.prototype.buildGridSearch, VIEW_STORE_STATE = DataGrid.prototype.setState,
    VIEW_STORE_PRESENTATION = DataGrid.prototype.applyStatePresentation, VIEW_STORE_API = GRID_REPORTING.api;
  GRID_REPORTING.api = (api, grid) => {
    VIEW_STORE_API?.(api, grid);
    for (const name of ["getViewSettings", "getDefaultView", "setDefaultView", "renameSavedView", "getShareState", "flushViewSettings"])
      api[name] = grid[name].bind(grid);
  };
  GRID_REPORTING.search = (grid, update) => {
    grid.scheduleGridSearch = delay => {
      clearTimeout(grid.searchTimer); grid.searchTimer = setTimeout(update, delay);
    };
  };

  for (const name of ["setColumnWidth", "setColumnVisible", "setColumnOrder", "setColumnPinned", "setTimeZone", "setSelection"]) {
    const original = DataGrid.prototype[name];
    DataGrid.prototype[name] = function (...args) {
      const result = original.apply(this, args); this.noteViewPreferenceIntent(); return result;
    };
  }

  Object.assign(DataGrid.prototype, {
    noteViewPreferenceIntent() { this.viewPreferenceIntent++; },
    buildGridSearch() {
      VIEW_STORE_SEARCH.call(this);
      for (const event of ["input", "compositionstart", "compositionend"])
        this.searchInput.addEventListener(event, () => {
          this.noteViewPreferenceIntent(); this.searchDeadline = performance.now() + this.searchDelayMs;
        }, { signal: this.lifetime.signal });
    },
    setState(input) { this.restorePreferenceIntent = this.viewPreferenceIntent; return VIEW_STORE_STATE.call(this, input); },
    applyStatePresentation(state) {
      if (this.restorePreferenceIntent === this.viewPreferenceIntent) return VIEW_STORE_PRESENTATION.call(this, state);
    },
    setQuery(input, paging) {
      const pending = VIEW_STORE_QUERY.call(this, input, paging);
      this.viewQueryPromise = pending; return pending;
    },
    async initializeState() {
      if (gridUsesCalculations(this.view) && !this.calculationPrepared) await this.prepareCalculations();
      if (!this.opts.viewStore) return VIEW_STORE_INITIALIZE.call(this);
      this.loadingViewSettings = true; this.setViewPreferenceError(this.labels.loading);
      const epoch = this.queryEpoch, intent = this.viewSettingsIntent, preference = this.viewPreferenceIntent;
      try {
        const input = await this.runGridHook(signal => this.opts.viewStore.load({ key: this.storageKey, view: this.view.id, signal }));
        gridOperationActive(this);
        this.setViewPreferenceError("");
        if (input !== null && input !== undefined && intent === this.viewSettingsIntent) {
          const settings = reportingStoredSettings(this, input);
          this.savedViews = new Map(settings.views.map(entry => [entry.name, entry.state]));
          this.defaultSavedView = settings.defaultView;
          if (epoch === this.queryEpoch && preference === this.viewPreferenceIntent)
            this.initialState = this.defaultSavedView ? this.savedViews.get(this.defaultSavedView) : settings.current;
          this.syncSavedViews(); this.setViewPreferenceError(this.viewPreferenceError || "");
        }
      } catch (error) {
        if (this.destroyed) throw error;
        this.viewStoreFaulted = true; this.setViewPreferenceError(error.message);
      } finally { this.loadingViewSettings = false; }
      let pending = this.viewQueryPromise;
      if (epoch === this.queryEpoch) {
        const deadline = this.searchTimer == null ? null : this.searchDeadline, text = this.searchInput?.value;
        pending = VIEW_STORE_INITIALIZE.call(this);
        // Starting the definition query clears a queued search; retain its input and original deadline.
        if (deadline !== null) {
          this.searchInput.value = text; this.scheduleGridSearch(Math.max(0, deadline - performance.now()));
        }
      }
      while (pending) {
        try { await pending; if (pending === this.viewQueryPromise) return this.getQuery(); }
        catch (error) { if (this.destroyed || error.name !== "AbortError" || pending === this.viewQueryPromise) throw error; }
        pending = this.viewQueryPromise;
      }
    },
    queueViewSettings(settings) {
      if (this.viewStoreFaulted) return;
      const key = JSON.stringify(settings);
      // Explicit flush and a pending autosave can describe the same immutable envelope.
      // They share its acknowledgement; newer intent reverting to the active write retires an older queued envelope.
      if (this.viewStoreWriting && key === this.activeViewSettingsKey) { this.pendingViewSettings = null; return; }
      if (!this.viewStoreWriting && key === this.acknowledgedViewSettingsKey) {
        this.setViewPreferenceError(""); return;
      }
      this.pendingViewSettings = settings;
      if (this.viewStoreWriting) return;
      this.viewStoreWriting = true;
      this.viewStoreWrite = (async () => {
        try {
          while (this.pendingViewSettings && !this.destroyed) {
            const current = this.pendingViewSettings; this.pendingViewSettings = null;
            this.activeViewSettingsKey = JSON.stringify(current);
            await this.runGridHook(signal => this.opts.viewStore.save({ key: this.storageKey, view: this.view.id, settings: current, signal }));
            this.acknowledgedViewSettingsKey = this.activeViewSettingsKey;
            gridOperationActive(this); this.setViewPreferenceError("");
          }
        } catch (error) {
          this.pendingViewSettings = null; this.viewStoreFaulted = true;
          if (!this.destroyed) this.setViewPreferenceError(error.message);
          throw error;
        } finally { this.viewStoreWriting = false; this.activeViewSettingsKey = null; }
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
