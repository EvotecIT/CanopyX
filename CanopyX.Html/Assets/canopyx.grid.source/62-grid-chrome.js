  Object.assign(DataGrid.prototype, {
    buildGridChrome() {
      const signal = this.lifetime.signal;
      this.noun = this.view.noun || this.labels.gridRows;
      if (this.searchInput && this.view.noun) {
        this.searchInput.placeholder = fill(this.labels.gridSearchNoun, { noun: this.noun });
        this.searchInput.setAttribute("aria-label", this.searchInput.placeholder);
      }
      const views = this.toolbar.querySelector(".cx-grid-views > summary");
      if (views) { views.textContent = ""; views.append(gridIcon("views"), document.createTextNode(this.labels.gridViews)); }
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
      const overflow = this.controlPanel(this.labels.gridMore, "cx-grid-overflow"); this.overflow = overflow;
      const summary = overflow.details.querySelector("summary"); summary.replaceChildren(gridIcon("more"));
      summary.classList.add("icon"); summary.setAttribute("aria-label", this.labels.gridMore);
      this.overflowButtons = [];
      for (const action of this.opts.actions || []) {
        if (!action || typeof action.label !== "string" || typeof action.run !== "function") throw new Error("CanopyX: actions need a label and handler.");
        const button = gridButton(action.label, () => act(() => this.runGridHook(signal => action.run({query:this.getQuery(),signal}), this.dataLifetime.signal)));
        overflow.panel.appendChild(button); this.overflowButtons.push(button);
      }
      const details = this.toolbar.querySelector(".cx-grid-details");
      if (details) overflow.panel.appendChild(details);
      if (!this.toolbar.querySelector(".cx-grid-print")) {
        const print = gridButton(this.labels.gridPrint, () => global.print()); print.classList.add("cx-grid-print"); overflow.panel.appendChild(print);
      } else overflow.panel.appendChild(this.toolbar.querySelector(".cx-grid-print"));
      this.primaryControls = [...this.toolbar.children].filter(item => item !== overflow.details);
      const exportPanel = this.toolbar.querySelector(".cx-grid-export");
      this.toolbar.insertBefore(this.spacer, exportPanel || overflow.details);
      this.toolbar.insertBefore(this.selectionBar, exportPanel || overflow.details);
      this.toolbar.insertBefore(this.toolbarSeparator, exportPanel || overflow.details);
      this.host.addEventListener("canopyx:select", () => this.syncGridChrome(), { signal });
      if (this.view.reporting?.grouping) {
        this.groupBar = h("div", "cx-groupbar"); const chip = h("span", "cx-gchip");
        setText(chip, this.columns.find(column => column.id === this.view.reporting.grouping.column).title);
        this.groupBar.append(document.createTextNode(this.labels.gridGroupedBy + " "), chip);
        if (typeof this.opts.onUngroup === "function") {
          const remove = gridDecorateButton(gridButton("", () => act(() => this.runGridHook(signal => this.opts.onUngroup({query:this.getQuery(),signal}), this.dataLifetime.signal))), "close", true);
          remove.setAttribute("aria-label", this.labels.gridRemoveGrouping); chip.appendChild(remove);
        }
      }
      this.syncGridChrome();
      signal.addEventListener("abort",()=>{this.headerSelectionFlyout?.dispose();this.headerMenusLifetime?.abort();this.closeGridPopover(false);},{once:true});
    },
    syncGridChrome() {
      if (!this.selectionBar) return;
      const count = this.querySelection ? this.querySelection.matched === null ? null : Math.max(0,this.querySelection.matched - this.selectionExcluded.size) : this.selected.size;
      const selected = count === null || count > 0;
      this.selectionBar.hidden = !selected; this.toolbarSeparator.hidden = !selected;
      this.host.classList.toggle("cx-has-selection", selected);
      setText(this.selectedCount, count === null ? this.labels.gridSelectionQueryUnknown.replace("{excluded}",String(this.selectionExcluded.size)) :
        fill(this.labels.gridSelectionCount, {count:numberFormat(this.lang).format(count)}));
      const filterSummary = this.toolbar.querySelector(".cx-grid-filters > summary"), active = gridFilterCount(this.acceptedQuery);
      if (filterSummary) {
        filterSummary.classList.toggle("active", !!active); filterSummary.querySelector(".badge")?.remove();
        if (active) { const badge = h("span", "badge"); setText(badge,String(active)); filterSummary.appendChild(badge); }
      }
      for (const button of this.selectionBar.querySelectorAll("button")) button.disabled = !!this.pendingQuery || !this.acceptedQuery;
      this.syncGridStatus?.();
    },
    buildHeaderSelection() {
      this.headerSelectionFlyout?.dispose();
      if (!this.selectionControls || !this.headCells[0]) return;
      const menu = h("details", "cx-columns cx-header-selection"), summary = h("summary"), panel = h("div", "cx-columns-list cx-grid-panel");
      summary.setAttribute("aria-label", this.labels.gridSelection); summary.classList.add("cx-header-check");
      summary.appendChild(gridIcon("check")); panel.appendChild(this.selectionControls); menu.append(summary,panel);
      this.headCells[0].prepend(menu);
      const flyout = this.headerSelectionFlyout = watchFlyout(menu,panel,()=>menu.open);
      menu.addEventListener("toggle",()=>{if(menu.open)flyout.position();});
      menu.addEventListener("keydown",event=>{if(event.key==="Escape"){menu.open=false;summary.focus();event.preventDefault();}});
    },
    updateGridPhone() {
      const phone = this.host.clientWidth <= 640;
      this.host.classList.toggle("cx-phone", phone);
      if (!this.overflow || phone === this.phone) return;
      this.phone = phone;
      for (const selector of [".cx-grid-views", ".cx-grid-export"]) {
        const item = this.host.querySelector(selector); if (!item) continue;
        if (phone) this.overflow.panel.appendChild(item);
        else this.toolbar.insertBefore(item, selector === ".cx-grid-views" ? this.spacer : this.overflow.details);
      }
      this.syncPinnedShadows();
    },
    syncPinnedShadows() {
      this.host.classList.toggle("cx-scroll-left", this.grid.scrollLeft > 0);
      this.host.classList.toggle("cx-scroll-right", this.grid.scrollLeft + this.grid.clientWidth < this.grid.scrollWidth - 1);
    }
  });
