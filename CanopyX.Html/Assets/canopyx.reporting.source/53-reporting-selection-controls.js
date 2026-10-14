  // ---------- native row checkboxes and explicit page/query selection controls ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridSelectionQueryCount: "{count} matching records selected; {excluded} excluded",
    gridSelectRecord: "Select record {id}",
    gridSelection: "Selection", gridSelectPage: "Select page", gridSelectMatching: "Select all matching"
  }));
  const SELECTION_CONTROLS_BASE = {};
  for (const name of ["buildGridControls", "fillRow", "refreshRowState", "onClick", "onKey", "setQuery", "closeMenusOutside"])
    SELECTION_CONTROLS_BASE[name] = DataGrid.prototype[name];
  Object.assign(DataGrid.prototype, {
    // The header selection menu closes with the toolbar menus (57-toolbar-panels.js).
    closeMenusOutside(node) {
      SELECTION_CONTROLS_BASE.closeMenusOutside.call(this, node);
      const menu = this.headRow?.querySelector(".cx-header-selection");
      if (menu?.open && !menu.contains(node)) menu.open = false;
    },
    buildGridControls() {
      SELECTION_CONTROLS_BASE.buildGridControls.call(this);
      if (!this.view.reporting?.selectionControls) return;
      const controls = h("div", "cx-grid-selection-controls"), status = this.selectionStatus = h("span", "cx-grid-selection-status");
      controls.setAttribute("role", "group"); controls.setAttribute("aria-label", this.labels.gridSelection); status.setAttribute("role", "status");
      const page = this.multi && this.paged ? gridButton(this.labels.gridSelectPage, () => this.runReportingSelection(() => this.selectPage())) : null;
      const all = this.multi ? gridButton(this.labels.gridSelectMatching, () => this.runReportingSelection(() => this.selectAllMatching())) : null;
      const clear = gridButton(this.labels.gridClearSelection, () => this.setSelection([]));
      this.selectionButtons = [page, all, clear].filter(Boolean);
      controls.append(...this.selectionButtons, status); this.selectionControls = controls; this.syncSelectionControls();
    },
    syncSelectionControls() {
      if (!this.selectionStatus) return;
      for (const button of this.selectionButtons) button.disabled = !!this.selectionControlBusy || !this.acceptedQuery || !!this.pendingQuery;
      for (const [row, element] of this.rendered) if (!row.status) {
        const check = element.querySelector(".cx-grid-row-select");
        if (check) { check.checked = this.reportingRowSelected(row); check.disabled = !!this.pendingQuery; }
      }
      const query = this.querySelection, format = numberFormat(this.lang);
      setText(this.selectionStatus, query ? fill(query.matched === null ? this.labels.gridSelectionQueryUnknown : this.labels.gridSelectionQueryCount,
        { count: query.matched === null ? "" : format.format(Math.max(0, query.matched - this.selectionExcluded.size)), excluded: format.format(this.selectionExcluded.size) }) :
        fill(this.labels.gridSelectionCount, { count: format.format(this.selected.size) }));
      const header = this.headRow?.querySelector(".cx-header-check"), count = query ? query.matched === null ? null : query.matched - this.selectionExcluded.size : this.selected.size;
      if (header) { header.dataset.cxChecked = count === 0 ? "false" : count === this.snapshot?.matched ? "true" : "mixed"; header.setAttribute("aria-label", this.labels.gridSelection + " · " + this.selectionStatus.textContent); }
    },
    // The header checkbox opens the page and all-matching commands.
    buildHeaderSelection() {
      this.headerSelectionFlyout?.dispose();
      if (!this.selectionControls || !this.headCells[0]) return;
      const menu = h("details", "cx-columns cx-header-selection"), summary = h("summary"), panel = h("div", "cx-columns-list cx-grid-panel");
      summary.setAttribute("aria-label", this.labels.gridSelection); summary.classList.add("cx-header-check");
      summary.setAttribute("aria-haspopup", "menu"); summary.appendChild(gridIcon("check")); panel.appendChild(this.selectionControls); menu.append(summary, panel);
      this.headCells[0].prepend(menu);
      const flyout = this.headerSelectionFlyout = watchFlyout(menu, panel, () => menu.open);
      panel.popover = "manual";
      menu.addEventListener("toggle", () => { if (menu.open) { announceMenu(menu); if (panel.isConnected) panel.showPopover?.(); flyout.position(); } else panel.hidePopover?.(); });
      menu.addEventListener("keydown", event => { if (event.key === "Escape") { menu.open = false; summary.focus(); event.preventDefault(); } });
      this.syncSelectionControls();
    },    runReportingSelection(action) {
      this.selectionControlBusy = true; this.syncSelectionControls();
      Promise.resolve().then(action).catch(error => {
        if (!this.destroyed && error.name !== "AbortError") { this.selectionControlError = error.message; this.emit("error", { error }); }
      }).finally(() => {
        this.selectionControlBusy = false;
        if (!this.destroyed) {
          this.syncSelectionControls();
          if (this.selectionControlError) { setText(this.selectionStatus, this.selectionControlError); this.selectionControlError = null; }
        }
      });
    },
    setQuery(input, paging) {
      const pending = SELECTION_CONTROLS_BASE.setQuery.call(this, input, paging);
      this.syncSelectionControls(); return pending;
    },
    refreshRowState(element, row) {
      SELECTION_CONTROLS_BASE.refreshRowState.call(this, element, row);
      if (this.view.reporting?.selectionControls && !row.status) element.setAttribute("aria-selected", String(this.reportingRowSelected(row)));
    },
    fillRow(element, row) {
      SELECTION_CONTROLS_BASE.fillRow.call(this, element, row);
      if (!this.view.reporting?.selectionControls || row.status) return;
      const cell = element._cells[0].cell;
      let check = cell.querySelector(".cx-grid-row-select");
      if (!check) {
        check = h("input", "cx-grid-row-select"); check.type = "checkbox"; check.tabIndex = -1; cell.insertBefore(check, cell.firstChild);
        check.addEventListener("click", event => {
          if (!event.shiftKey) return;
          event.preventDefault(); const current = element._w;
          this.reportingSelectionIntent(current, !this.reportingRowSelected(current), true, event.ctrlKey || event.metaKey);
        });
        check.addEventListener("change", () => {
          this.reportingSelectionIntent(element._w, check.checked, false, false);
        });
        check.addEventListener("keydown", event => {
          if (event.key === " " && event.shiftKey) {
            event.preventDefault(); event.stopPropagation(); const current = element._w;
            this.reportingSelectionIntent(current, !this.reportingRowSelected(current), true, event.ctrlKey || event.metaKey);
          }
        });
      }
      check.checked = this.reportingRowSelected(row); check.disabled = !!this.pendingQuery;
      check.setAttribute("aria-label", fill(this.labels.gridSelectRecord, { id: row.key }));
    },
    reportingSelectionIntent(row, selected, range, additive) {
      this.runReportingSelection(() => range && this.multi && this.selectionAnchor != null ?
        this.selectRange(this.selectionAnchor, row._ri, { selected, additive }) : this.setReportingRowSelected(row, selected));
    },
    onClick(event) {
      const element = event.target.closest(".cx-row"), row = element?._w;
      if (this.view.reporting?.selectionControls && row && !row.status && !event.defaultPrevented &&
          !event.target.closest("a,button,input,select,textarea,[contenteditable]") && (event.shiftKey || event.ctrlKey || event.metaKey)) {
        this.setFocus(row, true); this.reportingSelectionIntent(row, event.shiftKey || !this.reportingRowSelected(row), event.shiftKey, event.ctrlKey || event.metaKey); return;
      }
      try { SELECTION_CONTROLS_BASE.onClick.call(this, event); }
      catch (error) {
        if (!this.view.reporting?.selectionControls) throw error;
        this.runReportingSelection(() => { throw error; }); return;
      }
      if (this.view.reporting?.selectionControls && row && !row.status && !event.defaultPrevented &&
          !event.target.closest("a,button,input,select,textarea,[contenteditable]")) this.selectionAnchor = row._ri;
    },
    onKey(event) {
      const element = event.target.closest(".cx-row"), row = element?._w;
      if (this.view.reporting?.selectionControls && row && !row.status && event.key === " " && !event.defaultPrevented &&
          !event.isComposing && !event.altKey && !event.target.closest("a,button,input,select,textarea,[contenteditable]")) {
        event.preventDefault(); this.reportingSelectionIntent(row, !this.reportingRowSelected(row), event.shiftKey, event.ctrlKey || event.metaKey); return;
      }
      return SELECTION_CONTROLS_BASE.onKey.call(this, event);
    }
  });
