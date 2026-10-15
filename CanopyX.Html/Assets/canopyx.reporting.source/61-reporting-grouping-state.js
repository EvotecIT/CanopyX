  // ---------- bounded collapse preferences; grouping levels travel with the query; sharing omits group keys ----------
  const GROUP_STATE_BASE = {};
  for (const name of ["getState", "readGridState", "applyStatePresentation", "getShareState"]) GROUP_STATE_BASE[name] = DataGrid.prototype[name];
  const reportingGrouped = view => !!view.reporting?.grouping || reportingDynamicGroups(view);
  Object.assign(DataGrid.prototype, {
    getState() {
      const state = GROUP_STATE_BASE.getState.call(this);
      if (reportingGrouped(this.view)) state.collapsedGroups = [...(this.collapsedGroups || [])];
      return state;
    },
    readGridState(input) {
      // Saved levels a newer definition no longer allows (an undeclared or unsortable column, a removed aggregate, a fifth level)
      // are dropped, as saved sorts and filters of removed columns are.
      const query = input?.query, aggregates = this.view.reporting?.aggregates || [], levels = query && reportingDynamicGroups(this.view) && Array.isArray(query.groupBy) ?
        query.groupBy.filter(level => level && this.columns.some(column => column.id === level.column && column.sortable)).slice(0, GROUP_LEVELS)
          .map(level => level.aggregate === undefined || aggregates.some(item => item.id === level.aggregate) ? level : (({ aggregate, ...rest }) => rest)(level)) : undefined;
      const state = GROUP_STATE_BASE.readGridState.call(this, levels ? { ...input, query: { ...query, groupBy: levels } } : input);
      const groups = input.collapsedGroups === undefined ? [] : input.collapsedGroups;
      if (!Array.isArray(groups) || groups.length > 10000 || groups.some(key => typeof key !== "string" || !key.length || key.length > 4096))
        throw new Error("CanopyX: invalid bounded group collapse state.");
      groups.forEach(key => requireIdentifier(key, "group key"));
      if (reportingGrouped(this.view)) state.collapsedGroups = [...new Set(groups)];
      return state;
    },
    applyStatePresentation(state) {
      if (reportingGrouped(this.view)) {
        this.collapsedGroups = new Set(state.collapsedGroups || []); this.groupCollapseVersion = (this.groupCollapseVersion || 0) + 1;
      }
      return GROUP_STATE_BASE.applyStatePresentation.call(this, state);
    },
    getShareState() {
      const { collapsedGroups, ...state } = GROUP_STATE_BASE.getShareState.call(this), current = this.getQuery() || this.defaultState.query;
      // A shared view keeps how its rows are grouped; the keys of collapsed groups belong to one result and stay behind.
      if (current.groupBy) state.query = gridQuery(this.view, gridQueryStart({ sort: current.sort, searchMode: current.searchMode, groupBy: current.groupBy }));
      return gridFreeze(state);
    }
  });
