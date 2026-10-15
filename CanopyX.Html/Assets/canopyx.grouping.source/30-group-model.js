  // ---------- grouping model: summaries with pages, headings in the projection, collapse state ----------
  // A page of the grid's own result waits for the complete-query summary of the same query and revision (the inline data's,
  // or the source's summary hook) and is accepted only when its records belong to the summary's groups. Exports, ranges and
  // other readers have their own signals and read records only. Collapse hides a group's rows in the presentation; the query,
  // paging, selection and exports keep every record.
  const GROUP_ATTACH = DataGrid.prototype.attachRows;
  const groupSummaryQuery = (view, query, revision) => gridQuery(view, { ...query, offset: 0, limit: view.pageSize, revision });
  const groupNeedsSummary = (view, query) => !!view.reporting?.grouping || !!query.groupBy?.length || !!view.reporting?.aggregates?.length;
  GRID_ROWS.requestPage = async function (query, signal) {
    const page = await GRID_ROWS.base.requestPage.call(this, query, signal);
    if (!reportingSummaryEnabled(this.view) || signal !== this.dataLifetime.signal || !groupNeedsSummary(this.view, query)) return page;
    validateGridPage(page, this.view, query);
    const request = groupSummaryQuery(this.view, query, page.revision), key = JSON.stringify(request);
    if (this.summaryCandidate?.key !== key) {
      const hook = this.source.summary || (this.view.source.kind === "inline" ? request => groupInlineSummary(this, request) : null);
      if (!hook) throw new Error("CanopyX: hosted summaries need an explicit source summary hook.");
      const summary = await this.runGridHook(signal => hook.call(this.source, request, { signal }), signal);
      gridOperationActive(this, signal);
      this.summaryCandidate = { key, result: groupSummaryResult(this, request, page, summary) };
    }
    const result = this.summaryCandidate.result, levels = groupLevelsOf(this.view, query);
    if (result.matched !== page.matched) throw new Error("CanopyX: a page differs from its complete-query summary count.");
    if (levels.length) {
      const columns = levels.map(level => this.view.columns.find(column => column.id === level.column));
      for (let i = 0; i < page.items.length; i++) {
        const path = groupPath(result, page.offset + i);
        if (path.length !== levels.length || columns.some((column, depth) =>
            reportingGroupKey(gridScalar(page.items[i].cells[column.id], column)) !== reportingGroupKey(gridScalar(path[depth].value, column))))
          throw new Error("CanopyX: a page record differs from its complete-query group.");
      }
    }
    return page;
  };
  Object.assign(DataGrid.prototype, {
    attachRows() {
      if (this.rowsAttached) return;
      GROUP_ATTACH.call(this);
      GROUP_GRIDS.set(this.view, this);
      this.groupAggregates = groupCustomAggregates(this);
      for (const aggregate of this.view.reporting.aggregates || [])
        if (!GROUP_OPERATIONS.includes(aggregate.operation) && this.view.source.kind === "inline" && !this.groupAggregates.has(aggregate.operation))
          throw new Error("CanopyX: no plugin computes the aggregate '" + aggregate.operation + "' for inline data.");
      this.collapsedGroups ||= new Set(); this.groupHeaders = new Map();
      this.attachGroupControls();
    },
    // The accepted query's summary becomes the presentation's once its page is accepted.
    acceptRows() {
      // A grid with detail rows only shares the prototype once another grid installed grouping.
      if (!this.groupHeaders) return;
      const query = this.acceptedQuery;
      if (!groupNeedsSummary(this.view, query)) { if (this.summary) { this.summary = null; this.groupHeaders.clear(); } }
      else {
        const key = JSON.stringify(groupSummaryQuery(this.view, query, this.snapshot.revision));
        if (this.summaryCandidate?.key === key && this.summary !== this.summaryCandidate.result) { this.summary = this.summaryCandidate.result; this.groupHeaders.clear(); }
      }
      this.groupLevels = this.summary ? groupLevelsOf(this.view, query) : [];
      this.syncGroupAria(); this.syncSummaryControls(); this.syncGroupBar();
    },
    projectionGroups() { return this.groupLevels?.length ? this.summary.groups : null; },
    // One heading object per group of the accepted summary, so focus and rendered rows keep their identity.
    groupHeader(group, level) {
      let header = this.groupHeaders.get(group.key);
      if (!header) {
        header = { _ri: -2 - this.groupHeaders.size, hpx: this.rowH, h: { cells: {} }, status: "group", group, level };
        this.groupHeaders.set(group.key, header);
      }
      return header;
    },
    // A record that becomes the focus opens the collapsed groups that hide it.
    revealRecord(row) {
      if (!this.summary || !this.groupLevels?.length) return;
      const hidden = groupPath(this.summary, row._ri).filter(group => this.collapsedGroups.has(group.key));
      if (hidden.length) { hidden.forEach(group => this.collapsedGroups.delete(group.key)); hidden.forEach(group => this.emit("group", { key: group.key, collapsed: false })); this.collapseChanged(); }
    },
    // A focused record that a collapse hides hands focus to the outermost collapsed heading above it.
    focusedHeader(projection) {
      const focus = this.focused;
      if (!this.summary || !this.groupLevels?.length) return;
      if (focus.group) { const header = this.groupHeaders.get(focus.group.key); if (header && projection.indexOf(header) >= 0) this.focused = header; return; }
      if (focus._ri < 0) return;
      const group = groupPath(this.summary, focus._ri).find(item => this.collapsedGroups.has(item.key));
      const header = group && this.groupHeaders.get(group.key);
      if (header && projection.indexOf(header) >= 0) this.focused = header;
    },
    groupKeys(level) {
      const keys = [], walk = (list, depth) => { for (const group of list || []) { if (!level || depth === level) keys.push(group.key); walk(group.groups, depth + 1); } };
      if (this.summary) walk(this.summary.groups, 1);
      return keys;
    },
    setGroupCollapsed(key, collapsed) {
      if (this.destroyed || this.pendingQuery || !this.summary || !this.groupLevels?.length || typeof collapsed !== "boolean" || !this.groupHeaders.has(key) && !this.groupKeys().includes(key))
        throw new Error("CanopyX: choose an accepted group and a boolean collapse intent.");
      if (collapsed && !this.collapsedGroups.has(key) && this.collapsedGroups.size >= 10000) throw new Error("CanopyX: at most 10,000 collapsed group keys are supported.");
      if (collapsed === this.collapsedGroups.has(key)) return;
      if (collapsed) this.collapsedGroups.add(key); else this.collapsedGroups.delete(key);
      this.collapseChanged({ key, collapsed });
    },
    // Every group, or every group of one level (1 is the outermost), at once.
    setGroupLevelCollapsed(level, collapsed) {
      if (!Number.isInteger(level) || level < 0 || level > (this.groupLevels?.length || 0) || typeof collapsed !== "boolean" || this.pendingQuery || this.destroyed)
        throw new Error("CanopyX: choose a grouping level (0 for all) and a boolean collapse intent.");
      const keys = this.groupKeys(level), changed = keys.filter(key => this.collapsedGroups.has(key) !== collapsed);
      if (collapsed && this.collapsedGroups.size + changed.length > 10000) throw new Error("CanopyX: at most 10,000 collapsed group keys are supported.");
      changed.forEach(key => collapsed ? this.collapsedGroups.add(key) : this.collapsedGroups.delete(key));
      if (changed.length) this.collapseChanged({ level, collapsed, keys: changed });
    },
    expandAllGroups() { return this.setGroupLevelCollapsed(0, false); },
    collapseAllGroups() { return this.setGroupLevelCollapsed(0, true); },
    // One canopyx:group event: { key, collapsed } for a group, { level, collapsed, keys } for a level or all groups.
    collapseChanged(detail) {
      const ownedFocus = this.canvas.contains(document.activeElement);
      this.groupCollapseVersion = (this.groupCollapseVersion || 0) + 1; this.version++; this.render();
      if (ownedFocus && this.focused) this.rendered.get(this.focused)?.focus({ preventScroll: true });
      if (detail) this.emit("group", detail);
      this.noteViewPreferenceIntent?.();
      this.stateChanged();
    }
  });
