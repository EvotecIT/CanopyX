  Object.assign(DataGrid.prototype, {
    buildGridChrome() {
      const signal = this.lifetime.signal;
      this.noun = this.view.noun || this.labels.gridRows;
      if (this.searchInput && this.view.noun) {
        this.searchInput.placeholder = fill(this.labels.gridSearchNoun, { noun: this.noun });
        this.searchInput.setAttribute("aria-label", this.searchInput.placeholder);
      }
      this.spacer = h("span", "cx-spacer");
      this.selectionBar = h("div", "cx-selbar"); this.selectionBar.hidden = true;
      this.selectedCount = h("span"); this.selectedCount.setAttribute("role", "status"); this.selectionBar.appendChild(this.selectedCount);
      const act = action => Promise.resolve().then(action).catch(error => this.emit("error", {error}));
      this.selectionBar.appendChild(gridDecorateButton(gridButton(this.labels.gridCopy, () => act(() => this.copy({scope:"selected"}))), "copy", true));
      if (typeof this.opts.onChart === "function") this.selectionBar.appendChild(gridDecorateButton(gridButton(this.labels.gridChart, () => act(() =>
        this.runGridHook(signal => this.opts.onChart({query:this.getQuery(),selection:this.getSelectionDescriptor?.() ||
          {kind:"ids",ids:[...this.selected],revision:this.snapshot?.revision},signal}), this.dataLifetime.signal))), "chart", true));
      const clear = gridDecorateButton(gridButton("", () => this.setSelection([])), "close", true);
      clear.classList.add("icon"); clear.setAttribute("aria-label", this.labels.gridClearSelection); this.selectionBar.appendChild(clear);
      this.toolbarSeparator = h("span", "cx-sep");
      const overflow = this.overflow = this.controlPanel(this.labels.gridMore, "cx-grid-overflow");
      const summary = overflow.details.firstChild; summary.replaceChildren(gridIcon("more"));
      summary.classList.add("icon"); summary.setAttribute("aria-label", this.labels.gridMore);
      for (const action of [...this.opts.actions || [], ...pluginItems(this, "menuItems")]) overflow.panel.appendChild(this.gridAction(action, act));
      const recordDetails = this.toolbar.querySelector(".cx-grid-details");
      if (recordDetails) { recordDetails.prepend(gridIcon("columns")); recordDetails.classList.add("cx-btn", "ghost"); }
      overflow.panel.append(recordDetails, this.toolbar.querySelector(".cx-grid-print"));
      overflow.details.addEventListener("toggle", () => { if (overflow.details.open) this.syncPrintAvailability(); }, { signal });
      (this.toolbar.querySelector(".cx-grid-export") || overflow.details).before(this.spacer, this.selectionBar, this.toolbarSeparator);
      // Plugin toolbar items ({ label, run }, run as host actions run) follow Columns; Views (built later, and moved by the
      // phone layout) goes after them.
      for (const item of pluginItems(this, "toolbarItems")) this.spacer.before(this.gridAction(item, act));
      if (this.tools.more === false) { overflow.details.remove(); this.overflow = null; }
      this.host.addEventListener("canopyx:select", () => this.syncGridChrome(), { signal });
      this.syncGridChrome();
      signal.addEventListener("abort",()=>{this.headerSelectionFlyout?.dispose();this.headerMenusLifetime?.abort();this.closeGridPopover(false);},{once:true});
    },
    syncGridChrome() {
      this.syncPrintAvailability();
      if (!this.selectionBar) return;
      const count = this.querySelection ? this.querySelection.matched === null ? null : Math.max(0,this.querySelection.matched - this.selectionExcluded.size) : this.selected.size;
      const selected = count === null || count > 0;
      this.selectionBar.hidden = !selected; this.toolbarSeparator.hidden = !selected;
      this.host.classList.toggle("cx-has-selection", selected);
      gridCountLabel(this.selectedCount,count===null?this.labels.gridSelectionQueryUnknown:this.labels.gridSelectionCount,{count:numberFormat(this.lang).format(count),excluded:String(this.selectionExcluded?.size||0)});
      const filterSummary = this.toolbar.querySelector(".cx-grid-filters > summary"), active = gridFilterCount(this.acceptedQuery);
      if (filterSummary) {
        filterSummary.classList.toggle("active", !!active); filterSummary.querySelector(".badge")?.remove();
        if (active) { const badge = h("span", "badge"); setText(badge,String(active)); filterSummary.appendChild(badge); }
      }
      for (const button of this.selectionBar.querySelectorAll("button")) button.disabled = !!this.pendingQuery || !this.acceptedQuery;
      this.syncGridStatus?.();
    },
    updateGridPhone() {
      const phone = this.host.clientWidth <= 640, mode = this.layoutMode || "fit", autoRows = mode !== "cards" && (this.authoredAutoRows || phone && mode === "fit");
      this.host.classList.toggle("cx-phone", phone);
      if (phone === this.phone && autoRows === this.autoRows) return;
      const anchor = this.gridRowAnchor();
      const changedRows = autoRows !== this.autoRows;
      this.phone = phone;this.autoRows = autoRows;
      if (changedRows) { this.rowOffsets = null;this.rowHeights?.clear(); }
      this.rowWidthShape = null;
      if (!this.autoRows && !this.rowProjection) {
        const bounds = this.rowBounds(); this.total = Math.max(0, bounds.last - bounds.first + 1) * this.rowH;
        this.syncScrollRange(this.rowTop(anchor.index) + Math.min(anchor.offset, this.rowH - 1));
      }
      this.version++;this.scheduleRender();
      this.placeMenus(phone);
      this.syncPinnedShadows();
    },
    syncPinnedShadows() {
      const overflow=this.grid.scrollWidth>this.grid.clientWidth+1,pins=overflow&&(this.pinnedLeftWidth||this.pinnedRightWidth);
      this.host.classList.toggle("cx-scroll-x",overflow);
      this.host.classList.toggle("cx-scroll-left", !!pins&&this.grid.scrollLeft > 0);
      this.host.classList.toggle("cx-scroll-right", !!pins&&this.grid.scrollLeft + this.grid.clientWidth < this.grid.scrollWidth - 1);
    },
    // The reporting runtime adds content entries (render) to these handler entries.
    gridAction(action, act) {
      if (!action || typeof action.label !== "string" || typeof action.run !== "function") throw new Error("CanopyX: actions need a label and handler.");
      return gridButton(action.label, () => act(() => this.runGridHook(signal => action.run({query:this.getQuery(),signal,api:this.host.canopyx}), this.dataLifetime.signal)));
    }
  });
