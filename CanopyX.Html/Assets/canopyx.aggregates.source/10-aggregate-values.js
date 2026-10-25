  // ---------- aggregates: built-in operations, plugin aggregates and compact labelled values ----------
  // count and distinctCount read any column; sum, average, minimum and maximum read number columns. Any other operation is
  // a custom aggregate: a plugin registers it ({ aggregates: { median: { label, compute(values, context) } } }) and computes
  // it for inline data; a host source returns its own value. Values are finite numbers within the safe-integer magnitude, or
  // null for an empty input. A plugin aggregate's label is a {value} template ("med {value}"), shown as the built-in labels are.
  const groupCounting = operation => operation === "count" || operation === "distinctCount";
  function groupSummaryAggregates(view) {
    const bindings = new Map();
    const add = aggregate => {
      const existing = bindings.get(aggregate.id);
      if (existing && (existing.column !== aggregate.column || existing.operation !== aggregate.operation))
        throw new Error("CanopyX: an aggregate identity must use the same column and operation.");
      if (!existing) bindings.set(aggregate.id, aggregate);
    };
    for (const aggregate of view.reporting?.aggregates || []) add(aggregate);
    for (const footer of view.footers || []) if (footer.scope === "all" || view.presentation !== "paged")
      footer.aggregates.forEach(add);
    if (bindings.size > 32) throw new Error("CanopyX: at most 32 full-query aggregates are supported.");
    return [...bindings.values()];
  }
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
        const total = sum + value;
        correction += Math.abs(sum) >= Math.abs(value) ? sum - total + value : value - total + sum;
        sum = total;
        minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
      }
    }
    return operation === "count" ? count : distinct ? distinct.size : !count ? null :
      operation === "sum" ? sum + correction : operation === "average" ? (sum + correction) / count : operation === "minimum" ? minimum : maximum;
  }
