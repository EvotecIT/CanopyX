  // ---------- starting column groups on a grid, and the API ----------
  // The grid's own header, sizing, pin and move methods stay as they are; a grid with groups gets its own wrappers around
  // them, which look the shared methods up on each call, so parts installed later (the Columns menu) are wrapped as well.
  function cgColumn(grid, to) {
    const node = grid.columnGroupModel.byId.get(to.id);
    if (!node) return grid.columns.find(column => column.id === to.id);
    const members = grid.columns.filter(column => node.leaves.includes(column.id));
    return to.after ? members[members.length - 1] : members[0];
  }

  function cgInstall(grid) {
    const shared = Object.getPrototypeOf(grid);
    grid.buildHeader = function () {
      this.groupCells = [];
      cgOrder(this);
      shared.buildHeader.call(this);
      cgHeader(this);
    };
    grid.applyWidths = function (...args) {
      shared.applyWidths.apply(this, args);
      if (this.cols && this.headCells?.length === this.cols.length) cgUnsplit(this);
      cgLayout(this);
    };
    // Pinning a column pins its whole top-level group.
    grid.setColumnPinned = function (id, pin) {
      const root = cgPath(this.columnGroupModel, id)[0];
      if (root && CG_PINS.includes(pin)) for (const column of this.columns) if (root.leaves.includes(column.id)) column.pin = pin;
      return shared.setColumnPinned.call(this, id, pin);
    };
    // A column dragged or moved by keyboard in the header stays among the members of its group.
    grid.moveReportingColumn = function (column, target, after) {
      const to = cgSibling(this, column.id, target.id, after), landing = cgColumn(this, to);
      if (to.id !== column.id && landing && landing !== column) shared.moveReportingColumn.call(this, column, landing, to.after);
    };
    grid.moveColumnChoice = function (column, target, after) { cgChoose(this, column.id, target.id, after); };
    grid.syncColumnControls = function (...args) { return this.columnList ? cgColumnControls(this) : shared.syncColumnControls.apply(this, args); };
  }

  Object.assign(DataGrid.prototype, {
    startColumnGroups() {
      if (this.columnGroupModel || this.destroyed) return;
      if (!this.view.columnGroups?.length) { this.columnGroupModel = { roots: [], byId: new Map(), owner: new Map(), depth: 0 }; return; }
      const model = this.columnGroupModel = cgRead(this.view), byId = new Map(this.columns.map(column => [column.id, column]));
      if (this.view.columnGroupMode === "presentation") { cgInstallPresentation(this); return; }
      // A restored view keeps the reader's pins; a fresh one starts with the groups' declared pins.
      if (!this.initialState) for (const root of model.roots) if (root.pinned !== undefined) for (const id of root.leaves) byId.get(id).pin = root.pinned || "none";
      // A grouped column's drawer section is its group's title, or the titles down to it when a title repeats.
      const titles = new Map();
      for (const node of model.byId.values()) titles.set(node.title, (titles.get(node.title) || 0) + 1);
      for (const [id, node] of model.owner) {
        const column = byId.get(id);
        column.section ??= titles.get(node.title) > 1 ? cgPath(model, id).map(group => group.title).join(" · ") : node.title;
      }
      cgOrder(this);
      // Resetting the columns returns to the declared layout: the declared order, grouped, with the declared pins.
      if (this.defaultState) {
        const saved = new Map(this.defaultState.columns.map(column => [column.id, column]));
        const declared = { columnGroupModel: model, columns: this.defaultState.columns.map(entry => ({ id: entry.id, pin: entry.pin ?? byId.get(entry.id).pin })) };
        for (const root of model.roots) if (root.pinned !== undefined) for (const column of declared.columns) if (root.leaves.includes(column.id)) column.pin = root.pinned || "none";
        cgOrder(declared);
        this.defaultState.columns = declared.columns.map(column => { const entry = saved.get(column.id); if ("pin" in entry) entry.pin = column.pin || "none"; return entry; });
      }
      cgInstall(this);
      this.lifetime.signal.addEventListener("abort", () => {
        this.cancelColumnDrag?.(); this.host.classList.remove("cx-column-groups"); this.host.style.removeProperty("--cx-pin-left-w");
      }, { once: true });
      this.buildHeader(); this.syncColumnControls(); this.render();
    },

    /** The groups in their current order: each with its columns (in order), the ones on screen, its nested groups and its pin. */
    getColumnGroups() {
      const model = this.columnGroupModel;
      if (!model?.roots.length) return [];
      const shown = new Set((this.cols || []).map(column => column.id)), order = this.columns.map(column => column.id);
      const describe = node => {
        const columns = order.filter(id => node.leaves.includes(id));
        const pins = new Set(this.columns.filter(column => columns.includes(column.id)).map(column => column.pin || "none"));
        return Object.freeze({ id: node.id, title: node.title, columns: Object.freeze(columns), visibleColumns: Object.freeze(columns.filter(id => shown.has(id))),
          pin: pins.size > 1 ? "mixed" : [...pins][0],
          groups: Object.freeze(cgSiblings(this, node).filter(id => model.byId.has(id)).map(id => describe(model.byId.get(id)))) });
      };
      return Object.freeze(cgSiblings(this, null).filter(id => model.byId.has(id)).map(id => describe(model.byId.get(id))));
    },

    /** The actual displayed header spans, ordered by level then visible column position. */
    getColumnBands() {
      return Object.freeze((this.groupCells || []).filter(cell => cell.dataset.cxGroup).map(cell => {
        const { first, last } = cell._cxSpan;
        return Object.freeze({ id: cell.dataset.cxGroup, title: cell.getAttribute("aria-label"), level: Number(cell.dataset.cxLevel),
          columnIndex: first + 1, columnSpan: last - first + 1, pin: cell.dataset.cxPin || "none",
          columns: Object.freeze(this.cols.slice(first, last + 1).map(column => column.id)) });
      }));
    },

    /** Shows or hides every column of a semantic group; presentation bands have no collective action. */
    setColumnGroupVisible(id, visible) {
      if (this.view.columnGroupMode === "presentation") throw new Error("CanopyX: presentation bands do not change column visibility; use setColumnVisible.");
      const node = this.columnGroupModel?.byId.get(id);
      if (!node || typeof visible !== "boolean" || this.destroyed) throw new Error("CanopyX: visibility needs a declared column group and a boolean.");
      const members = this.columns.filter(column => node.leaves.includes(column.id));
      if (!visible && this.columns.every(column => column.hidden || members.includes(column))) throw new Error("CanopyX: keep at least one column visible.");
      for (const column of members) column.hidden = !visible;
      this.buildHeader(); this.syncColumnControls(); this.scheduleRender(); this.noteViewPreferenceIntent?.(); this.stateChanged();
    }
  });
