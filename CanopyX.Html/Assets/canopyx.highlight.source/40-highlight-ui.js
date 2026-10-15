  // ---------- search highlighting: the match navigator, the switch and the hooks into painting ----------
  // The navigator sits in the search box: the count ("3 of 12"), Previous and Next. Enter and Shift+Enter in the search box
  // move through the matches once the search is applied (focus stays in the box); F3 and Shift+F3 anywhere in the view, the
  // buttons and the API focus the match's cell. The more menu holds the Highlight matches switch. toolbar.matches: false
  // leaves both out; the API keeps working. The count is announced once it settles and each move as it happens, through
  // the view's live region; the count element itself is not live, so counting does not flood a screen reader.
  const HL_ICONS = { up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>' };
  function hlIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "cx-ico"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = HL_ICONS[name]; return svg;
  }
  function hlButton(className, label, run) {
    const button = h("button", className); button.type = "button"; button.setAttribute("aria-label", label); button.title = label;
    button.addEventListener("click", event => { event.preventDefault(); run(); });
    return button;
  }

  // Recompiles the terms and repaints; the count follows.
  function hlRefresh(view) {
    const state = view.hl, compiled = hlCompile(view);
    state.active = !!view.highlightOn && (compiled.terms.length > 0 || compiled.wholes.length > 0);
    if (compiled.key !== state.key) state.current = null;
    state.key = compiled.key; state.text = view.searchInput?.value;
    state.columns = new Map();
    for (const column of view.columns) { const applicable = hlColumnTerms(compiled, column); if (applicable) state.columns.set(column.id, applicable); }
    state.colsKey = hlColsKey(view);
    view.version++; view.scheduleRender();
    hlRecount(view);
  }
  function hlColsKey(view) { return (view.cols || []).map(column => column.id).join("\u0000"); }
  // "12 matches", "3 of 12", "12 matches in loaded rows" or "No matches".
  function hlCountText(view, counting) {
    const state = view.hl, position = counting ? 0 : hlPosition(view), total = state.total || 0;
    return !total && !counting ? view.labels.matchesNone : position ? fill(view.labels.matchesPosition, { current: hlFormat(view, position), count: hlFormat(view, total) }) :
      fill(plural(state.complete || counting ? view.labels.matchesCount : view.labels.matchesLoaded, total, view.lang), { count: hlFormat(view, total) });
  }

  // The count, the buttons and the switch show the current state.
  function hlSync(view, counting) {
    const state = view.hl, ui = state.ui;
    if (!ui) return;
    const shown = state.active;
    ui.box.hidden = !shown;
    ui.search?.classList.toggle("cx-has-matches", shown);
    if (shown) {
      const text = hlCountText(view, counting);
      if (ui.count.textContent !== text) setText(ui.count, text);
      ui.previous.disabled = ui.next.disabled = !state.total;
    }
    if (ui.toggle) { ui.toggle.setAttribute("aria-pressed", String(!!view.highlightOn)); ui.toggle.classList.toggle("on", !!view.highlightOn); }
  }

  function hlBuild(view) {
    const state = view.hl, search = view.searchInput?.closest(".cx-search");
    if (view.tools.matches === false) return;
    const box = h("span", "cx-matches"), count = h("span", "cx-matches-count");
    const previous = hlButton("cx-matches-step", view.labels.matchesPrevious, () => hlRun(view, -1, true));
    const next = hlButton("cx-matches-step", view.labels.matchesNext, () => hlRun(view, 1, true));
    previous.setAttribute("aria-keyshortcuts", "Shift+F3"); next.setAttribute("aria-keyshortcuts", "F3");
    previous.appendChild(hlIcon("up")); next.appendChild(hlIcon("down"));
    box.append(count, previous, next); box.hidden = true;
    state.ui = { box, count, previous, next, search };
    if (search) search.insertBefore(box, view.searchInput.nextSibling); else view.toolbar.prepend(box);
    if (view.overflow) {
      const toggle = state.ui.toggle = h("button", "cx-button cx-matches-toggle");
      toggle.type = "button"; setText(toggle, view.labels.matchesHighlight);
      toggle.addEventListener("click", () => VIEW_MODES.setHighlight(view, !view.highlightOn).catch(error => view.emit("error", { error })));
      view.overflow.panel.prepend(toggle);
    }
  }
  function hlRun(view, direction, focus) {
    hlStep(view, direction, focus).catch(error => { if (error.name !== "AbortError") view.emit("error", { error }); });
  }

  VIEW_MODES.highlightStart = view => {
    if (view.hl) return;
    const signal = view.lifetime.signal, state = view.hl = { columns: new Map(), counts: new Uint32Array(0), list: [], total: 0, complete: true, current: null };
    signal.addEventListener("abort", () => { state.counter?.abort(); clearTimeout(state.retopTimer); clearTimeout(state.announceTimer); clearTimeout(state.pageTimer); }, { once: true });
    hlBuild(view);
    const host = view.host, input = view.searchInput, refresh = () => view.destroyed || hlRefresh(view);
    if (view.kind === "grid") {
      state.shape = view.acceptedQuery && VIEW_MODES.gridResultShape(view.acceptedQuery);
      // A new result (search, filters, sort) moves the rows and the current match starts again; another page of the same
      // result (paged grids) keeps it.
      host.addEventListener("canopyx:query", () => {
        const shape = view.acceptedQuery && VIEW_MODES.gridResultShape(view.acceptedQuery);
        if (shape !== state.shape) { state.current = null; state.shape = shape; }
        refresh();
      }, { signal });
    } else if (input) {
      let timer = 0;
      input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(refresh, 150); }, { signal });
      // Escape can clear the box without an input event.
      input.addEventListener("keydown", event => { if (event.key === "Escape") setTimeout(() => { if (state.text !== input.value) refresh(); }); }, { signal });
    }
    // In the capture phase, before the box's own handling: a grid applies changed text first, and a tree's open result list
    // chooses a result (and closes before its own handler returns).
    input?.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing || !state.active || event.altKey || event.ctrlKey || event.metaKey) return;
      if (view.kind === "grid" ? view.pendingQuery || view.searchTimer != null || view.acceptedQuery?.search !== input.value :
        input.getAttribute("aria-expanded") === "true") return;
      event.preventDefault(); event.stopImmediatePropagation(); hlRun(view, event.shiftKey ? -1 : 1, false);
    }, { signal, capture: true });
    host.addEventListener("keydown", event => {
      if (event.key !== "F3" || !state.active || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault(); hlRun(view, event.shiftKey ? -1 : 1, true);
    }, { signal });
    hlRefresh(view);
  };
  VIEW_MODES.setHighlight = (view, enabled) => {
    if (!view.hl) VIEW_MODES.highlightStart(view);
    if (!view.hl.ui) hlBuild(view);
    if (view.highlightOn !== enabled) { view.highlightOn = enabled; hlRefresh(view); view.stateChanged(); }
    hlSync(view);
    return view.hl.counting.then(() => undefined);
  };
  VIEW_MODES.matches = view => {
    const state = view.hl;
    return Object.freeze(state ? { enabled: !!view.highlightOn, total: state.active ? state.total : 0, current: state.active ? hlPosition(view) : 0, complete: !state.active || state.complete } :
      { enabled: !!view.highlightOn, total: 0, current: 0, complete: true });
  };
  VIEW_MODES.step = (view, direction, focus) => {
    if (!view.hl) VIEW_MODES.highlightStart(view);
    return hlStep(view, direction, focus);
  };

  // Painting: every row is unmarked before it is painted and marked after; the drawer is followed while it is open.
  for (const View of [TreeGrid, VIEW_MODES.DataGrid]) {
    if (!View) continue;
    const paint = View.prototype.fillRow;
    View.prototype.fillRow = function (element, row) {
      hlUnmark(element);
      paint.call(this, element, row);
      if (this.hl) hlPaintRow(this, element, row);
    };
  }
  if (VIEW_MODES.DataGrid) {
    const proto = VIEW_MODES.DataGrid.prototype, wrap = open => open && function (...args) {
      const result = open.apply(this, args);
      if (this.hl && this.recordDrawer) hlPaintDrawer(this, this.recordDrawer);
      return result;
    };
    // The filter editor part assigns openGridDrawer when it installs, before or after this part.
    let open = wrap(Object.getOwnPropertyDescriptor(proto, "openGridDrawer")?.value);
    Object.defineProperty(proto, "openGridDrawer", { configurable: true, get: () => open, set(value) { open = wrap(value); } });
    // A host source's pages arrive as the reader scrolls: the loaded rows are counted again, a moment after the last one.
    const store = proto.storePage;
    proto.storePage = function (...args) {
      const result = store.apply(this, args), state = this.hl;
      if (state && state.active && !(this.view.source.kind === "inline" && !this.opts.source)) {
        clearTimeout(state.pageTimer);
        state.pageTimer = setTimeout(() => this.destroyed || hlRecount(this), 150);
      }
      return result;
    };
  }
  // Shown columns change with fitting, the Columns menu, column order and the layout: count the columns now shown.
  for (const View of [TreeGrid, VIEW_MODES.DataGrid]) {
    if (!View) continue;
    const header = View.prototype.buildHeader;
    View.prototype.buildHeader = function (...args) {
      const result = header.apply(this, args), state = this.hl;
      if (state && state.active && !state.headerQueued && hlColsKey(this) !== state.colsKey) {
        state.headerQueued = true;
        queueMicrotask(() => { state.headerQueued = false; if (!this.destroyed && hlColsKey(this) !== state.colsKey) hlRefresh(this); });
      }
      return result;
    };
  }
  // A tree's visible rows change as it expands, collapses, sorts and filters: count again once they settle. A move in the
  // meantime counts at once (hlStep).
  const HL_RETOP = TreeGrid.prototype.retop;
  TreeGrid.prototype.retop = function (...args) {
    const result = HL_RETOP.apply(this, args), state = this.hl;
    if (state && state.active && state.rowsSeen !== this.rows) {
      state.rowsSeen = this.rows; clearTimeout(state.retopTimer);
      state.retopTimer = setTimeout(() => this.destroyed || hlRecount(this), 100);
    }
    return result;
  };
