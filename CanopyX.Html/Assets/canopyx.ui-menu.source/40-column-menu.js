// Grid policy stays lazy; keyboard navigation, activation and dismissal belong to the shared menu.
UI_IMPL.columnMenu = function(id, anchor, { gridIcon, gridQueryStart }) {
  const grid = this, column = this.columns.find(item => item.id === id);
  if (!column) return false;
  const title = fill(this.labels.gridColumnMenu, { column: column.title });
  return this.openGridPopover(anchor, "cx-column-menu", title, id, (panel, signal) => {
    const actions = new Map();
    const icons = new Map([[this.labels.gridSortAscending, "up"], [this.labels.gridSortDescending, "down"],
      [this.labels.gridFilterColumn, "filter"], [this.labels.gridPinLeft, "pin"], [this.labels.gridPinRight, "pin"],
      [this.labels.gridFitContent, "fit"], [this.labels.gridHideColumn, "hide"]]);
    const paths = {
      pin: '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>',
      fit: '<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3M4 5v14M20 5v14"/>',
      hide: '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9 6-.3.8-1.2 2.3-2.6 3.6M6.4 7.6C4.6 8.9 3.4 10.8 3 12c.5 1.5 4 6 9 6 1.6 0 3-.4 4.3-1.1"/>'
    };
    const add = (label, action, disabled = false) => {
      const button = h("button", "cx-button cx-mi"), icon = h("span", "ico cx-menu-icon"), name = icons.get(label);
      button.type = "button"; button.setAttribute("role", "menuitem"); button.disabled = disabled;
      button.dataset.itemId = String(actions.size); actions.set(button.dataset.itemId, action);
      icon.setAttribute("aria-hidden", "true"); if (name) icon.appendChild(gridIcon(name, paths[name]));
      const text = h("span", "cx-menu-label"); setText(text, label); button.append(icon, text); panel.appendChild(button);
    };
    const rule = () => { const separator = h("hr", "cx-menu-rule"); separator.setAttribute("role", "separator"); panel.appendChild(separator); };
    const sort = direction => this.setQuery(gridQueryStart(this.queryForChange(true), {
      sort: [...(this.queryForChange().sort || []).filter(item => item.column !== id), ...(direction ? [{ column: id, direction }] : [])]
    }));
    add(this.labels.gridSortAscending, () => sort("asc"), !column.sortable || this.view.reporting?.grouping?.column === id);
    add(this.labels.gridSortDescending, () => sort("desc"), !column.sortable || this.view.reporting?.grouping?.column === id);
    add(this.labels.gridClearSort, () => sort(null), !(this.getQuery()?.sort || []).some(item => item.column === id));
    rule(); add(this.labels.gridFilterColumn, () => {
      const target = this.resolveColumnAnchor(id, anchor);
      if (target) this.openColumnFilter(id, target);
    }, column.filterable === false);
    rule();
    for (const [pin, label] of [["left", "gridPinLeft"], ["right", "gridPinRight"], ["none", "gridUnpin"]])
      add(this.labels[label], () => this.setColumnPinned(id, pin));
    rule(); add(this.labels.gridFitContent, () => this.autoFitColumn(id), !this.acceptedQuery || !!this.pendingQuery);
    add(this.labels.gridFitAllColumns, () => this.autoFitColumns(), !this.acceptedQuery || !!this.pendingQuery);
    add(this.labels.gridHideColumn, () => this.setColumnVisible(id, false), this.columns.filter(item => !item.hidden).length === 1);
    this.appendColumnGroupActions?.(column, add, rule);
    // The host owns positioning while the real trigger retains portal, focus and overlay ancestry.
    // Disable shared positioning so native presses and phone placement stay under the host queue.
    return UI_IMPL.menu(panel, { host: this.host, trigger: anchor, anchored: false, label: title, bindTrigger: false, decorateTrigger: false, get tabTrigger() { return grid.resolveColumnAnchor(id, anchor); },
      onSelect: item => { Promise.resolve().then(actions.get(item.id)).catch(error => this.emit("error", { error })); }
    }, signal);
  });
};
