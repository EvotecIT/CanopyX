  // ---------- bounded collapse preferences; sharing omits query-specific group keys ----------
  const GROUP_STATE_BASE = {};
  for (const name of ["getState", "readGridState", "applyStatePresentation", "getShareState"]) GROUP_STATE_BASE[name] = DataGrid.prototype[name];
  Object.assign(DataGrid.prototype, {
    getState() {
      const state = GROUP_STATE_BASE.getState.call(this);
      if (this.view.reporting?.grouping) state.collapsedGroups = [...(this.collapsedGroups || [])];
      return state;
    },
    readGridState(input) {
      const state = GROUP_STATE_BASE.readGridState.call(this, input), groups = input.collapsedGroups || [];
      if (!Array.isArray(groups) || groups.length > 10000 || groups.some(key => typeof key !== "string" || !key.length || key.length > 4096))
        throw new Error("CanopyX: invalid bounded group collapse state.");
      groups.forEach(key => requireIdentifier(key, "group key"));
      if (this.view.reporting?.grouping) state.collapsedGroups = [...new Set(groups)];
      return state;
    },
    applyStatePresentation(state) {
      if (this.view.reporting?.grouping) {
        this.collapsedGroups = new Set(state.collapsedGroups || []); this.groupCollapseVersion = (this.groupCollapseVersion || 0) + 1;
      }
      return GROUP_STATE_BASE.applyStatePresentation.call(this, state);
    },
    getShareState() { const { collapsedGroups, ...state } = GROUP_STATE_BASE.getShareState.call(this); return gridFreeze(state); }
  });
