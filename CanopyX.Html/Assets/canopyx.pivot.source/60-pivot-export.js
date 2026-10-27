  // Export all prefixes in depth-first order, even when a hosted result only guarantees parent-before-child order.
  function pivotExportAxis(nodes, collapsed) {
    const children = new Map(), ordered = [], closed = new Set(collapsed);
    for (const node of nodes) if (node.parent) {
      if (!children.has(node.parent)) children.set(node.parent, []); children.get(node.parent).push(node);
    }
    const visit = (node, hidden) => {
      const descendants = children.get(node.key) || [];
      ordered.push({ node, axisKey: node.key, outlineLevel: Math.max(0, node.path.length - 1), summary: !node.parent || !!descendants.length,
        grandTotal: !node.parent, collapsed: closed.has(node.key), hidden });
      for (const child of descendants) visit(child, hidden || closed.has(node.key));
    };
    visit(nodes[0], false);
    return ordered.slice(1).concat(ordered.slice(0, 1));
  }
  DataGrid.prototype.pivotExport = function () {
    const state = pivotIntent(this), result = this.pivotResult;
    if (!state?.active || !result || this.pendingQuery) throw new Error("CanopyX: export needs an accepted pivot.");
    const aggregates = state.values.map(id => this.view.reporting.aggregates.find(value => value.id === id)), columns = [{ id: "axis", title: this.labels.gridPivotRows, kind: "text" }];
    const selected = pivotExportAxis(result.columns, state.collapsedColumns), rowAxis = pivotExportAxis(result.rows, state.collapsedRows), rows = [], columnGroups = [];
    selected.forEach(({ node, ...presentation }, ci) => aggregates.forEach((aggregate, ai) => columns.push({ id: "v" + ci + "_" + ai,
      title: pivotLabel(this, state, "columns", node) + ": " + reportingAggregateName(this, aggregate), kind: "number", aggregate: aggregate.id, ...presentation })));
    selected.forEach(({ node, collapsed, hidden }, index) => {
      if (!node.parent || !selected.some(item => item.node.parent === node.key)) return;
      let end = index + 1;
      while (end < selected.length && selected[end].node.path.length > node.path.length) end++;
      columnGroups.push({ key: node.key, ...(node.parent === "c" ? {} : { parent: node.parent }), firstColumn: 1 + (index + 1) * aggregates.length,
        columnCount: (end - index - 1) * aggregates.length, depth: node.path.length, collapsed, hidden });
    });
    for (const { node, ...presentation } of rowAxis) {
      const cells = { axis: { value: pivotLabel(this, state, "rows", node, false), text: pivotLabel(this, state, "rows", node, false) } };
      selected.forEach(({ node: column }, ci) => aggregates.forEach((aggregate, ai) => {
        const display = pivotDisplay(this, result, node.key, column.key, aggregate); cells["v" + ci + "_" + ai] = { ...display, text: display.value === null ? "" : reportingValueText(this, aggregate, display.value, display.mode) };
      }));
      rows.push({ id: "p" + rows.length, ...presentation, cells });
    }
    return gridFreeze({ view: this.view.id, query: result.query, definition: result.definition, columns, rows, columnGroups,
      rowAxis: result.rows, columnAxis: result.columns, matched: result.matched, distinctColumns: result.distinctColumns,
      retainedColumns: result.retainedColumns, columnsLimited: result.columnsLimited });
  };
