  // ---------- tree tools: the flat grid's toolbar on a tree ----------
  // The tree runtimes load this part for every tree; it holds the flat grid's toolbar menus, Columns menu, column fitting
  // and Export menu (the shared source parts listed in Build/tree-tools-parts.json) and these tree parts, which mix them
  // into TreeGrid. The toolbar reads, left to right: search, the filter switches, Columns, Views, then Export and the
  // more menu at the right edge, as on a flat grid.

  // The menus' texts are labels of every tree runtime (canopyx.source/02-tree-tool-labels.js on the tree runtimes, the flat
  // grid's labels on the grid runtimes), so the tree's labels, translated ones included, are complete here.
  Object.assign(TreeGrid.prototype, TOOLBAR_PANELS, COLUMNS_MENU, {
    /** Builds this tree's menus, then starts column fitting and auto height. Runs once per tree, after the part installs. */
    installTools() {
      this.checkTreeLayout();
      const bar = this.toolbar, tools = this.tools, labels = this.labels;
      this.host.classList.add("cx-chrome", "cx-tree-tools");
      this.exportScopes = [["visible", "gridVisibleRows"], ["selected", "gridSelectedRows"], ["all", "gridAllRows"]];
      // The search box takes the flat grid's look, with its icon.
      this.toolbar.querySelector(".cx-search")?.prepend(gridIcon("search"));
      this.startMenus();
      this.lifetime.signal.addEventListener("abort", () => { this.disposeControls(); this.host.classList.remove("cx-chrome", "cx-tree-tools", "cx-phone"); }, { once: true });
      if (tools.columns !== false && this.columns.length > 1) this.controlPanel(labels.columns, "cx-grid-columns", panel => this.renderGridColumns(panel));
      // The Views menu needs the remembered state the view's stateKey turns on; the API keeps views for the page without it.
      this.prepareSavedViews();
      if (tools.views !== false && this.stateKey()) {
        this.buildSavedViews();
        bar.querySelector(".cx-grid-views .cx-grid-panel").appendChild(gridButton(labels.gridResetView, () => this.resetView().catch(() => {})));
      }
      bar.appendChild(this.spacer = h("span", "cx-spacer"));
      if (tools.export !== false) this.exportControl = this.controlPanel(labels.gridExport, "cx-grid-export", panel => this.renderGridExport(panel));
      if (tools.more !== false) this.buildMoreMenu();
      // A toolbar left with only its spacer has nothing to show.
      if (bar.childElementCount === 1) bar.replaceChildren();
      this.syncToolbar();
      this.startFit();
    },

    // Host actions ({ label, run({ nodes, signal }) }, run with the selected nodes) and Print.
    buildMoreMenu() {
      const overflow = this.overflow = this.controlPanel(this.labels.gridMore, "cx-grid-overflow"), summary = overflow.details.firstChild;
      summary.replaceChildren(gridIcon("more")); summary.classList.add("icon"); summary.setAttribute("aria-label", this.labels.gridMore);
      for (const action of this.opts.actions || []) {
        if (!action || typeof action.label !== "string" || typeof action.run !== "function") throw new Error("CanopyX: actions need a label and handler.");
        overflow.panel.appendChild(gridButton(action.label, () => Promise.resolve().then(() =>
          action.run({ nodes: this.treeSelection(), signal: this.dataLifetime.signal })).catch(error => this.emit("error", { error }))));
      }
      overflow.panel.appendChild(Object.assign(gridButton(this.labels.gridPrint, () => global.print()), { className: "cx-button cx-grid-print" }));
    },

    treeSelection() { return Array.from(this.selected, w => w.h); },

    // The interactive runtime's actions menu closes with the toolbar menus (an editor keeps its own rules).
    closeMenusOutside(node) {
      TOOLBAR_PANELS.closeMenusOutside.call(this, node);
      const panel = this.interactionPanel;
      if (panel?.getAttribute("role") === "menu" && !panel.contains(node)) this.closeInteractionPanel(false);
    },

    // The list of columns keeps the accessible name the tree's former column chooser had.
    renderGridColumns(panel) {
      COLUMNS_MENU.renderGridColumns.call(this, panel);
      this.columnList.setAttribute("role", "group"); this.columnList.setAttribute("aria-label", this.labels.visibleColumns);
    },
    // The tree column stays first and shown: its row has no handle and its checkbox stays checked.
    syncColumnControls() {
      COLUMNS_MENU.syncColumnControls.call(this);
      const row = this.columnList?.firstChild;
      if (row) { row.querySelector(".cx-grid-column-handle").hidden = true; row.querySelector("input").disabled = true; }
    },

    // At 640 pixels and below the toolbar takes the phone layout: Views and Export move into the more menu.
    syncPhone() {
      const phone = this.host.clientWidth <= 640;
      if (phone === this.phone) return;
      this.phone = phone; this.host.classList.toggle("cx-phone", phone); this.placeMenus(phone);
    }
  });
  // An actions menu that opens closes the other CanopyX menus, as a toolbar menu does.
  const OPEN_PANEL = TreeGrid.prototype.openInteractionPanel;
  if (OPEN_PANEL) TreeGrid.prototype.openInteractionPanel = function (...args) {
    const panel = OPEN_PANEL.apply(this, args);
    if (panel?.getAttribute("role") === "menu") announceMenu(panel);
    return panel;
  };
