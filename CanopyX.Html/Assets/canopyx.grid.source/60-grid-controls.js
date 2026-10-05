  // ---------- grid toolbar, column layout and named views ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridFilters: "Filters", gridColumn: "Column", gridOperator: "Condition", gridValue: "Value (UTC for dates)",
    gridValueType: "Raw value type", gridText: "Text", gridBoolean: "Boolean", gridAddFilter: "Add filter",
    gridRemoveFilter: "Remove {column} filter", gridApply: "Apply", gridClearFilters: "Clear filters",
    gridMoveEarlier: "Move {column} earlier", gridMoveLater: "Move {column} later",
    gridFitColumn: "Fit {column}", gridFitAllColumns: "Fit all columns",
    gridViews: "Saved views", gridViewName: "View name", gridSaveView: "Save view", gridRemoveView: "Remove view",
    gridResetView: "Reset view", gridChooseView: "Choose a saved view", gridInvalidFilter: "Enter a valid filter value.",
    gridContains: "contains", gridStartsWith: "starts with", gridIn: "is any of (one per line)", gridIsNull: "is missing", gridIsNotNull: "is present"
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
    buildGridControls() {
      this.controlFlyouts = [];
      this.buildGridColumns(); this.buildGridFilters(); this.buildSavedViews();
      this.buildExportControls();
      this.toolbar.appendChild(gridButton(this.labels.gridResetView, () => this.resetView().catch(() => {})));
      this.disposeControls = () => this.controlFlyouts.forEach(flyout => flyout.dispose());
      document.addEventListener("pointerdown", event => {
        for (const details of this.toolbar.children) if (details.open && !details.contains(event.target)) details.open = false;
      }, { signal: this.lifetime.signal });
    },

    controlPanel(title, className, onOpen) {
      const details = h("details", "cx-columns " + className), summary = h("summary"), panel = h("div", "cx-columns-list cx-grid-panel");
      setText(summary, title); details.append(summary, panel); this.toolbar.appendChild(details);
      const flyout = watchFlyout(details, panel, () => details.open); this.controlFlyouts.push(flyout);
      details.addEventListener("toggle", () => { if (details.open) { if (onOpen) onOpen(panel); flyout.position(); } });
      details.addEventListener("keydown", event => {
        if (event.key === "Escape" && details.open) { details.open = false; summary.focus(); event.preventDefault(); event.stopPropagation(); }
      });
      return { details: details, panel: panel };
    },

    buildGridColumns() {
      this.columnPanel = this.controlPanel(this.labels.columns, "cx-grid-columns", () => this.syncColumnControls()).panel;
      this.syncColumnControls();
    },
    syncColumnControls() {
      if (!this.columnPanel) return;
      const active = document.activeElement, columnId = active && active.getAttribute("data-cx-layout-column"), action = active && active.getAttribute("data-cx-layout-action");
      this.columnPanel.textContent = "";
      this.columns.forEach((column, index) => {
        const row = h("div", "cx-grid-column-choice"), input = h("input"); input.type = "checkbox"; input.checked = !column.hidden;
        input.disabled = !column.hidden && this.visibleColumns().length === 1;
        input.setAttribute("data-cx-layout-column", column.id); input.setAttribute("data-cx-layout-action", "visible");
        input.addEventListener("change", () => this.setColumnVisible(column.id, input.checked));
        row.appendChild(gridInputLabel(column.title, input));
        for (const [delta, label] of [[-1, "gridMoveEarlier"], [1, "gridMoveLater"]]) {
          const move = gridButton(delta < 0 ? "↑" : "↓", () => {
            const ids = this.columns.map(item => item.id), at = ids.indexOf(column.id), next = at + delta;
            if (next >= 0 && next < ids.length) { [ids[at], ids[next]] = [ids[next], ids[at]]; this.setColumnOrder(ids); }
          });
          move.disabled = index + delta < 0 || index + delta >= this.columns.length;
          move.setAttribute("aria-label", fill(this.labels[label], { column: column.title }));
          move.setAttribute("data-cx-layout-column", column.id); move.setAttribute("data-cx-layout-action", delta < 0 ? "earlier" : "later"); row.appendChild(move);
        }
        this.columnPanel.appendChild(row);
        const fit = gridButton("↔", () => { if (!this.pendingQuery && this.acceptedQuery) this.autoFitColumn(column.id); });
        fit.disabled = !!this.pendingQuery || !this.acceptedQuery;
        fit.setAttribute("aria-label", fill(this.labels.gridFitColumn, { column: column.title })); fit.title = fit.getAttribute("aria-label");
        fit.setAttribute("data-cx-layout-column", column.id); fit.setAttribute("data-cx-layout-action", "fit"); row.appendChild(fit);
      });
      const fitAll = gridButton(this.labels.gridFitAllColumns, () => { if (!this.pendingQuery && this.acceptedQuery) this.autoFitColumns(); });
      fitAll.disabled = !!this.pendingQuery || !this.acceptedQuery; this.columnPanel.appendChild(fitAll);
      if (columnId) {
        const target = [...this.columnPanel.querySelectorAll("[data-cx-layout-column]")].find(input =>
          input.getAttribute("data-cx-layout-column") === columnId && input.getAttribute("data-cx-layout-action") === action && !input.disabled);
        const available = [...this.columnPanel.querySelectorAll("[data-cx-layout-column]")].filter(input =>
          input.getAttribute("data-cx-layout-column") === columnId && !input.disabled);
        const fallback = available.find(input => input.getAttribute("data-cx-layout-action") !== "visible") || available[0];
        (target || fallback || this.columnPanel.parentNode.querySelector("summary")).focus({ preventScroll: true });
      }
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
