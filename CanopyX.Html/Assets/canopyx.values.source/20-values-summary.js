  function showAsSummary(grid, summary) {
    grid.aggregateDisplayCache ||= new WeakMap();
    const cached = grid.aggregateDisplayCache.get(summary);
    if (cached) return cached;
    const aggregates = grid.view.reporting.aggregates || [], modes = grid.aggregateShowAs || {}, byValues = new WeakMap();
    const modeOf = aggregate => modes[aggregate.id] ?? aggregate.showAs ?? "value";
    const value = (number, mode) => Object.freeze({ value: number, mode, numberFormat: showAsFormat(mode) });
    const totals = Object.create(null), groups = Object.create(null);
    for (const aggregate of aggregates) {
      const raw = summary.aggregates[aggregate.id], mode = modeOf(aggregate);
      totals[aggregate.id] = value(showAsValues([raw], mode, raw, raw)[0], mode);
    }
    byValues.set(summary.aggregates, totals);
    const walk = (siblings, parent) => {
      const display = siblings.map(() => Object.create(null));
      for (const aggregate of aggregates) {
        const mode = modeOf(aggregate), values = showAsValues(siblings.map(group => group.aggregates[aggregate.id]), mode, summary.aggregates[aggregate.id], parent[aggregate.id]);
        values.forEach((number, index) => { display[index][aggregate.id] = value(number, mode); });
      }
      siblings.forEach((group, index) => { groups[group.key] = display[index]; byValues.set(group.aggregates, display[index]); walk(group.groups || [], group.aggregates); });
    };
    walk(summary.groups, summary.aggregates);
    const result = gridFreeze({ totals, groups }), entry = { result, byValues };
    grid.aggregateDisplayCache.set(summary, entry); return entry;
  }
  function showAsEntry(grid, values, aggregate) {
    for (const summary of [grid.summary, grid.summaryCandidate?.result]) {
      if (!summary) continue;
      const entry = showAsSummary(grid, summary).byValues.get(values)?.[aggregate.id];
      if (entry) return entry;
    }
    return { value: values[aggregate.id], mode: "value", numberFormat: "0.00" };
  }
  Object.assign(GRID_SHOW_AS, { summary: showAsSummary, entry: showAsEntry });
