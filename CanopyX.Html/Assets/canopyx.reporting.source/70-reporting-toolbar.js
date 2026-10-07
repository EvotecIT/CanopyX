  // ---------- host toolbar slots and more-menu content entries ----------
  // Slots are stable containers for host content: start, after the search box, after the Views menu, and the start of
  // the right-hand group. A slot is the same element for the grid's lifetime, whatever the phone layout moves. Children
  // of the host element marked data-cx-slot move into their slot when the grid is built and return to the host element
  // when it is destroyed, so a remount finds them again; content a host appends through toolbarSlot stays the host's.
  const TOOLBAR_CHROME = DataGrid.prototype.buildGridChrome, TOOLBAR_DESTROY = DataGrid.prototype.destroy,
    TOOLBAR_ACTION = DataGrid.prototype.gridAction, TOOLBAR_API = GRID_REPORTING.api;
  Object.assign(DataGrid.prototype, {
    buildGridChrome() {
      TOOLBAR_CHROME.call(this);
      const first = this.toolbar.firstChild, search = this.toolbar.querySelector(".cx-search");
      this.slots = { __proto__: null };
      for (const [name, before] of [["start", first], ["afterSearch", search ? search.nextSibling : first], ["afterViews", this.spacer], ["end", this.selectionBar]]) {
        const slot = this.slots[name] = h("div", "cx-toolbar-slot"); slot.dataset.cxToolbarSlot = name; before.before(slot);
      }
      // Every name is checked before anything moves, so a misspelt slot fails the mount without losing host content.
      this.slotted = [...this.host.querySelectorAll(":scope > [data-cx-slot]")];
      this.slotted.map(node => this.toolbarSlot(node.dataset.cxSlot)).forEach((slot, index) => slot.appendChild(this.slotted[index]));
    },
    toolbarSlot(name) {
      const slot = this.slots[name];
      if (!slot) throw new Error("CanopyX: toolbar slots are start, afterSearch, afterViews and end.");
      return slot;
    },
    destroy() {
      if (!this.destroyed && this.slotted) this.host.append(...this.slotted.filter(node => this.toolbar.contains(node)));
      return TOOLBAR_DESTROY.call(this);
    },
    // A content entry discloses host content inside the more menu: render(container, { close, signal }) fills it on first
    // open and focus moves to its first control. Escape folds it back to its entry; closing the menu folds it too (controlPanel).
    gridAction(action, act) {
      const render = action?.render;
      if (render === undefined) return TOOLBAR_ACTION.call(this, action, act);
      if (typeof action.label !== "string" || typeof render !== "function" || action.run !== undefined)
        throw new Error("CanopyX: an action has a label and either a run or a render function.");
      const entry = h("details", "cx-grid-action"), summary = h("summary", "cx-button"), body = h("div", "cx-grid-action-body"), menu = this.overflow.details;
      setText(summary, action.label); summary.setAttribute("role", "button"); entry.append(summary, body);
      entry.addEventListener("toggle", () => {
        if (!entry.open) return;
        if (!body.drawn) {
          body.drawn = true;
          try { render(body, { close: () => { menu.open = false; menu.firstChild.focus(); }, signal: this.lifetime.signal }); }
          catch (error) { body.drawn = false; body.replaceChildren(); this.emit("error", { error }); }
        }
        (body.querySelector(":is(input:not([type=hidden]),select,textarea,button):not(:disabled),[href],[tabindex]:not([tabindex=\"-1\"])") || summary).focus();
      });
      entry.addEventListener("keydown", event => {
        if (event.key === "Escape" && entry.open) { entry.open = false; summary.focus(); event.preventDefault(); event.stopPropagation(); }
      });
      return entry;
    }
  });
  GRID_REPORTING.api = (api, grid) => { TOOLBAR_API(api, grid); api.toolbarSlot = name => grid.toolbarSlot(name); };
