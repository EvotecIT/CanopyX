  DataGrid.prototype.pivotExport = function () {
    const state = pivotIntent(this), result = this.pivotResult;
    if (!state?.active || !result || this.pendingQuery) throw new Error("CanopyX: export needs an accepted pivot.");
    const aggregates = state.values.map(id => this.view.reporting.aggregates.find(value => value.id === id)), columns = [{ id: "axis", title: this.labels.gridPivotRows, kind: "text" }];
    const leaves = pivotVisible(result.columns, [], true), selected = [...leaves, result.columns[0]];
    selected.forEach((column, ci) => aggregates.forEach((aggregate, ai) => columns.push({ id: "v" + ci + "_" + ai, title: pivotLabel(this, state, "columns", column) + ": " + aggregate.label, kind: "number" })));
    const collapsed = new Set(state.collapsedRows), hidden = new Set(), rows = [];
    for (const node of result.rows.slice(1).concat(result.rows.slice(0, 1))) {
      const cells = { axis: { value: pivotLabel(this, state, "rows", node, false), text: pivotLabel(this, state, "rows", node, false) } };
      selected.forEach((column, ci) => aggregates.forEach((aggregate, ai) => {
        const display = pivotDisplay(this, result, node.key, column.key, aggregate); cells["v" + ci + "_" + ai] = { ...display, text: display.value === null ? "" :
          GRID_SHOW_AS.percent(display.mode) ? new Intl.NumberFormat(this.lang, { style: "percent", maximumFractionDigits: 2 }).format(display.value) : numberFormat(this.lang).format(display.value) };
      }));
      if (hidden.has(node.parent) || collapsed.has(node.parent)) hidden.add(node.key);
      rows.push({ id: "p" + rows.length, outlineLevel: Math.max(0, node.path.length - 1), summary: !node.parent || result.rows.some(child => child.parent === node.key), collapsed: collapsed.has(node.key), hidden: hidden.has(node.key), cells });
    }
    return gridFreeze({ view: this.view.id, query: this.getQuery(), definition: result.definition, columns, rows, matched: result.matched, columnsLimited: result.columnsLimited });
  };
