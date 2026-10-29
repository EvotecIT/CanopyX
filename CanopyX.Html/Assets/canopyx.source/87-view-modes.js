  // ---------- view modes: search-hit highlighting and layout modes (docs/search-highlight.md, docs/layout-modes.md) ----------
  // A view opts in with searchHighlight and layout. The options, the reader's choices in saved state and the API methods
  // live here, for trees and flat grids alike; the marking, the match navigator, the Layout menu and the card layout come
  // with the highlight and layouts parts, which load when a view declares the feature or the API first asks for it.
  // Scroll mode is honoured by the shared column fitting (33-column-fit-core.js) as soon as the view is built.
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    matchesHighlight: "Highlight matches", matchesCount: "[one]{count} match[other]{count} matches", matchesPosition: "{current} of {count}",
    matchesNone: "No matches", matchesLoaded: "[one]{count} match in loaded rows[other]{count} matches in loaded rows", matchesPrevious: "Previous match",
    matchesNext: "Next match", matchesAnnounce: "Match {current} of {count}, {column}",
    layoutMenu: "Layout", layoutFit: "Fit to width", layoutScroll: "All columns, scroll sideways", layoutCards: "Cards",
    layoutDensity: "Density", layoutCompact: "Compact", layoutNormal: "Normal", layoutComfortable: "Comfortable",
    layoutChanged: "Layout: {mode}, {density}", layoutSort: "Sort by"
  }));
  const LAYOUT_MODES = ["fit", "scroll", "cards"], LAYOUT_DENSITIES = ["compact", "default", "comfortable"];
  // Row height steps per density, relative to the view's own row height and declared density.
  const DENSITY_STEP = { tree: { compact: -8, default: 0, comfortable: 0 }, grid: { compact: -8, default: 0, comfortable: 0 } };
  // Filled by the parts when they install: highlightStart, setHighlight, matches, step, layoutsStart and setLayout.
  const VIEW_MODES = {};
  const HIGHLIGHT_KEYS = ["enabled", "search", "filters", "matchCase", "ignoreAccents", "minLength", "filterTones"];

  /** Validates a view's searchHighlight (true or an options object) and returns the complete options, or null when off. */
  function readSearchHighlight(value, columns) {
    if (value === undefined || value === false) return null;
    const options = value === true ? {} : value, tone = name => typeof name === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(name) && !name.endsWith("-bg");
    if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => !HIGHLIGHT_KEYS.includes(key)) ||
        HIGHLIGHT_KEYS.slice(0, 5).some(key => options[key] !== undefined && typeof options[key] !== "boolean") ||
        options.minLength !== undefined && (!Number.isInteger(options.minLength) || options.minLength < 1 || options.minLength > 32) ||
        options.filterTones !== undefined && (!options.filterTones || typeof options.filterTones !== "object" || Array.isArray(options.filterTones) ||
          Object.entries(options.filterTones).some(([id, name]) => !columns.some(column => column.id === id) || !tone(name))))
      throw new Error("CanopyX: invalid search highlight options.");
    return Object.freeze({ enabled: options.enabled !== false, search: options.search !== false, filters: options.filters !== false,
      matchCase: !!options.matchCase, ignoreAccents: !!options.ignoreAccents, minLength: options.minLength || 1,
      filterTones: Object.freeze({ ...options.filterTones }) });
  }

  /** Validates a view's layout ({ mode, modes, density }); trees offer fit and scroll. Returns the complete options, or null. */
  function readLayout(value, kind, density) {
    if (value === undefined) return null;
    const all = kind === "tree" ? LAYOUT_MODES.slice(0, 2) : LAYOUT_MODES;
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !["mode", "modes", "density"].includes(key)) ||
        value.modes !== undefined && (!Array.isArray(value.modes) || !value.modes.length || new Set(value.modes).size !== value.modes.length ||
          value.modes.some(mode => !all.includes(mode))) ||
        value.mode !== undefined && !(value.modes || all).includes(value.mode) || value.density !== undefined && !LAYOUT_DENSITIES.includes(value.density))
      throw new Error("CanopyX: invalid layout options.");
    const modes = Object.freeze((value.modes || all).slice());
    return Object.freeze({ mode: value.mode || (modes.includes("fit") ? "fit" : modes[0]), modes, density: value.density || density || "default" });
  }

  /** Reads the reader's saved layout and highlight choice; null when the state holds none or the view does not offer them. */
  function readModeState(view, state) {
    const result = {};
    if (state.layout !== undefined) {
      const layout = state.layout, options = view.layoutOptions;
      if (!layout || typeof layout !== "object" || !LAYOUT_MODES.includes(layout.mode) || !LAYOUT_DENSITIES.includes(layout.density))
        throw new Error("CanopyX: invalid saved layout.");
      if (options) result.layout = { mode: options.modes.includes(layout.mode) ? layout.mode : options.mode, density: layout.density };
    }
    if (state.highlight !== undefined) {
      if (typeof state.highlight !== "boolean") throw new Error("CanopyX: invalid saved highlight choice.");
      if (view.highlightOptions) result.highlight = state.highlight;
    }
    return result;
  }

  // The row height of a density: the view's own height moved by the density's step, within the 20 to 64 pixel bounds.
  function densityRowHeight(view, density) {
    const shared = sharedDensity(view.host);
    if (shared) return shared === "compact" ? 32 : 40;
    const steps = DENSITY_STEP[view.kind];
    return Math.max(20, Math.min(64, view.baseRowH + steps[density] - steps[view.declaredDensity]));
  }

  const VIEW_MODE_METHODS = {
    // Reads the options and the declared starting choices before the view builds itself.
    prepareViewModes() {
      const view = this.view, columns = this.columns || view.columns;
      this.highlightOptions = readSearchHighlight(view.searchHighlight, columns);
      this.declaredDensity = this.kind === "grid" ? view.density || "default" : "default";
      this.layoutOptions = readLayout(view.layout, this.kind, this.declaredDensity);
      this.baseRowH = this.rowH;
      this.adoptModes({ layout: this.layoutOptions || { mode: "fit", density: this.declaredDensity }, highlight: !!this.highlightOptions?.enabled });
      watchSharedDensity(this);
    },
    // Takes a saved state's choices (readModeState) before the view builds itself, so its first rows use them.
    adoptModes(choice) {
      if (choice.layout) { this.layoutMode = choice.layout.mode; this.density = choice.layout.density; }
      if (choice.highlight !== undefined) this.highlightOn = choice.highlight;
      this.rowH = densityRowHeight(this, this.density);
      if (this.layoutMode === "fit") this.host.removeAttribute("data-cx-layout"); else this.host.setAttribute("data-cx-layout", this.layoutMode);
    },
    // The saved-state fields of the modes a view offers.
    modeState(state) {
      if (this.layoutOptions) state.layout = { mode: this.layoutMode, density: this.density };
      if (this.highlightOptions) state.highlight = !!this.highlightOn;
      return state;
    },
    applyModeState(state) {
      if (state.layout && (state.layout.mode !== this.layoutMode || state.layout.density !== this.density))
        this.setLayout(state.layout).catch(error => this.emit("error", { error }));
      if (state.highlight !== undefined && state.highlight !== !!this.highlightOn)
        this.setSearchHighlight(state.highlight).catch(error => this.emit("error", { error }));
    },
    // Loads the parts of the declared features and starts them; a part that cannot load is reported, the view keeps working.
    startViewModes() {
      const parts = [this.highlightOptions && "highlight", (this.layoutOptions || this.view.stickyHeader) && "layouts"].filter(Boolean);
      return Promise.all(parts.map(name => this.requirePart(name).then(() => this.destroyed || VIEW_MODES[name + "Start"](this))
        .catch(error => this.emit("error", { error }))));
    },
    getLayout() {
      return Object.freeze({ mode: this.layoutMode, density: this.density, modes: this.layoutOptions ? this.layoutOptions.modes : Object.freeze(["fit"]) });
    },
    setLayout(change) {
      if (!this.layoutOptions) return Promise.reject(new Error("CanopyX: this view declares no layout modes."));
      return this.requirePart("layouts").then(() => VIEW_MODES.setLayout(this, change));
    },
    getMatches() {
      return VIEW_MODES.matches ? VIEW_MODES.matches(this) : Object.freeze({ enabled: !!this.highlightOn, total: 0, current: 0, complete: true });
    },
    setSearchHighlight(enabled) {
      if (typeof enabled !== "boolean") return Promise.reject(new Error("CanopyX: the highlight switch is a boolean."));
      if (!this.highlightOptions) return Promise.reject(new Error("CanopyX: this view declares no search highlighting."));
      return this.requirePart("highlight").then(() => VIEW_MODES.setHighlight(this, enabled));
    },
    nextMatch(options) { return this.stepMatch(1, options); },
    previousMatch(options) { return this.stepMatch(-1, options); },
    stepMatch(direction, options) {
      if (!this.highlightOptions) return Promise.reject(new Error("CanopyX: this view declares no search highlighting."));
      return this.requirePart("highlight").then(() => VIEW_MODES.step(this, direction, options?.focus !== false));
    }
  };
  Object.assign(TreeGrid.prototype, VIEW_MODE_METHODS);
  // Both view kinds load the same two parts; whichever view loads a part first installs it for every view of the runtime.
  // The flat-grid runtimes add their helpers to VIEW_MODES (86-grid-view-modes.js) before any view is created.
  const viewModeContext = () => ({ VIEW_MODES, TreeGrid, h, setText, fill, numberFormat, foldText, cellText, cellValue, isCellObject,
    setAttr, toneOf, toneVariable, watchFlyout, densityRowHeight, layoutAnchor, layoutRows, layoutApplyTree, MAX_PROTOCOL_INTEGER, LAYOUT_DENSITIES, plural, svgIcon });
  definePart(TreeGrid, "highlight", "search highlighting", viewModeContext);
  definePart(TreeGrid, "layouts", "layout modes", viewModeContext);
  // A tree starts its declared modes once its tree tools part (and so its toolbar menus) is installed.
  const MODES_TOOLBAR = TreeGrid.prototype.buildToolbar;
  TreeGrid.prototype.buildToolbar = function () {
    MODES_TOOLBAR.call(this);
    if (this.highlightOptions || this.layoutOptions) this.modesReady = Promise.resolve(this.toolsReady).then(() => this.destroyed || this.startViewModes());
    this.lifetime.signal.addEventListener("abort", () => this.host.removeAttribute("data-cx-layout"), { once: true });
  };
