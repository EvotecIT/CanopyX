// Describe the difference from the complete, canonically validated prospective state. Omitted and unchanged aspects stay quiet.
function intentChips(grid, intent, current) {
  const next = intentCandidate(grid, intent, current), before = current.query, after = next.query, labels = grid.labels;
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null), chips = [];
  const title = id => grid.columns.find(column => column.id === id)?.title || id;
  const aggregate = id => grid.view.reporting?.aggregates.find(value => value.id === id)?.label || id;
  const direction = value => value === "desc" ? labels.viewIntentDescending : labels.viewIntentAscending;
  const level = value => title(value.column) + " (" + (value.aggregate ? aggregate(value.aggregate) + " " : "") + direction(value.direction) + ")" + viewIntentBucketCaption(grid, value.bucket);
  const predicate = filter => {
    const caption = grid.filterCaption?.(filter); if (caption) return caption;
    const values = filter.values.map(value => String(value)).join(", "), column = title(filter.column) + viewIntentBucketCaption(grid, filter.bucket);
    if (filter.operator === "eq") return fill(labels.viewIntentOnly, { column, values });
    const words = { ne: labels.viewIntentNotEqual, gt: labels.viewIntentGreater, ge: labels.viewIntentAtLeast,
      lt: labels.viewIntentLess, le: labels.viewIntentAtMost };
    const operator = words[filter.operator] || labels[GRID_FILTER_LABELS[filter.operator]];
    return fill(labels.viewIntentFilter, { column, operator, values }).trim();
  };
  const group = item => [...item.filters.map(predicate), ...item.groups.map(child => "(" + group(child) + ")")]
    .join(" " + (item.operator === "and" ? labels.gridAnd : labels.gridOr) + " ");
  if (!same(before.search, after.search)) chips.push(after.search ? fill(labels.viewIntentSearch, { search: after.search }) : labels.viewIntentClearSearch);
  if (!same(before.searchMode || "substring", after.searchMode || "substring"))
    chips.push(after.searchMode === "regex" ? labels.gridRegexSearch : after.searchMode === "words" ? labels.viewIntentWords : labels.viewIntentSubstring);
  const recordSort = query => query.sort.filter(value => !query.groupBy?.some(level => level.column === value.column));
  if (!same(before.sort, after.sort)) {
    const sorts = recordSort(after);
    if (sorts.length) chips.push(fill(labels.viewIntentSort, { columns: sorts.map(value => title(value.column) + " " + direction(value.direction)).join(", ") }));
    else if (recordSort(before).length) chips.push(labels.gridClearSort);
  }
  if (!same(before.filters, after.filters)) {
    for (const filter of after.filters) if (!before.filters.some(value => same(value, filter))) chips.push(predicate(filter));
    for (const filter of before.filters) if (!after.filters.some(value => same(value, filter)))
      chips.push(fill(labels.gridRemoveCondition, { condition: predicate(filter) }));
  }
  if (!same(before.filterGroup, after.filterGroup)) chips.push(after.filterGroup ? group(after.filterGroup) : labels.gridRemoveGroup);
  if (!same(before.groupBy || [], after.groupBy || [])) chips.push(after.groupBy?.length ?
    fill(labels.viewIntentGroup, { columns: after.groupBy.map(level).join(", ") }) : labels.viewIntentRemoveGrouping);
  const visible = state => state.columns.filter(column => !column.hidden).map(column => column.id);
  if (!same(visible(current), visible(next))) chips.push(fill(labels.viewIntentColumns, { columns: visible(next).map(title).join(", ") }));
  const tuples = value => (value || []).map(tuple => fill(tuple.exclude ? labels.viewIntentExcludeTuples : labels.viewIntentTuples, {
    columns: tuple.columns.map(field => title(field.column) + viewIntentBucketCaption(grid, field.bucket)).join(", "),
    values: tuple.values.map(row => row.map(value => value === null ? labels.gridIsNull : String(value)).join(", ")).join("; ") }));
  if (!same(before.tupleFilters || [], after.tupleFilters || [])) {
    const old = tuples(before.tupleFilters), fresh = tuples(after.tupleFilters);
    chips.push(...fresh.filter(text => !old.includes(text)), ...old.filter(text => !fresh.includes(text)).map(condition => fill(labels.gridRemoveCondition, { condition })));
  }
  const oldPivot = current.pivot, pivot = next.pivot;
  const pivotLevel = value => title(value.column) + (value.direction === "desc" ? " (" + direction(value.direction) + ")" : "") + viewIntentBucketCaption(grid, value.bucket);
  if (pivot?.active && (!oldPivot?.active || !same([oldPivot.rows, oldPivot.columns, oldPivot.values], [pivot.rows, pivot.columns, pivot.values])))
    chips.push(fill(labels.viewIntentPivot, { rows: pivot.rows.map(pivotLevel).join(", ") || labels.viewIntentAllRows,
      columns: pivot.columns.map(pivotLevel).join(", ") || labels.viewIntentTotals, values: pivot.values.map(aggregate).join(", ") }));
  else if (!pivot?.active && oldPivot?.active) chips.push(labels.viewIntentFlat);
  if (pivot?.active && !same(oldPivot?.sortByTotal, pivot.sortByTotal) && pivot.sortByTotal)
    chips.push(fill(labels.viewIntentSort, { columns: aggregate(pivot.sortByTotal.aggregate) + " " + direction(pivot.sortByTotal.direction) }));
  if (pivot?.active && oldPivot?.active && same([oldPivot.rows, oldPivot.columns], [pivot.rows, pivot.columns])) {
    const result = grid.pivotResult, limit = value => Math.min(value.maxColumns ?? 200, value.topNColumns ?? 200);
    if (result && Math.min(limit(oldPivot), result.distinctColumns) !== Math.min(limit(pivot), result.distinctColumns))
      chips.push(labels.gridPivotColumns + ": " + Math.min(limit(pivot), result.distinctColumns));
  }
  if (pivot?.active && oldPivot?.sortByTotal && !pivot.sortByTotal) chips.push(labels.gridClearSort);
  return chips;
}
