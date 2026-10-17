  // ---------- aggregates: built-in operations, plugin aggregates and compact labelled values ----------
  // count and distinctCount read any column; sum, average, minimum and maximum read number columns. Any other operation is
  // a custom aggregate: a plugin registers it ({ aggregates: { median: { label, compute(values, context) } } }) and computes
  // it for inline data; a host source returns its own value. Values are finite numbers within the safe-integer magnitude, or
  // null for an empty input. A plugin aggregate's label is a {value} template ("med {value}"), shown as the built-in labels are.
  const groupCounting = operation => operation === "count" || operation === "distinctCount";
  // The plugin aggregates a grid can use, by operation name.
  function groupCustomAggregates(grid) {
    const found = new Map();
    for (const plugin of grid.plugins) for (const [name, entry] of Object.entries(plugin.aggregates || {})) {
      const definition = typeof entry === "function" ? { compute: entry } : entry;
      if (!/^[a-z][a-zA-Z\d]{0,31}$/.test(name) || GROUP_OPERATIONS.includes(name) || !definition || typeof definition.compute !== "function" ||
          definition.label !== undefined && (typeof definition.label !== "string" || !definition.label.includes("{value}") || definition.label.length > 64))
        throw new Error("CanopyX: plugin '" + plugin.name + "' registers an invalid aggregate '" + name + "'.");
      found.set(name, definition);
    }
    return found;
  }
  function groupAggregateValue(grid, aggregate, rows, first, last) {
    const column = grid.view.columns.find(item => item.id === aggregate.column), operation = aggregate.operation;
    if (!GROUP_OPERATIONS.includes(operation)) {
      const values = [];
      for (let i = first; i < last; i++) { const value = gridScalar(rows[i].cells[column.id], column); if (value !== null) values.push(value); }
      const value = grid.groupAggregates.get(operation).compute(Object.freeze(values), Object.freeze({ column: column.id, aggregate: aggregate.id }));
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER))
        throw new Error("CanopyX: custom aggregate '" + operation + "' returned a value that is not a finite number or null.");
      return value;
    }
    let count = 0, sum = 0, correction = 0, minimum = Infinity, maximum = -Infinity;
    const distinct = operation === "distinctCount" ? new Set() : null;
    for (let i = first; i < last; i++) {
      const value = gridScalar(rows[i].cells[column.id], column);
      if (value === null) continue;
      count++;
      if (distinct) distinct.add(reportingGroupKey(value));
      else if (operation !== "count") {
        const next = value - correction, total = sum + next;
        correction = total - sum - next; sum = total;
        minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
      }
    }
    return operation === "count" ? count : distinct ? distinct.size : !count ? null :
      operation === "sum" ? sum : operation === "average" ? sum / count : operation === "minimum" ? minimum : maximum;
  }
  function groupAggregateValues(grid, rows, first = 0, last = rows.length) {
    const values = Object.create(null);
    for (const aggregate of grid.view.reporting.aggregates || []) values[aggregate.id] = groupAggregateValue(grid, aggregate, rows, first, last);
    return values;
  }
  // The aggregates of a summary or a group: every declared binding, counts within the record count, numbers in range.
  function groupCheckValues(view, values, count) {
    const declarations = view.reporting.aggregates || [];
    if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length !== declarations.length)
      throw new Error("CanopyX: summary aggregate bindings differ.");
    for (const aggregate of declarations) {
      const value = values[aggregate.id];
      if (!Object.hasOwn(values, aggregate.id) || value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) ||
          groupCounting(aggregate.operation) && (!validStructuralCount(value) || value > count) ||
          !count && !groupCounting(aggregate.operation) && value !== null) throw new Error("CanopyX: invalid aggregate value.");
    }
  }
  const GROUP_MEASURE = DataGrid.prototype.measureGridColumn;
  Object.assign(DataGrid.prototype, {
    // A column with aggregates is as wide as its widest labelled aggregate (totals and up to 200 groups), within the usual cap.
    measureGridColumn(column) {
      const result = GROUP_MEASURE.call(this, column), summary = this.summaryCandidate?.result || this.summary;
      const aggregates = this.rowsAttached && summary && !column.fixed && (this.view.reporting.aggregates || []).filter(item => item.column === column.id);
      if (!aggregates?.length || !this.fitContext) return result;
      const context = this.fitContext, pad = this.fitFont[3]; let widest = 0, seen = 0;
      context.font = this.fitFont[0].replace(/^\S+/, "700");
      const measure = values => { widest = Math.max(widest, context.measureText(reportingAggregateParts(this, column, aggregates, values).text).width); };
      measure(summary.aggregates);
      const walk = list => { for (const group of list || []) { if (++seen > 200) return; measure(group.aggregates); walk(group.groups); } };
      walk(summary.groups);
      const need = Math.min(Math.max(420, result.width), Math.ceil(widest + 2 * pad + 4));
      return need > result.width ? Object.freeze({ ...result, width: need }) : result;
    },
    // A cell of aggregates: "avg 36.2 · max 98" in the reporting runtime's labelled format, the declared labels with full
    // values as its tooltip and accessible name. A bounded button opens the complete values without covering other cells.
    paintAggregates(cell, column, aggregates, values) {
      const parts = reportingAggregateParts(this, column, aggregates, values);
      cell.title = parts.title; cell.classList.add("cx-aggregate");
      if (parts.text) cell.setAttribute("aria-label", parts.title); else cell.removeAttribute("aria-label");
      if (!parts.text) { cell.replaceChildren(); return; }
      let button = cell.querySelector(":scope > .cx-aggregate-button");
      if (!button) {
        button = h("button", "cx-grid-group-aggregates cx-aggregate-button"); button.type = "button";
        button.setAttribute("aria-haspopup", "dialog"); cell.replaceChildren(button);
        button.addEventListener("click", event => {
          event.stopPropagation(); this.showReportingText(column, button._cxAggregateText, button);
        });
      }
      if (button.textContent !== parts.text) setText(button, parts.text);
      button._cxAggregateText = parts.title; button.title = parts.title; button.setAttribute("aria-label", parts.title);
    }
  });
