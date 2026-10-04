  // ---------- stable layout order and user controls ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridPinColumn: "{column}: pinned region", gridPinNone: "Scroll", gridPinLeft: "Left", gridPinRight: "Right",
    gridResponsiveHidden: "Hidden at this width"
  }));
  function reportingColumnOrder(columns) { return ["left", "none", "right"].flatMap(pin => columns.filter(column => column.pin === pin)); }
  const PLACEMENT_HEADER = DataGrid.prototype.buildHeader, PLACEMENT_MOVE = DataGrid.prototype.moveReportingColumn,
    PLACEMENT_CONTROLS = DataGrid.prototype.syncColumnControls;
  DataGrid.prototype.buildHeader = function () {
    this.columns = reportingColumnOrder(this.columns); return PLACEMENT_HEADER.call(this);
  };
  DataGrid.prototype.moveReportingColumn = function (column, target, after) {
    column.pin = target.pin; return PLACEMENT_MOVE.call(this, column, target, after);
  };
  DataGrid.prototype.syncColumnControls = function () {
    const active = document.activeElement, held = active && active.getAttribute("data-cx-layout-column"), action = active && active.getAttribute("data-cx-layout-action");
    PLACEMENT_CONTROLS.call(this); if (!this.columnPanel) return;
    this.columns.forEach((column, index) => {
      const row = this.columnPanel.children[index], input = row.querySelector("input[type=checkbox]"), pin = h("select");
      input.disabled = !column.hidden && this.columns.filter(item => !item.hidden).length === 1;
      if (column.responsiveHidden) { const note = h("span", "cx-grid-responsive-note"); setText(note, this.labels.gridResponsiveHidden); row.append(note); }
      pin.setAttribute("aria-label", fill(this.labels.gridPinColumn, { column: column.title }));
      pin.setAttribute("data-cx-layout-column", column.id); pin.setAttribute("data-cx-layout-action", "pin");
      [["none", "gridPinNone"], ["left", "gridPinLeft"], ["right", "gridPinRight"]].forEach(([value, label]) => pin.append(gridOption(value, this.labels[label])));
      pin.value = column.pin; pin.addEventListener("change", () => this.setColumnPinned(column.id, pin.value)); row.append(pin);
      for (const [delta, action] of [[-1, "earlier"], [1, "later"]]) {
        const previous = row.querySelector('[data-cx-layout-action="' + action + '"]'), button = previous.cloneNode(true);
        previous.replaceWith(button); button.addEventListener("click", () => {
          const at = this.columns.indexOf(column), target = this.columns[at + delta]; if (!target) return;
          column.pin = target.pin;
          const ids = this.columns.map(item => item.id); [ids[at], ids[at + delta]] = [ids[at + delta], ids[at]]; this.setColumnOrder(ids);
        });
      }
    });
    if (held) {
      const choices = [...this.columnPanel.querySelectorAll("[data-cx-layout-column]")].filter(control =>
        control.getAttribute("data-cx-layout-column") === held && !control.disabled);
      (choices.find(control => control.getAttribute("data-cx-layout-action") === action) || choices[0] ||
        this.columnPanel.parentNode.querySelector("summary")).focus({ preventScroll: true });
    }
  };
  DataGrid.prototype.setColumnVisible = function (id, visible) {
    const column = this.columns.find(item => item.id === id);
    if (!column || typeof visible !== "boolean") throw new Error("CanopyX: visibility needs a declared column and boolean.");
    if (!visible && !column.hidden && this.columns.filter(item => !item.hidden).length === 1) throw new Error("CanopyX: keep at least one column visible.");
    const held = this.heldCell(), columnId = held && this.cols[held.index] && this.cols[held.index].id;
    column.hidden = !visible; this.buildHeader(); this.syncColumnControls(); this.render(); this.restoreReportingFocus(held, columnId); this.stateChanged();
  };
