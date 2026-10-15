  // ---------- toolbar menus shared by flat grids and trees ----------
  // Flat grids mix these into DataGrid; the tree tools part includes this part and mixes the same methods into TreeGrid.
  // They read only what both views have: toolbar, labels, lifetime, the saved-view methods and destroyed.
  function gridButton(text, run) {
    const button = h("button", "cx-button"); button.type = "button"; setText(button, text);
    // WebKit does not focus buttons on pointer activation. Keep subsequent menu keys with the clicked control.
    button.onclick = event => { button.focus({ preventScroll: true }); run(event); }; return button;
  }

  function gridInputLabel(text, input) {
    const label = h("label", "cx-grid-field"); label.appendChild(document.createTextNode(text)); label.appendChild(input); return label;
  }

  function gridOption(value, text) {
    const option = h("option"); option.value = value; setText(option, text); return option;
  }

  // A CanopyX menu that opens dispatches this event on the document with itself as detail.source; a host dispatches it on
  // the document, or on an element that holds views, to close their menus (closeMenus closes one view's).
  const MENU_EVENT = "canopyx:closemenus", announceMenu = source => document.dispatchEvent(new CustomEvent(MENU_EVENT, { detail: { source } }));
  const TOOLBAR_PANELS = {
    // Menus close on a pointer press or focus outside them, when another CanopyX menu opens and on the menu event; their
    // flyouts follow the viewport until the view is destroyed.
    startMenus() {
      this.controlFlyouts = [];
      this.disposeControls = () => this.controlFlyouts.forEach(flyout => flyout.dispose());
      // A menu event without a source closes every menu of the views inside its target (the document holds them all).
      for (const type of ["pointerdown", "focusin", MENU_EVENT]) document.addEventListener(type, event =>
        (type !== MENU_EVENT || event.target.contains(this.host)) && this.closeMenusOutside(event.detail?.source || event.target), { signal: this.lifetime.signal });
    },
    // Closes the toolbar menus (and the menus inside them, such as Views and Export in the phone more menu) and the column
    // popover that do not hold the node (the document closes every one).
    closeMenusOutside(node) {
      for (const details of this.toolbar.querySelectorAll(".cx-columns[open]")) if (!details.contains(node)) details.open = false;
      const popover = this.gridPopover;
      if (popover && !popover.panel.contains(node) && !popover.anchor?.contains(node)) this.closeGridPopover(false);
    },
    closeMenus() { this.closeMenusOutside(document); },

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
      details.addEventListener("toggle", () => { if (details.open) { announceMenu(details); if (panel.isConnected) panel.showPopover?.(); if (onOpen) onOpen(panel); flyout.position(); } else { panel.hidePopover?.(); for (const inner of panel.querySelectorAll("details[open]")) inner.open = false; } });
      details.addEventListener("keydown", event => {
        if (event.key === "Escape" && details.open) { details.open = false; summary.focus(); event.preventDefault(); event.stopPropagation(); }
      });
      return { details, panel };
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
    },

    // On phones Views and Export move into the more menu. A moved menu closes first: moving a shown popover takes it out
    // of the top layer while it stays open.
    placeMenus(phone) {
      if (this.overflow) for (const selector of [".cx-grid-views", ".cx-grid-export"]) {
        const item = this.toolbar.querySelector(selector); if (!item) continue; item.open = false;
        if (phone) this.overflow.panel.appendChild(item);
        else this.toolbar.insertBefore(item, selector === ".cx-grid-views" ? this.slots?.afterViews || this.spacer : this.overflow.details);
      }
    }
  };
