  function pivotLabel(grid, definition, axis, node, full = true) {
    if (node.other) return grid.labels.gridPivotOther;
    if (!node.parent) return grid.labels.gridSummary;
    const levels = definition[axis];
    return node.path.map((value, index) => {
      const level = levels[index], column = pivotColumn(grid, level.column);
      return value === null ? grid.labels.gridGroupMissing : level.bucket ? GRID_BUCKETS.label(level.bucket, value, grid.lang) : cellText(value, column, grid.fmt);
    }).slice(full ? 0 : -1).join(" / ");
  }
  function pivotVisible(nodes, collapsed, leavesOnly) {
    const byKey = new Map(nodes.map(node => [node.key, node])), closed = new Set(collapsed);
    return nodes.filter(node => {
      if (!node.parent) return false;
      let parent = byKey.get(node.parent);
      while (parent) { if (closed.has(parent.key)) return false; parent = byKey.get(parent.parent); }
      return !leavesOnly || closed.has(node.key) || !nodes.some(child => child.parent === node.key);
    });
  }
  function pivotToggle(grid, node, axis) {
    const state = pivotIntent(grid), collapsed = state[axis === "rows" ? "collapsedRows" : "collapsedColumns"].includes(node.key);
    const button = gridButton(collapsed ? "▸" : "▾", () => grid.setPivotCollapsed(axis, node.key, !collapsed));
    button.classList.add("cx-pivot-collapse"); button.setAttribute("aria-label", (collapsed ? grid.labels.gridGroupExpand : grid.labels.gridGroupCollapse) + ": " + pivotLabel(grid, state, axis, node));
    button.setAttribute("aria-expanded", String(!collapsed)); button.dataset.pivotFocus = axis + ":" + node.key;
    return button;
  }
  DataGrid.prototype.renderPivot = function () {
    if (!this.pivotPanel || this.pivotPanel.hidden || !pivotIntent(this)?.active || !this.pivotResult || this.destroyed) return;
    this.updateGridPhone();
    const state = pivotIntent(this), result = this.pivotResult, phone = this.host.clientWidth <= 640, active = document.activeElement;
    const focus = this.pivotPanel.contains(active) ? active.dataset.pivotFocus : null;
    const columns = pivotVisible(result.columns, state.collapsedColumns, true), rows = pivotVisible(result.rows, state.collapsedRows, false), totalColumn = result.columns[0];
    const aggregates = state.values.map(id => this.view.reporting.aggregates.find(value => value.id === id));
    const zones = this.pivotZones(), mobile = h("label", "cx-pivot-picker"), picker = h("select", "cx-input"), pickerName = h("span");
    picker.setAttribute("aria-label", this.labels.gridPivotColumn); picker.dataset.pivotFocus = "column-picker";
    for (const column of [...columns, totalColumn]) { const option = h("option"); option.value = column.key; setText(option, pivotLabel(this, state, "columns", column)); picker.append(option); }
    if (!picker.querySelector("option") || ![...picker.options].some(option => option.value === state.columnKey)) state.columnKey = columns[0]?.key || "c";
    picker.value = state.columnKey;
    picker.addEventListener("change", () => { state.columnKey = picker.value; this.renderPivot(); this.noteViewPreferenceIntent?.(); this.stateChanged(); });
    setText(pickerName, this.labels.gridPivotColumn); mobile.append(pickerName, picker); mobile.hidden = !phone;
    const displayedColumns = phone ? [...columns, totalColumn].filter(column => column.key === state.columnKey) : [...columns, totalColumn];
    const scroll = h("div", "cx-pivot-scroll"), table = h("table", "cx-pivot-table"), caption = h("caption", "cx-sr-only");
    setText(caption, this.view.label + ": " + this.labels.gridPivot); table.append(caption); scroll.tabIndex = 0; scroll.setAttribute("aria-label", this.labels.gridPivot);
    const head = h("thead"), first = h("tr"), leading = h("th"); leading.scope = "col"; setText(leading, this.labels.gridPivotRows);
    const hierarchical = !phone && state.columns.length === 2, headerRows = hierarchical ? 2 : 1;
    leading.rowSpan = headerRows; first.append(leading); head.append(first);
    const second = hierarchical ? h("tr") : null;
    const leafHeader = (row, column, rowspan = 1) => {
      for (const aggregate of aggregates) {
        const th = h("th"), name = h("span"), value = h("button", "cx-pivot-value-menu"); th.scope = "col"; th.rowSpan = rowspan;
        setText(name, pivotLabel(this, state, "columns", column, !hierarchical || column.other || !column.parent)); name.title = name.textContent;
        setText(value, aggregate.label); value.type = "button"; value.title = this.labels.gridShowAs;
        value.dataset.pivotFocus = "value:" + column.key + ":" + aggregate.id;
        value.addEventListener("click", () => this.pivotValueMenu(aggregate, value));
        th.append(name, value); const mode = showAsMode(this, aggregate);
        if (mode !== "value") { const modeLabel = h("span", "cx-pivot-caption"); setText(modeLabel, showAsCaption(this, mode)); th.append(modeLabel); }
        if (column.parent && result.columns.some(child => child.parent === column.key)) th.prepend(pivotToggle(this, column, "columns"));
        row.append(th);
      }
    };
    if (hierarchical) {
      const roots = result.columns.filter(column => column.parent === "c");
      for (const root of roots) {
        const children = displayedColumns.filter(column => column.parent === root.key);
        if (!children.length) { if (displayedColumns.includes(root)) leafHeader(first, root, 2); continue; }
        const th = h("th"), label = h("span"); th.scope = "colgroup"; th.colSpan = children.length * aggregates.length;
        setText(label, pivotLabel(this, state, "columns", root)); th.append(pivotToggle(this, root, "columns"), label); first.append(th);
        for (const child of children) leafHeader(second, child);
      }
      leafHeader(first, totalColumn, 2); head.append(second);
    } else for (const column of displayedColumns) leafHeader(first, column);
    table.append(head); const body = h("tbody");
    const appendRow = (node, parent) => {
      const row = h("tr"), title = h("th"), text = h("span"), hasChildren = result.rows.some(child => child.parent === node.key);
      title.scope = "row"; title.style.setProperty("--cx-pivot-depth", String(Math.max(0, node.path.length - 1)));
      setText(text, pivotLabel(this, state, "rows", node, false)); text.title = pivotLabel(this, state, "rows", node);
      if (hasChildren && node.parent) title.append(pivotToggle(this, node, "rows")); title.append(text); row.append(title);
      if (hasChildren || !node.parent) row.classList.add("cx-pivot-subtotal");
      for (const column of displayedColumns) for (const aggregate of aggregates) {
        const cell = h("td"), button = h("button", "cx-pivot-cell"), display = pivotDisplay(this, result, node.key, column.key, aggregate);
        const format = display.mode === "rank" ? numberFormat(this.lang, 0, 0) : GRID_SHOW_AS.percent(display.mode) ? new Intl.NumberFormat(this.lang, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }) : numberFormat(this.lang);
        setText(button, display.value === null ? "—" : format.format(display.value)); button.type = "button";
        button.title = fill(this.labels.gridPivotDrill, { row: pivotLabel(this, state, "rows", node), column: pivotLabel(this, state, "columns", column) });
        button.setAttribute("aria-label", button.title + ": " + aggregate.label + ", " + button.textContent); button.dataset.pivotFocus = "cell:" + node.key + ":" + column.key + ":" + aggregate.id;
        button.addEventListener("click", () => this.drillPivot(node.key, column.key).catch(error => this.emit("error", { error }))); cell.append(button); row.append(cell);
      }
      parent.append(row);
    };
    rows.forEach(row => appendRow(row, body)); const foot = h("tfoot"); appendRow(result.rows[0], foot); table.append(body, foot); scroll.append(table);
    const note = h("p", "cx-pivot-note"); note.hidden = !result.columnsLimited;
    if (result.columnsLimited) setText(note, fill(this.labels.gridPivotLimited, { shown: String(result.retainedColumns.length), total: String(result.distinctColumns) }));
    this.pivotPanel.replaceChildren(zones, mobile, note, scroll);
    if (focus) [...this.pivotPanel.querySelectorAll("[data-pivot-focus]")].find(control => control.dataset.pivotFocus === focus)?.focus({ preventScroll: true });
  };
