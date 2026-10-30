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
    const editorExit = this.reportingText?.querySelector(".cx-pivot-editor-flat");
    if (editorExit) editorExit.hidden = !state.active || !phone;
    const hadFocus = this.pivotPanel.contains(active), focus = hadFocus ? active.dataset.pivotFocus : null;
    const columns = pivotVisible(result.columns, state.collapsedColumns, true), rows = pivotVisible(result.rows, state.collapsedRows, false), totalColumn = result.columns[0];
    const aggregates = state.values.map(id => this.view.reporting.aggregates.find(value => value.id === id));
    const zones = this.pivotZones(), displayedColumns = [...columns, totalColumn];
    this.pivotPanel.dataset.phone = String(phone);
    if (this.pivotButton) setText(this.pivotButton, phone ? this.labels.gridPivotConfigure : this.labels.gridPivot);
    const scroll = h("div", "cx-pivot-scroll"), table = h("table", "cx-pivot-table"), caption = h("caption", "cx-pivot-description");
    const describe = axis => state[axis].map(level => pivotColumn(this, level.column).title).join(" / ");
    setText(caption, this.view.label + " · " + describe("rows") + (state.columns.length ? " × " + describe("columns") : "") + " · " + aggregates.map(value => reportingAggregateName(this, value)).join(", "));
    table.append(caption); scroll.tabIndex = 0; scroll.setAttribute("aria-label", this.labels.gridPivot);
    const head = h("thead"), axisDepth = Math.max(1, state.columns.length), leading = h("th");
    leading.scope = "col"; leading.rowSpan = axisDepth + 1; setText(leading, describe("rows") || this.view.label);
    const jump = gridButton("", () => this.openPivotColumnMenu(jump).catch(error => this.emit("error", { error })));
    jump.classList.add("cx-pivot-column-jump"); jump.dataset.size = "sm"; jump.dataset.pivotFocus = "column-picker";
    jump.setAttribute("aria-label", this.labels.gridPivotColumn); jump.setAttribute("aria-haspopup", "menu"); jump.title = this.labels.gridPivotColumn; leading.append(jump);
    const ancestor = (node, depth) => {
      while (node.path.length > depth) node = result.columns.find(parent => parent.key === node.parent);
      return node;
    };
    for (let depth = 0; depth < axisDepth; depth++) {
      const row = h("tr"); if (!depth) row.append(leading);
      for (let index = 0; index < displayedColumns.length;) {
        const column = displayedColumns[index];
        if (depth && column.path.length <= depth) { index++; continue; }
        const group = ancestor(column, depth + 1); let end = index + 1;
        while (end < displayedColumns.length && ancestor(displayedColumns[end], depth + 1).key === group.key) end++;
        const th = h("th"), label = h("span"); th.scope = "colgroup"; th.colSpan = (end - index) * aggregates.length;
        th.rowSpan = group.path.length < axisDepth ? axisDepth - depth : 1;
        setText(label, pivotLabel(this, state, "columns", group, false)); label.title = pivotLabel(this, state, "columns", group);
        if (group.parent && result.columns.some(child => child.parent === group.key)) th.append(pivotToggle(this, group, "columns"));
        th.append(label); row.append(th); index = end;
      }
      head.append(row);
    }
    const measures = h("tr");
    for (const column of displayedColumns) for (const aggregate of aggregates) {
      const th = h("th"), value = h("button", "cx-pivot-value-menu"); th.scope = "col"; th.dataset.pivotColumn = column.key;
      setText(value, reportingAggregateName(this, aggregate)); value.type = "button"; value.title = this.labels.gridShowAs;
      value.dataset.pivotFocus = "value:" + column.key + ":" + aggregate.id;
      value.addEventListener("click", () => this.pivotValueMenu(aggregate, value)); th.append(value);
      const mode = showAsMode(this, aggregate);
      if (mode !== "value") { const label = h("span", "cx-pivot-caption"); setText(label, showAsCaption(this, mode)); th.append(label); }
      measures.append(th);
    }
    head.append(measures);
    table.append(head); const body = h("tbody");
    const appendRow = (node, parent) => {
      const row = h("tr"), title = h("th"), text = h("span"), hasChildren = result.rows.some(child => child.parent === node.key);
      title.scope = "row"; title.style.setProperty("--cx-pivot-depth", String(Math.max(0, node.path.length - 1)));
      setText(text, pivotLabel(this, state, "rows", node, false)); text.title = pivotLabel(this, state, "rows", node);
      if (hasChildren && node.parent) title.append(pivotToggle(this, node, "rows")); title.append(text); title.classList.toggle("cx-pivot-leaf", !hasChildren); row.append(title);
      if (hasChildren || !node.parent) row.classList.add("cx-pivot-subtotal");
      for (const column of displayedColumns) for (const aggregate of aggregates) {
        const cell = h("td"), button = h("button", "cx-pivot-cell"), display = pivotDisplay(this, result, node.key, column.key, aggregate);
        setText(button, reportingValueText(this, aggregate, display.value, display.mode)); button.type = "button";
        button.title = fill(this.labels.gridPivotDrill, { row: pivotLabel(this, state, "rows", node), column: pivotLabel(this, state, "columns", column) });
        button.setAttribute("aria-label", button.title + ": " + reportingAggregateName(this, aggregate) + ", " + button.textContent); button.dataset.pivotFocus = "cell:" + node.key + ":" + column.key + ":" + aggregate.id;
        button.addEventListener("click", () => this.drillPivot(node.key, column.key).catch(error => this.emit("error", { error }))); cell.append(button); row.append(cell);
      }
      parent.append(row);
    };
    rows.forEach(row => appendRow(row, body)); const foot = h("tfoot"); appendRow(result.rows[0], foot); table.append(body, foot); scroll.append(table);
    const note = h("p", "cx-pivot-note"); note.hidden = !result.columnsLimited;
    if (result.columnsLimited) setText(note, fill(this.labels.gridPivotLimited, { shown: String(result.retainedColumns.length), total: String(result.distinctColumns) }));
    this.pivotPanel.replaceChildren(zones, note, scroll);
    let offset = 0;
    for (const row of head.rows) { for (const cell of row.cells) cell.style.top = offset + "px"; offset += row.getBoundingClientRect().height; }
    if (focus) [...this.pivotPanel.querySelectorAll("[data-pivot-focus]")].find(control => control.dataset.pivotFocus === focus)?.focus({ preventScroll: true });
  };
