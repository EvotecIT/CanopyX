  // ---------- bounded preference envelopes reuse the canonical grid-state validator ----------
  const VIEW_SETTINGS_LIMIT = 1048576, VIEW_STATE_BASE = {};
  for (const name of ["prepareState", "readStoredState", "writeStoredState", "saveView", "removeSavedView", "resetView"]) VIEW_STATE_BASE[name] = DataGrid.prototype[name];

  function reportingStoredSettings(grid, input) {
    const json = JSON.stringify(input);
    if (typeof json !== "string" || json.length > VIEW_SETTINGS_LIMIT) throw new Error("CanopyX: view preferences exceed the 1,048,576-character limit.");
    const value = JSON.parse(json);
    if (!value || Array.isArray(value) || Object.keys(value).some(key => !["version", "view", "current", "views", "defaultView"].includes(key)) ||
        (value.version !== undefined || value.view !== undefined) && (value.version !== 1 || value.view !== grid.view.id) ||
        !Array.isArray(value.views) || value.views.length > 20)
      throw new Error("CanopyX: invalid or incompatible view preferences.");
    const names = new Set(), views = [];
    for (const entry of value.views) {
      if (!entry || Object.keys(entry).some(key => !["name", "state"].includes(key))) throw new Error("CanopyX: invalid saved view entry.");
      const name = grid.viewName(entry.name);
      if (names.has(name)) throw new Error("CanopyX: repeated saved view name.");
      names.add(name);
      try { views.push({ name, state: grid.readGridState(entry.state) }); }
      catch (_) { grid.viewStorageRejected = true; grid.viewPreferenceError = "CanopyX: incompatible saved views were skipped; persistence is paused until reset."; }
    }
    let current;
    if (value.current !== undefined) {
      try { current = grid.readGridState(value.current); }
      catch (_) { grid.viewStorageRejected = true; grid.viewPreferenceError = "CanopyX: incompatible current view settings were skipped; persistence is paused until reset."; }
    }
    const defaultView = value.defaultView === undefined ? null : grid.viewName(value.defaultView);
    if (defaultView && !names.has(defaultView)) throw new Error("CanopyX: the default saved view does not exist.");
    return { current, views, defaultView: views.some(entry => entry.name === defaultView) ? defaultView : null };
  }

  Object.assign(DataGrid.prototype, {
    prepareState() {
      this.viewSettingsIntent = 0; this.viewPreferenceIntent = 0; this.defaultSavedView = null;
      if (this.opts.viewStore && (!this.view.reporting || typeof this.view.stateKey !== "string" || !this.view.stateKey.trim() ||
          this.view.stateKey.length > 512 || typeof this.opts.viewStore.load !== "function" || typeof this.opts.viewStore.save !== "function"))
        throw new Error("CanopyX: a host view store needs a reporting grid, bounded state key, load and save hooks.");
      VIEW_STATE_BASE.prepareState.call(this);
      const chosen = this.defaultSavedView && this.savedViews.get(this.defaultSavedView);
      if (chosen) this.initialState = chosen;
    },
    readStoredState() {
      if (!this.view.reporting) return VIEW_STATE_BASE.readStoredState.call(this);
      if (this.opts.viewStore || !this.storageKey) return null;
      try {
        const text = global[this.view.reporting.viewStorage === "local" ? "localStorage" : "sessionStorage"].getItem(this.storageKey);
        if (!text) return null;
        if (text.length > VIEW_SETTINGS_LIMIT) throw new Error("CanopyX: view preferences exceed the 1,048,576-character limit.");
        const settings = reportingStoredSettings(this, JSON.parse(text)); this.defaultSavedView = settings.defaultView;
        return settings;
      } catch (error) { this.viewStorageRejected = true; this.viewPreferenceError = error.message; return null; }
    },
    getViewSettings() {
      const settings = { version: 1, view: this.view.id, current: this.getState(),
        views: [...this.savedViews].map(([name, state]) => ({ name, state })) };
      if (this.defaultSavedView) settings.defaultView = this.defaultSavedView;
      const json = JSON.stringify(settings);
      if (json.length > VIEW_SETTINGS_LIMIT) throw new Error("CanopyX: view preferences exceed the 1,048,576-character limit.");
      return gridFreeze(JSON.parse(json));
    },
    writeStoredState(state) {
      if (!this.view.reporting) return VIEW_STATE_BASE.writeStoredState.call(this, state);
      if (!this.storageKey || this.destroyed || this.loadingViewSettings || this.viewStorageRejected) return;
      try {
        if (this.viewSettingsIntent === (this.viewBrowserSyncedIntent || 0)) this.pullBrowserViewMetadata();
        if (this.viewStorageRejected) return;
        const settings = this.getViewSettings();
        if (this.opts.viewStore) {
          this.viewPersistenceError = null;
          return this.queueViewSettings(settings);
        }
        global[this.view.reporting.viewStorage === "local" ? "localStorage" : "sessionStorage"].setItem(this.storageKey, JSON.stringify(settings));
        this.viewBrowserSyncedIntent = this.viewSettingsIntent;
        this.viewPersistenceError = null; this.setViewPreferenceError("");
      } catch (error) { this.viewPersistenceError = error; this.setViewPreferenceError(error.message); }
    },
    pullBrowserViewMetadata() {
      if (this.opts.viewStore || this.view.reporting?.viewStorage !== "local" || !this.storageKey || this.viewStorageRejected) return;
      try {
        const text = global.localStorage.getItem(this.storageKey); if (!text) return;
        const settings = reportingStoredSettings(this, JSON.parse(text));
        this.savedViews = new Map(settings.views.map(entry => [entry.name, entry.state])); this.defaultSavedView = settings.defaultView;
        this.syncSavedViews();
      } catch (error) { this.viewStorageRejected = true; this.setViewPreferenceError(error.message); }
    },
    setViewPreferenceError(message) { this.viewPreferenceError = message; if (this.viewPreferenceStatus) setText(this.viewPreferenceStatus, message); },
    requireViewSettingsReady() { if (this.loadingViewSettings) throw new Error("CanopyX: wait for saved views to finish loading."); },
    getDefaultView() { return this.defaultSavedView; },
    setDefaultView(name) {
      this.requireViewSettingsReady();
      this.pullBrowserViewMetadata();
      if (name !== null) { name = this.viewName(name); if (!this.savedViews.has(name)) throw new Error("CanopyX: the saved view does not exist."); }
      this.viewSettingsIntent++; this.defaultSavedView = name; this.writeStoredState(this.getState()); this.syncSavedViews();
    },
    renameSavedView(oldName, newName) {
      this.requireViewSettingsReady();
      this.pullBrowserViewMetadata();
      oldName = this.viewName(oldName); newName = this.viewName(newName);
      if (!this.savedViews.has(oldName)) throw new Error("CanopyX: the saved view does not exist.");
      if (oldName !== newName && this.savedViews.has(newName)) throw new Error("CanopyX: that saved view name already exists.");
      this.viewSettingsIntent++;
      this.savedViews = new Map([...this.savedViews].map(([name, state]) => [name === oldName ? newName : name, state]));
      if (this.defaultSavedView === oldName) this.defaultSavedView = newName;
      this.writeStoredState(this.getState()); this.syncSavedViews(); if (this.savedChoice) this.savedChoice.value = newName;
    },
    saveView(name) { this.requireViewSettingsReady(); this.pullBrowserViewMetadata(); this.viewSettingsIntent++; return VIEW_STATE_BASE.saveView.call(this, name); },
    removeSavedView(name) {
      this.requireViewSettingsReady();
      this.pullBrowserViewMetadata();
      name = this.viewName(name); this.viewSettingsIntent++;
      if (this.defaultSavedView === name) this.defaultSavedView = null;
      return VIEW_STATE_BASE.removeSavedView.call(this, name);
    },
    async resetView() {
      await VIEW_STATE_BASE.resetView.call(this);
      if (this.viewStorageRejected) { this.viewStorageRejected = false; this.viewSettingsIntent++; this.writeStoredState(this.getState()); }
      return this.getQuery();
    },
    getShareState() {
      const state = this.getState();
      state.query = gridQuery(this.view, gridQueryStart({ sort: state.query.sort, searchMode: state.query.searchMode }));
      state.selection = []; state.scrollTop = 0; if (state.paging) state.paging.offset = 0;
      return gridFreeze(state);
    }
  });
