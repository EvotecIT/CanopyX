  // ---------- facet panel: the panel, its place beside or above the grid, and the phone sheet ----------
  // The panel sits beside the grid (position "side") or above it ("top") in a frame that takes the grid element's place, or
  // in an element the host names (target). It has a heading, Clear all, a collapse switch and one section per facet, each
  // with its own collapse switch and Clear. When the frame is too narrow (a phone, a narrow column) the panel leaves the page
  // and a "Filter by" button in the grid's toolbar opens it as a full-screen sheet. Counts refresh after every accepted query
  // and live change, facet by facet with a pause between them so a large inline dataset does not block the page; a newer
  // refresh cancels an older one. Choices apply as the reader's own conditions after a short pause, and the result count is
  // announced politely.
  let facetSeq = 0;
  const FACET_ICON = '<path d="M4 6h16M7 12h10M10 18h4"/>';

  Object.assign(DataGrid.prototype, {
    startFacets() {
      if (this.facetPanel) return;
      const options = this.facetOptions = facetOptions(this), id = this.id + "-facets-" + ++facetSeq, signal = this.lifetime.signal;
      this.facetColumns = options.facets.map(facet => Object.assign(facet, { hosted: options.hosted }));
      this.facetOpen ??= options.open;
      // Reset view returns the panel to its declared open state too.
      if (this.defaultState) this.defaultState.facets = { open: options.open };
      const panel = this.facetPanel = h("aside", "cx-host cx-chrome cx-facets"), head = h("div", "cx-facets-h"), title = h("h2", "cx-facets-title");
      const clear = gridButton(this.labels.gridClearAll, () => this.facetClearAll()), toggle = gridButton("", () => this.setFacetPanelOpen(!this.facetOpen));
      const list = h("div", "cx-facets-list"), live = this.facetLive = h("p", "cx-sr-only");
      panel.id = id; panel.setAttribute("aria-labelledby", id + "-title"); title.id = id + "-title"; setText(title, options.label || this.labels.gridFacetPanel);
      live.setAttribute("aria-live", "polite"); toggle.classList.add("cx-facets-toggle"); toggle.setAttribute("aria-controls", id + "-list"); list.id = id + "-list";
      toggle.appendChild(gridIcon(null, FACET_ICON)); clear.classList.add("cx-facets-clear"); this.facetClear = clear;
      toggle.hidden = !options.collapsible;
      head.append(title, clear, toggle); panel.append(head, list, live);
      panel.setAttribute("data-cx-position", options.position); panel.style.setProperty("--cx-facets-w", options.width + "px");
      this.facetSections = this.facetColumns.map(facet => this.facetSection(facet, list));
      // The frame: the panel and the grid element side by side or stacked, in the grid element's place.
      if (options.target) options.target.appendChild(panel);
      else {
        const frame = this.facetFrame = h("div", "cx-facet-frame");
        frame.setAttribute("data-cx-position", options.position);
        this.host.before(frame); frame.append(panel, this.host);
      }
      this.facetTheme = watchOverlayTheme(this.host, panel, signal);
      // The button that opens the sheet when the panel does not fit, including grids without a toolbar.
      const sheetButton = this.facetSheetButton = gridButton(this.labels.gridFacetPanel, () => this.openFacetSheet());
      sheetButton.classList.add("cx-btn", "cx-facets-open"); sheetButton.prepend(gridIcon(null, FACET_ICON)); sheetButton.hidden = true;
      sheetButton.setAttribute("aria-haspopup", "dialog");
      const anchor = this.toolbar.querySelector(".cx-grid-filters") || this.toolbar.querySelector(".cx-grid-columns") || this.spacer;
      if (this.opts.toolbar === false) this.host.prepend(sheetButton);
      else if (anchor?.parentNode === this.toolbar) anchor.before(sheetButton); else this.toolbar.prepend(sheetButton);
      this.facetResize = new ResizeObserver(() => requestAnimationFrame(() => this.destroyed || this.facetFit()));
      this.facetResize.observe(this.facetFrame || this.host);
      if (this.facetFrame) this.facetResize.observe(this.host);
      // Paging and sorting leave the counts as they are: only a query that counts other rows refreshes them.
      this.host.addEventListener("canopyx:query", () => { if (facetShape(this.acceptedQuery) !== this.facetCounted) this.facetRefresh(); }, { signal });
      this.host.addEventListener("canopyx:rowsChanged", () => { clearTimeout(this.facetLiveTimer); this.facetLiveTimer = setTimeout(() => this.facetRefresh(), 300); }, { signal });
      signal.addEventListener("abort", () => this.facetDestroy(), { once: true });
      this.facetSync(); this.facetFit();
      if (this.acceptedQuery) this.facetRefresh();
    },
    facetSection(facet, list) {
      const section = h("section", "cx-facet"), head = h("h3", "cx-facet-h"), toggle = h("button", "cx-facet-toggle"), name = h("span", "cx-facet-name"), badge = h("span", "cx-facet-badge");
      const clear = gridButton("", () => this.facetApply(facet, facet.kind === "list" ? [] : { low: null, high: null })), body = h("div", "cx-facet-b"), custom = h("p", "cx-facet-note cx-facet-custom");
      const failure = h("p", "cx-facet-note cx-facet-error"), spoken = h("span", "cx-sr-only");
      const bodyId = this.facetPanel.id + "-" + facet.column;
      section.setAttribute("data-cx-facet", facet.column); toggle.type = "button"; toggle.setAttribute("aria-controls", bodyId); body.id = bodyId;
      // The heading's name is the column and, for a reader of the screen, how many values are chosen; the badge shows it.
      badge.setAttribute("aria-hidden", "true");
      setText(name, facet.label); toggle.append(name, badge, spoken); head.appendChild(toggle);
      clear.classList.add("cx-facet-clear"); clear.appendChild(gridIcon("close")); clear.setAttribute("aria-label", fill(this.labels.gridFacetClear, { column: facet.label }));
      clear.title = clear.getAttribute("aria-label");
      custom.hidden = true; custom.setAttribute("role", "status"); failure.hidden = true; failure.setAttribute("role", "status");
      const facetView = { grid: this, selection: target => facetSelection(this.queryForChange(), target), apply: (target, choice) => this.facetApply(target, choice), refresh: targets => this.facetRefresh(targets) };
      const content = facet.kind === "list" ? facetListBody(facetView, facet, body) : facetRangeBody(facetView, facet, body);
      body.prepend(custom, failure);
      const collapsed = () => { const closed = facet.collapsed; toggle.setAttribute("aria-expanded", String(!closed)); body.hidden = closed;
        toggle.title = fill(this.labels[closed ? "gridFacetExpand" : "gridFacetCollapse"], { column: facet.label }); };
      toggle.addEventListener("click", () => { facet.collapsed = !facet.collapsed; collapsed(); });
      collapsed();
      // The heading and its Clear stay in view while the section's values scroll under them.
      const top = h("div", "cx-facet-top"); top.append(head, clear);
      section.append(top, body); list.appendChild(section);
      return { facet, section, badge, spoken, clear, custom, failure, content, generation: 0, controller: null };
    },
    /** Applies a facet's choice after a short pause, so several quick choices make one query. */
    facetApply(facet, choice) {
      this.facetPending ||= new Map(); this.facetPending.set(facet.column, { facet, choice });
      clearTimeout(this.facetTimer);
      this.facetTimer = setTimeout(() => this.facetFlush(), 150);
    },
    facetFlush() {
      clearTimeout(this.facetTimer); this.facetTimer = 0;
      const pending = this.facetPending; this.facetPending = null;
      if (!pending || this.destroyed) return Promise.resolve();
      let query = this.queryForChange(true);
      for (const { facet, choice } of pending.values()) query = facetQuery(query, facet, choice);
      // setQuery reports its own failures (the error event); the result count is announced after a choice applies.
      return this.setQuery(query).then(() => this.facetAnnounce(), () => {});
    },
    facetClearAll() {
      clearTimeout(this.facetTimer); this.facetPending = null;
      let query = this.queryForChange(true);
      for (const facet of this.facetColumns) query = facetQuery(query, facet, facet.kind === "list" ? [] : { low: null, high: null });
      return this.setQuery(query).then(() => this.facetAnnounce(), () => {});
    },
    facetAnnounce() {
      const numbers = numberFormat(this.lang);
      setText(this.facetLive, ""); setText(this.facetLive, fill(this.labels.gridFacetResult, { count: numbers.format(this.snapshot?.matched ?? 0) }));
    },
    /**
     * Counts every facet (or the given ones, as a hosted list's search does) again for the accepted query. Each facet has its
     * own request: counting a facet again cancels only that facet's earlier count, and a newer full refresh stops an older one.
     */
    async facetRefresh(targets) {
      if (!this.facetPanel || !this.acceptedQuery || this.destroyed) return;
      const query = this.acceptedQuery, run = targets ? this.facetRun : this.facetRun = (this.facetRun || 0) + 1;
      if (!targets) this.facetCounted = facetShape(query);
      for (const section of this.facetSections) {
        if (targets && !targets.includes(section.facet)) continue;
        section.controller?.abort(); const controller = section.controller = new AbortController(), generation = ++section.generation;
        const current = () => !this.destroyed && run === this.facetRun && generation === section.generation;
        try {
          const counts = section.facet.hosted ? await facetHostedCounts(this, section.facet, section.content.search(), controller.signal) : facetInlineCounts(this, section.facet, query);
          if (current()) { section.failure.hidden = true; section.content.update(counts); }
        } catch (error) {
          if (current() && error?.name !== "AbortError") { setText(section.failure, fill(this.labels.queryFailed, { error: error.message })); section.failure.hidden = false; }
        } finally {
          if (section.controller === controller) section.controller = null;
          controller.abort();
        }
        // A pause between facets keeps the page responsive while a large inline dataset is counted.
        if (!section.facet.hosted) await new Promise(resolve => setTimeout(resolve, 0));
        if (this.destroyed || run !== this.facetRun) return;
      }
    },
    /** Badges, Clear buttons and the custom-condition notes follow the accepted query. */
    facetSync() {
      if (!this.facetPanel) return;
      const query = this.queryForChange(), numbers = numberFormat(this.lang);
      let active = 0;
      for (const section of this.facetSections || []) {
        const selection = facetSelection(query, section.facet), count = selection.values ? selection.values.length : selection.custom || selection.low != null || selection.high != null ? 1 : 0;
        active += count ? 1 : 0;
        setText(section.badge, selection.values ? numbers.format(count) : ""); section.badge.hidden = !selection.values || !count;
        setText(section.spoken, section.badge.hidden ? "" : ", " + fill(this.labels.gridFacetSelected, { count: numbers.format(count) }));
        section.clear.hidden = !count || !!selection.locked; section.section.classList.toggle("cx-facet-active", !!count);
        if (selection.custom) { setText(section.custom, this.labels.gridFacetCustom); section.custom.hidden = false; }
        else if (section.custom.textContent === this.labels.gridFacetCustom) section.custom.hidden = true;
        section.content.draw();
      }
      this.facetClear.hidden = !active;
      this.facetActive = active;
      if (this.facetSheetButton) {
        this.facetSheetButton.querySelector(".badge")?.remove();
        if (active) { const badge = h("span", "badge"); setText(badge, numbers.format(active)); this.facetSheetButton.appendChild(badge); }
      }
    },
    /** Shows the panel beside or above the grid when it fits, else leaves it to the sheet; applies the open state. */
    facetFit() {
      const panel = this.facetPanel, options = this.facetOptions;
      if (!panel || this.facetSheet) return;
      const width = (this.facetFrame || this.host).clientWidth, fits = options.target ? true : options.position === "side" ? width >= options.width + 480 : width > 640;
      this.facetFits = fits;
      panel.hidden = !fits; this.facetSheetButton.hidden = fits;
      this.facetFrame?.toggleAttribute("data-cx-sheet", !fits);
      panel.classList.toggle("cx-facets-closed", !this.facetOpen);
      // A side panel is as tall as the grid (at least 360 pixels); its facets scroll inside it.
      panel.style.height = options.position === "side" && this.facetFrame && this.facetOpen ? Math.max(360, this.host.offsetHeight) + "px" : "";
      const toggle = panel.querySelector(".cx-facets-toggle");
      toggle.setAttribute("aria-expanded", String(!!this.facetOpen));
      toggle.setAttribute("aria-label", this.labels[this.facetOpen ? "gridFacetPanelHide" : "gridFacetPanelShow"]);
      toggle.title = toggle.getAttribute("aria-label");
    },
    setFacetPanelOpen(open) {
      if (typeof open !== "boolean") return Promise.reject(new Error("CanopyX: the facet panel's open state is a boolean."));
      if (open !== this.facetOpen) { this.facetOpen = open; this.facetFit(); this.stateChanged(); this.emit("facetPanel", { open }); }
      return Promise.resolve(this.getFacetPanel());
    },
    getFacetPanel() {
      if (!this.facetPanel) return gridFreeze({ open: this.facetOpen ?? null, columns: (this.facetColumns || []).map(facet => facet.column) });
      return gridFreeze({ open: !!this.facetOpen, columns: this.facetColumns.map(facet => facet.column), active: this.facetActive || 0 });
    },
    /** The panel as a full-screen sheet, for widths it does not fit; Done or Escape closes it and focus returns to its button. */
    openFacetSheet() {
      if (this.facetSheet || !this.facetPanel) return;
      const sheet = this.facetSheet = h("dialog", "cx-host cx-chrome cx-grid-overlay cx-facet-sheet"), head = h("div", "cx-facet-sheet-h"), title = h("h2"), done = gridButton(this.labels.gridDone, () => sheet.close());
      const panel = this.facetPanel, home = panel.parentNode, next = panel.nextSibling, returnFocus = document.activeElement;
      const disposeTheme = watchOverlayTheme(this.host, sheet, this.lifetime.signal);
      sheet.addEventListener("close", disposeTheme, { once: true });
      title.id = this.id + "-facet-sheet"; sheet.setAttribute("aria-labelledby", title.id); setText(title, this.facetOptions.label || this.labels.gridFacetPanel);
      // The sheet heading names the panel, so the panel's own heading steps aside and its Clear all joins Done.
      const clear = this.facetClear, clearHome = clear.parentNode, clearNext = clear.nextSibling;
      done.classList.add("cx-btn"); head.append(title, clear, done); sheet.append(head, panel);
      panel.hidden = false; panel.classList.remove("cx-facets-closed"); panel.classList.add("cx-facets-in-sheet");
      document.body.appendChild(sheet); this.facetTheme.refresh();
      sheet.addEventListener("close", () => {
        if (this.facetPanel !== panel) { sheet.remove(); return; }   // The grid was destroyed meanwhile; the panel is gone.
        panel.classList.remove("cx-facets-in-sheet"); home?.insertBefore(panel, next); this.facetTheme.refresh(); clearHome.insertBefore(clear, clearNext);
        sheet.remove(); this.facetSheet = null; this.facetFit();
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      }, { once: true });
      sheet.showModal(); done.focus();
    },
    facetDestroy() {
      clearTimeout(this.facetTimer); clearTimeout(this.facetLiveTimer); this.facetResize?.disconnect(); this.facetTheme?.(); this.facetTheme = null;
      for (const section of this.facetSections || []) section.controller?.abort();
      const sheet = this.facetSheet; this.facetSheet = null;
      this.facetPanel?.remove(); this.facetSheetButton?.remove(); this.facetPanel = null;
      if (sheet) { sheet.close(); sheet.remove(); }
      if (this.facetFrame) { this.facetFrame.replaceWith(this.host); this.facetFrame = null; }
    }
  });

  // A grid's own clear-all controls (the chips, the empty state) clear the facets too, as they clear every condition.
  const FACET_SUMMARY = DataGrid.prototype.syncQuerySummary;
  DataGrid.prototype.syncQuerySummary = function () { FACET_SUMMARY.call(this); if (this.facetPanel) this.facetSync(); };
  // Date ranges show days in the grid's time zone, so a new zone redraws them.
  const FACET_ZONE = DataGrid.prototype.setTimeZone;
  DataGrid.prototype.setTimeZone = function (zone) { const result = FACET_ZONE.call(this, zone); if (this.facetPanel) this.facetSync(); return result; };
