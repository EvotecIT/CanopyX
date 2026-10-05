  // ---------- named preference controls keep defaults and failures visible ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridRenameView: "Rename view", gridDefaultView: "Make default", gridClearDefaultView: "Clear default",
    gridDefaultViewName: "Default view: {name}", gridNoDefaultView: "No default view",
    gridDefaultViewOption: "{name} (default)"
  }));
  const VIEW_CONTROLS_BUILD = DataGrid.prototype.buildSavedViews, VIEW_CONTROLS_SYNC = DataGrid.prototype.syncSavedViews;
  DataGrid.prototype.buildSavedViews = function () {
    if (!this.view.reporting) return VIEW_CONTROLS_BUILD.call(this);
    const panel = this.controlPanel(this.labels.gridViews, "cx-grid-views").panel;
    const choice = this.savedChoice = h("select"), name = h("input"), error = h("p", "cx-grid-control-error"),
      defaults = this.viewDefaultStatus = h("p", "cx-grid-view-default"), preference = this.viewPreferenceStatus = h("p", "cx-grid-view-storage");
    name.type = "text"; name.maxLength = 100; choice.setAttribute("aria-label", this.labels.gridChooseView);
    for (const status of [error, defaults, preference]) status.setAttribute("role", "status");
    panel.append(choice, defaults, preference, gridInputLabel(this.labels.gridViewName, name));
    const run = action => {
      try { Promise.resolve(action()).then(() => this.flushViewSettings()).then(() => setText(error, ""), failure => setText(error, failure.message)); }
      catch (failure) { setText(error, failure.message); }
    };
    panel.appendChild(gridButton(this.labels.gridApply, () => run(() => this.applySavedView(choice.value))));
    panel.appendChild(gridButton(this.labels.gridSaveView, () => run(() => this.saveView(name.value))));
    panel.appendChild(gridButton(this.labels.gridRenameView, () => run(() => this.renameSavedView(choice.value, name.value))));
    panel.appendChild(gridButton(this.labels.gridDefaultView, () => run(() => this.setDefaultView(choice.value))));
    panel.appendChild(gridButton(this.labels.gridClearDefaultView, () => run(() => this.setDefaultView(null))));
    panel.appendChild(gridButton(this.labels.gridRemoveView, () => run(() => this.removeSavedView(choice.value))));
    panel.appendChild(error); choice.addEventListener("change", () => { if (choice.value) name.value = choice.value; });
    this.syncSavedViews(); this.setViewPreferenceError(this.viewPreferenceError || "");
  };
  DataGrid.prototype.syncSavedViews = function () {
    VIEW_CONTROLS_SYNC.call(this);
    if (!this.view.reporting || !this.savedChoice) return;
    for (const option of this.savedChoice.options) if (option.value === this.defaultSavedView)
      setText(option, fill(this.labels.gridDefaultViewOption, { name: option.value }));
    if (this.viewDefaultStatus) setText(this.viewDefaultStatus, this.defaultSavedView ?
      fill(this.labels.gridDefaultViewName, { name: this.defaultSavedView }) : this.labels.gridNoDefaultView);
  };
