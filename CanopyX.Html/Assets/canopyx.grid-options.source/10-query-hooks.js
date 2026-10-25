  // Hooks belong to one view, including when other views use the same named operator.
  GRID_OPTIONS.attach = grid => {
    if (GRID_OPTION_GRIDS.has(grid.view)) return;
    const filters = Object.assign(Object.create(null), ...grid.plugins.map(plugin => plugin.filterOperators));
    const comparators = Object.assign(Object.create(null), ...grid.plugins.map(plugin => plugin.sortComparators));
    for (const name of [...Object.keys(filters), ...Object.keys(comparators)])
      if (!/^[a-z][a-zA-Z\d]{0,31}$/.test(name)) throw new Error("CanopyX: invalid query hook name.");
    for (const name of Object.keys(filters)) if (["eq", "ne", "contains", "startsWith", "in", "gt", "ge", "lt", "le", "isNull", "isNotNull"].includes(name))
      throw new Error("CanopyX: custom filters cannot replace a built-in operator.");
    for (const column of grid.view.columns) if (grid.view.source.kind === "inline" && column.sortComparator && !comparators[column.sortComparator])
      throw new Error("CanopyX: no plugin provides sort comparator '" + column.sortComparator + "'.");
    grid.groupAggregates = groupCustomAggregates(grid);
    validateFooters(grid);
    GRID_OPTION_GRIDS.set(grid.view, { grid, filters, comparators });
    grid.lifetime.signal.addEventListener("abort", () => GRID_OPTION_GRIDS.delete(grid.view), { once: true });
  };
  GRID_OPTIONS.queryRows = (view, query, columns, compare) => {
    const { grid, filters } = GRID_OPTION_GRIDS.get(view);
    const context = column => Object.freeze({ column: column.id, signal: grid.dataLifetime.signal });
    const matches = (row, filter, column) => {
      if (["eq", "ne", "contains", "startsWith", "in", "gt", "ge", "lt", "le", "isNull", "isNotNull"].includes(filter.operator))
        return gridMatches(row, filter, column);
      const hook = filters[filter.operator];
      if (!hook) throw new Error("CanopyX: no plugin provides filter operator '" + filter.operator + "'.");
      const result = hook(gridScalar(row.cells[column.id], column), Object.freeze(filter.values.slice()), context(column));
      if (typeof result !== "boolean") throw new Error("CanopyX: filter hooks return a boolean.");
      return result;
    };
    return gridQueryRows(view, query, columns, compare === null ? null : GRID_OPTIONS.compare(view, query, columns, compare), matches, true);
  };
  GRID_OPTIONS.compare = (view, query, columns, compare) => {
    const { grid, comparators } = GRID_OPTION_GRIDS.get(view);
    const context = column => Object.freeze({ column: column.id, signal: grid.dataLifetime.signal });
    return (a, b, column, direction) => {
      if (view.reporting?.grouping?.column === column.id || query.groupBy?.some(level => level.column === column.id)) return compare(a, b, column, direction);
      const fixed = view.preSort?.some(key => key.column === column.id);
      for (const id of !fixed && column.orderData?.length ? column.orderData : [column.id]) {
        const target = columns.get(id), hook = comparators[column.sortComparator];
        let result;
        if (hook) {
          const left = gridSortScalar(a.cells[id], target), right = gridSortScalar(b.cells[id], target);
          if (left === null || right === null) result = left === right ? 0 : left === null ? 1 : -1;
          else {
            result = hook(left, right, context(target));
            if (!Number.isFinite(result)) throw new Error("CanopyX: sort hooks return a finite number.");
            if (direction === "desc") result = -result;
          }
        } else result = compare(a, b, target, direction);
        if (result) return result;
      }
      return 0;
    };
  };
