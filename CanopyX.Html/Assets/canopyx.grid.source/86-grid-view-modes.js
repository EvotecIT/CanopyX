  // ---------- flat grids: search-hit highlighting and layout modes (87-view-modes.js) ----------
  // The parts read the flat grid's query helpers through VIEW_MODES. A grid's saved state carries the reader's layout and
  // highlight choice; a remembered state's choice is taken before the grid builds itself, so its first rows already use it.
  Object.assign(VIEW_MODES, { DataGrid, gridMatches, gridResultShape });
  Object.assign(DataGrid.prototype, VIEW_MODE_METHODS);
  definePart(DataGrid, "highlight", "search highlighting", viewModeContext);
  definePart(DataGrid, "layouts", "layout modes", viewModeContext);
  const MODES_BASE = {};
  for (const name of ["prepareState", "build", "getState", "readGridState", "applyStatePresentation", "initializeState"]) MODES_BASE[name] = DataGrid.prototype[name];
  Object.assign(DataGrid.prototype, {
    prepareState() {
      this.prepareViewModes();
      if (this.view.stickyHeader !== undefined && typeof this.view.stickyHeader !== "boolean") throw new Error("CanopyX: stickyHeader is a boolean.");
      readCardTemplate(this.view.cardTemplate, this.columns, this.layoutOptions);
      const result = MODES_BASE.prepareState.call(this);
      this.modeState(this.defaultState);
      if (this.initialState) this.adoptModes(this.initialState);
      return result;
    },
    // The declared modes start as the grid builds itself, whatever path its first query takes (a host view store starts
    // it later); ready waits for them (initializeState).
    build() {
      MODES_BASE.build.call(this);
      this.host.setAttribute("data-cx-density", this.density);
      this.lifetime.signal.addEventListener("abort", () => this.host.removeAttribute("data-cx-layout"), { once: true });
      this.modesStarted = this.highlightOptions || this.layoutOptions || this.view.stickyHeader ? this.startViewModes() : null;
    },
    getState() { return this.modeState(MODES_BASE.getState.call(this)); },
    readGridState(state) { return Object.assign(MODES_BASE.readGridState.call(this, state), readModeState(this, state)); },
    applyStatePresentation(state) {
      const applied = MODES_BASE.applyStatePresentation.call(this, state);
      this.applyModeState(state);
      return applied;
    },
    initializeState() {
      const ready = MODES_BASE.initializeState.call(this);
      return this.modesStarted ? Promise.all([ready, this.modesStarted]).then(([result]) => result) : ready;
    }
  });
