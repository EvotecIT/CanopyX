  // ---------- grid toolbar, column layout and named views ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridFilters: "Filters", gridColumn: "Column", gridOperator: "Condition",
    gridValueType: "Raw value type", gridText: "Text", gridBoolean: "Boolean",
    gridRemoveFilter: "Remove {column} filter", gridApply: "Apply", gridClearFilters: "Clear all filters",
    gridFitAllColumns: "Fit all columns",
    gridViews: "Views", gridViewName: "View name", gridSaveView: "Save view", gridRemoveView: "Remove view",
    gridResetView: "Reset view", gridChooseView: "Choose a saved view", gridInvalidFilter: "Enter a valid filter value.",
    gridContains: "contains", gridStartsWith: "starts with", gridIn: "is any of", gridIsNull: "is missing", gridIsNotNull: "is present",
    gridFindColumn: "Find a column…", gridShowAllColumns: "Show all", gridResetColumns: "Reset columns",
    gridReorderColumn: "{column}: drag, or press Alt+Up or Alt+Down to move", gridPinnedLeft: "Pinned left", gridPinnedRight: "Pinned right"
  }));

  function gridButton(text, run) {
    const button = h("button", "cx-button"); button.type = "button"; setText(button, text);
    button.addEventListener("click", run); return button;
  }

  function gridInputLabel(text, input) {
    const label = h("label", "cx-grid-field"); label.appendChild(document.createTextNode(text)); label.appendChild(input); return label;
  }

  function gridOption(value, text) {
    const option = h("option"); option.value = value; setText(option, text); return option;
  }

  Object.assign(DataGrid.prototype, {
    // A control switched off in the toolbar options is never built; its API methods stay available.
    buildGridControls() {
      this.controlFlyouts = [];
      this.buildGridFilters();
      if (this.tools.columns !== false) this.buildGridColumns();
      if (this.tools.views !== false) {
        this.buildSavedViews();
        this.toolbar.querySelector(".cx-grid-views .cx-grid-panel").appendChild(gridButton(this.labels.gridResetView, () => this.resetView().catch(() => {})));
      }
      this.buildExportControls();
      this.disposeControls = () => this.controlFlyouts.forEach(flyout => flyout.dispose());
      document.addEventListener("pointerdown", event => {
        for (const details of this.toolbar.children) if (details.open && !details.contains(event.target)) details.open = false;
      }, { signal: this.lifetime.signal });
    },

    controlPanel(title, className, onOpen) {
      const details = h("details", "cx-columns " + className), summary = h("summary", "cx-btn"), panel = h("div", "cx-columns-list cx-grid-panel cx-pop");
      summary.setAttribute("role","button");
      if (className !== "cx-grid-filters") summary.classList.add("ghost");
      setText(summary, title); details.append(summary, panel); this.toolbar.appendChild(details);
      // The icon is named by the control: filter, columns, views or export (the more menu's summary is its own icon).
      summary.prepend(gridIcon(className.slice(8).replace("rs", "r")));
      // The open panel is a manual popover in the top layer, so no overflow or stacking context of the grid or its host
      // clips it; it stays in the grid's DOM and keeps its theme, events and focus order. Without the popover API the
      // panel is viewport-fixed (CSS), which escapes overflow clipping as well. Closing a menu closes the menus and entries
      // inside it (the phone layout moves Views and Export into the more menu).
      panel.popover = "manual";
      const flyout = watchFlyout(details, panel, () => details.open); this.controlFlyouts.push(flyout);
      details.addEventListener("toggle", () => { if (details.open) { if (panel.isConnected) panel.showPopover?.(); if (onOpen) onOpen(panel); flyout.position(); } else { panel.hidePopover?.(); for (const inner of panel.querySelectorAll("details[open]")) inner.open = false; } });
      details.addEventListener("keydown", event => {
        if (event.key === "Escape" && details.open) { details.open = false; summary.focus(); event.preventDefault(); event.stopPropagation(); }
      });
      return { details, panel };
    },

    // The Columns menu body ships with the optional editor and renders on first open.
    buildGridColumns() { this.controlPanel(this.labels.columns, "cx-grid-columns", panel => this.renderGridColumns(panel)); },
    syncColumnControls() {},
    async renderGridColumns(panel) {
      setText(panel, this.labels.loading);
      try { await loadGridFilterEditor(); if (!this.destroyed && panel.parentElement.open) { this.renderGridColumns(panel); this.controlFlyouts.forEach(item => item.position()); } }
      catch (error) { if (!this.destroyed) { setText(panel, this.labels.gridLoadFailed); this.emit("error", { error }); } }
    },
    // A moved column joins the pinned group of the column it lands next to, as header moves do.
    moveColumnChoice(column, target, after) {
      column.pin = target.pin;
      const ids = this.columns.map(item => item.id).filter(id => id !== column.id);
      ids.splice(ids.indexOf(target.id) + after, 0, column.id); this.setColumnOrder(ids);
    },
    showAllColumns() {
      for (const column of this.columns) column.hidden = false;
      this.buildHeader(); this.syncColumnControls(); this.render(); this.noteViewPreferenceIntent?.(); this.stateChanged();
    },
    resetColumns() {
      const state = this.getState(); this.restorePreferenceIntent = this.viewPreferenceIntent;
      this.applyStatePresentation({ ...state, columns: this.readGridState({ ...state, columns: this.defaultState.columns }).columns });
      this.noteViewPreferenceIntent?.(); this.stateChanged();
    },

    buildSavedViews() {
      const panel = this.controlPanel(this.labels.gridViews, "cx-grid-views").panel;
      const choice = this.savedChoice = h("select"), name = h("input"); name.type = "text"; name.maxLength = 100;
      choice.setAttribute("aria-label", this.labels.gridChooseView);
      panel.appendChild(choice); panel.appendChild(gridInputLabel(this.labels.gridViewName, name));
      const error = h("p", "cx-grid-control-error"); error.setAttribute("role", "status");
      const run = action => {
        try { Promise.resolve(action()).then(() => setText(error, ""), failure => setText(error, failure.message)); }
        catch (failure) { setText(error, failure.message); }
      };
      panel.appendChild(gridButton(this.labels.gridApply, () => run(() => this.applySavedView(choice.value))));
      panel.appendChild(gridButton(this.labels.gridSaveView, () => run(() => this.saveView(name.value))));
      panel.appendChild(gridButton(this.labels.gridRemoveView, () => run(() => this.removeSavedView(choice.value)))); panel.appendChild(error);
      this.syncSavedViews();
    },
    syncSavedViews() {
      if (!this.savedChoice) return;
      const selected = this.savedChoice.value; this.savedChoice.textContent = "";
      this.savedChoice.appendChild(gridOption("", this.labels.gridChooseView));
      this.getSavedViews().forEach(name => this.savedChoice.appendChild(gridOption(name, name)));
      if (this.savedViews.has(selected)) this.savedChoice.value = selected;
    }
  });
