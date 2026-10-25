  // Preview handles belong to one grid, one input snapshot and one accepted state. A consumed handle cannot be replayed.
  const VIEW_INTENT_PREVIEWS = new WeakMap();
  const VIEW_INTENT_BASE = { setQuery: DataGrid.prototype.setQuery, stateChanged: DataGrid.prototype.stateChanged,
    readGridState: DataGrid.prototype.readGridState, applyStatePresentation: DataGrid.prototype.applyStatePresentation };
  function intentStateKey(grid) { return JSON.stringify(grid.getState()); }
  function intentPresentationKey(grid) {
    const state = grid.getState();
    return JSON.stringify({ columns: state.columns, timeZone: state.timeZone, selection: state.selection, formatRules: state.formatRules });
  }
  function retireViewIntent(grid, reason) {
    const preview = grid.viewIntentPreview;
    if (!preview) return;
    grid.viewIntentPreview = null;
    preview.active = false; preview.apply.disabled = true; preview.cancel.disabled = true;
    grid.lifetime.signal.removeEventListener("abort", preview.destroy);
    setText(preview.status, reason || grid.labels.viewIntentSuperseded);
  }
  function intentCandidate(grid, intent, current) {
    const state = JSON.parse(JSON.stringify(current)), patch = intent.query || {};
    state.query = gridQuery(grid.view, gridQueryStart(state.query, { ...patch, filterGroup: patch.filterGroup === null ? undefined :
      Object.hasOwn(patch, "filterGroup") ? patch.filterGroup : state.query.filterGroup }), true);
    state.scrollTop = 0;
    if (state.paging) state.paging.offset = 0;
    if (intent.columns) {
      const columns = new Map(state.columns.map(column => [column.id, column])), visible = new Set(intent.columns);
      state.columns = [...intent.columns, ...state.columns.filter(column => !visible.has(column.id)).map(column => column.id)]
        .map(id => ({ ...columns.get(id), hidden: !visible.has(id) }));
    }
    // Existing saved-state readers validate presentation, selection and reporting extensions after strict intent validation.
    return grid.readGridState(state);
  }
  function intentChips(grid, intent) {
    const labels = grid.labels, query = intent.query || {}, title = id => grid.columns.find(column => column.id === id)?.title || id;
    const chips = [];
    if (Object.hasOwn(query, "search")) chips.push(fill(labels.viewIntentSearch, { search: query.search || "∅" }));
    if (query.searchMode) chips.push(query.searchMode === "words" ? labels.viewIntentWords : labels.viewIntentSubstring);
    if (query.sort) chips.push(fill(labels.viewIntentSort, { columns: query.sort.map(sort => title(sort.column) + (sort.direction === "desc" ? " ↓" : " ↑")).join(", ") || "∅" }));
    const predicate = filter => title(filter.column) + " " + (labels[GRID_FILTER_LABELS[filter.operator]] || GRID_FILTER_LABELS[filter.operator]) +
      (filter.values.length ? " " + filter.values.join(", ") : "");
    if (query.filters) chips.push(...query.filters.map(predicate));
    if (query.filters && !query.filters.length) chips.push(labels.gridClearFilters);
    const group = item => "(" + [...item.filters.map(predicate), ...item.groups.map(group)].join(" " + (item.operator === "and" ? labels.gridAnd : labels.gridOr) + " ") + ")";
    if (Object.hasOwn(query, "filterGroup")) chips.push(query.filterGroup ? group(query.filterGroup) : labels.gridRemoveGroup);
    if (query.groupBy) chips.push(fill(labels.viewIntentGroup, { columns: query.groupBy.map(level => title(level.column) + (level.direction === "desc" ? " ↓" : " ↑") +
      (level.aggregate ? " (" + level.aggregate + ")" : "")).join(", ") || "∅" }));
    if (intent.columns) chips.push(fill(labels.viewIntentColumns, { columns: intent.columns.map(title).join(", ") }));
    return chips;
  }
  async function confirmViewIntent(grid, handle) {
    const entry = VIEW_INTENT_PREVIEWS.get(handle), preview = entry?.preview;
    if (!preview || entry.grid !== grid || !preview.active || grid.destroyed || grid.pendingQuery || preview.epoch !== grid.queryEpoch || preview.key !== intentStateKey(grid))
      throw new DOMException(grid.labels.viewIntentSuperseded, "AbortError");
    const intent = grid.validateViewIntent(preview.intent), state = intentCandidate(grid, intent, grid.getState());
    const restore = { input: state, before: intentPresentationKey(grid), preferenceBefore: grid.viewPreferenceIntent, applied: false };
    grid.viewIntentApply = restore;
    retireViewIntent(grid, grid.labels.loading);
    try {
      const query = await grid.setState(state);
      if (grid.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
      if (!restore.applied || restore.epoch !== grid.queryEpoch || restore.after !== intentPresentationKey(grid) || restore.preferenceAfter !== grid.viewPreferenceIntent)
        throw new DOMException(grid.labels.viewIntentSuperseded, "AbortError");
      // Saved-state restore retains pins. Explicit column order uses the ordinary reorder API, which unpins columns
      // moved out of their pinned segment, so the accepted order matches the order the reader previewed.
      if (intent.columns) grid.setColumnOrder(state.columns.map(column => column.id));
      setText(preview.status, grid.labels.viewIntentApplied); return query;
    } catch (error) { if (!grid.destroyed) setText(preview.status, error.message); throw error; }
    finally { if (grid.viewIntentApply === restore) grid.viewIntentApply = null; }
  }
  Object.assign(DataGrid.prototype, {
    readGridState(input) {
      const state = VIEW_INTENT_BASE.readGridState.call(this, input), restore = this.viewIntentApply;
      // Identify only this intent's canonical restore, without changing the saved-state document or other callers.
      if (restore?.input === input) restore.state = state;
      return state;
    },
    applyStatePresentation(state) {
      const restore = this.viewIntentApply;
      if (!restore || restore.state !== state) return VIEW_INTENT_BASE.applyStatePresentation.call(this, state);
      if (restore.before !== intentPresentationKey(this) || restore.preferenceBefore !== this.viewPreferenceIntent ||
          restore.preferenceBefore !== undefined && this.restorePreferenceIntent !== this.viewPreferenceIntent) return;
      const applied = VIEW_INTENT_BASE.applyStatePresentation.call(this, state);
      // Canonical setters can advance reporting's preference epoch themselves. Capture the post-restore baseline now,
      // so a subsequent reader change while asynchronous presentation finishes still cancels the final reorder.
      restore.applied = true; restore.epoch = this.queryEpoch;
      restore.after = intentPresentationKey(this); restore.preferenceAfter = this.viewPreferenceIntent;
      return applied;
    },
    validateViewIntent(input) { return readViewIntent(this, input); },
    getViewIntent() {
      if (this.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
      const current = this.getQuery();
      if (!current) throw new Error("CanopyX: exporting a view intent needs an accepted query.");
      const query = { search: current.search, searchMode: current.searchMode || "substring", sort: current.sort, filters: current.filters, filterGroup: current.filterGroup || null };
      if (current.groupBy) query.groupBy = current.groupBy;
      return this.validateViewIntent({ protocol: "canopyx/2", type: "viewIntent", version: 1, view: this.view.id, query,
        columns: this.columns.filter(column => !column.hidden).map(column => column.id) });
    },
    previewViewIntent(input, container) {
      const intent = this.validateViewIntent(input);
      if (!this.getQuery() || this.pendingQuery) throw new Error("CanopyX: preview needs a settled accepted query.");
      const state = this.getState(); intentCandidate(this, intent, state);
      container ||= this.host;
      if (!container || container.nodeType !== 1 || container.ownerDocument !== this.host.ownerDocument || !container.isConnected || container === this.grid || this.grid.contains(container))
        throw new Error("CanopyX: preview needs a connected container outside the grid rows.");
      retireViewIntent(this);
      this.viewIntentElement?.remove();
      const element = h("section", "cx-host cx-chrome cx-view-intent-preview"), heading = h("h3"), chips = h("div", "cx-grid-query-chips"), status = h("p");
      // Like the facet panel, a host-targeted preview carries the originating grid's palette outside its DOM scope.
      const theme = getComputedStyle(this.host);
      for (const name of theme) if (name.startsWith("--cx-")) element.style.setProperty(name, theme.getPropertyValue(name));
      element.style.colorScheme = theme.colorScheme;
      element.setAttribute("aria-label", this.labels.viewIntentPreview); setText(heading, this.labels.viewIntentPreview);
      status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
      for (const text of intentChips(this, intent)) { const chip = h("span", "cx-grid-chip"); setText(chip, text); chip.title = text; chips.appendChild(chip); }
      const actions = h("div", "cx-view-intent-actions"), apply = gridButton(this.labels.gridApply, () => {
        confirmViewIntent(this, handle).catch(error => { if (!this.destroyed) setText(status, error.name === "AbortError" ? this.labels.viewIntentSuperseded : error.message); });
      }), cancel = gridButton(this.labels.gridEditCancel || "Cancel", () => handle.cancel());
      actions.append(apply, cancel); element.append(heading, chips, actions, status);
      const preview = { intent, key: JSON.stringify(state), epoch: this.queryEpoch, active: true, apply, cancel, status, element,
        destroy: () => { retireViewIntent(this); element.remove(); } };
      const handle = Object.freeze({ element, intent, apply: () => confirmViewIntent(this, handle), cancel: () => {
        if (this.viewIntentPreview === preview) retireViewIntent(this, ""); element.remove();
      } });
      VIEW_INTENT_PREVIEWS.set(handle, { grid: this, preview }); this.viewIntentPreview = preview;
      this.viewIntentElement = element;
      if (!this.viewIntentCleanup) {
        this.viewIntentCleanup = () => { retireViewIntent(this); this.viewIntentElement?.remove(); };
        this.lifetime.signal.addEventListener("abort", this.viewIntentCleanup, { once: true });
      }
      this.lifetime.signal.addEventListener("abort", preview.destroy, { once: true }); container.appendChild(element);
      return handle;
    },
    async applyViewIntent(input, container) { return this.previewViewIntent(input, container); },
    setQuery(...args) { retireViewIntent(this); return VIEW_INTENT_BASE.setQuery.apply(this, args); },
    stateChanged(...args) {
      const preview = this.viewIntentPreview;
      if (preview && (preview.epoch !== this.queryEpoch || preview.key !== intentStateKey(this))) retireViewIntent(this);
      return VIEW_INTENT_BASE.stateChanged.apply(this, args);
    }
  });
