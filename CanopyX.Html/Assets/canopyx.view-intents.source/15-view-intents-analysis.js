  // Reporting's definition validator owns pivot axes, buckets, bounds and aggregate identities.
  function viewIntentPivotState(grid, input, current) {
    if (!grid.view.reporting?.pivot && grid.view.reporting?.pivotable !== true)
      throw new Error("CanopyX: this view does not enable pivots.");
    const state = JSON.parse(JSON.stringify(current));
    if (input === false) {
      if (state.pivot) state.pivot.active = false;
    } else {
      viewIntentObject(input, ["rows", "columns", "values", "maxColumns", "topNColumns", "sortByTotal"], "intent pivot");
      if (input.maxColumns === null) throw new Error("CanopyX: an explicit intent column limit is an integer.");
      for (const levels of [input.rows, input.columns]) if (Array.isArray(levels)) levels.forEach(level => {
        viewIntentObject(level, ["column", "direction", "bucket"], "intent pivot level"); viewIntentBucketShape(level.bucket);
      });
      state.pivot = { ...GRID_REPORTING.pivotDefinition(grid.view, input), active: true, collapsedRows: [], collapsedColumns: [] };
    }
    return state;
  }
  function viewIntentPivotExport(grid) {
    const state = grid.getState().pivot;
    if (!state?.active) return false;
    const { active, collapsedRows, collapsedColumns, columnKey, ...definition } = state;
    return definition;
  }
  function viewIntentBucketCaption(grid, bucket) {
    if (!bucket) return "";
    const labels = grid.labels, name = labels["gridBucket" + bucket.kind[0].toUpperCase() + bucket.kind.slice(1)];
    return " (" + name + (bucket.kind === "width" ? ": " + bucket.width + ", " + labels.gridBucketOrigin + ": " + (bucket.origin ?? 0) :
      bucket.kind === "edges" ? ": " + bucket.edges.join(", ") :
        ", " + (bucket.timeZone || "UTC") + (bucket.firstWeekday === undefined ? "" : ", " + bucket.firstWeekday)) + ")";
  }
  function viewIntentPivotChips(grid, input) {
    const labels = grid.labels;
    if (input === false) return [labels.gridPivot + ": " + labels.gridPivotFlat];
    const column = id => grid.view.columns.find(column => column.id === id)?.title || id;
    const level = value => column(value.column) + (value.direction === "desc" ? " ↓" : " ↑") + viewIntentBucketCaption(grid, value.bucket);
    const aggregate = id => grid.view.reporting.aggregates.find(value => value.id === id)?.label || id;
    const chips = [labels.gridPivotRows + ": " + (input.rows.map(level).join(", ") || "∅"),
      labels.gridPivotColumns + ": " + (input.columns.map(level).join(", ") || "∅"),
      labels.gridPivotValues + ": " + input.values.map(aggregate).join(", "),
      labels.gridPivotColumns + " ≤ " + (input.maxColumns ?? 200)];
    if (input.topNColumns !== undefined) chips.push(labels.gridPivotTopN + ": " + input.topNColumns);
    if (input.sortByTotal) chips.push(labels.gridPivotSort + ": " + aggregate(input.sortByTotal.aggregate) +
      (input.sortByTotal.direction === "desc" ? " ↓" : " ↑"));
    return chips;
  }
  function viewIntentTupleChips(grid, tuples) {
    const column = id => grid.view.columns.find(column => column.id === id)?.title || id;
    return tuples.map(tuple => "(" + tuple.columns.map(field => column(field.column) + viewIntentBucketCaption(grid, field.bucket)).join(", ") +
      ") " + (tuple.exclude ? "∉" : "∈") + " " + tuple.values.map(row => "(" + row.map(value => value === null ? "null" : JSON.stringify(value)).join(", ") + ")").join(", "));
  }
  function viewIntentBucketShape(input) {
    if (input === undefined) return;
    viewIntentObject(input, ["kind", "width", "origin", "edges", "timeZone", "firstWeekday"], "intent bucket");
    // Saved-state migration defaults null calendar options. Proposals default only omitted fields, as the schema does.
    if (Object.values(input).some(value => value === null)) throw new Error("CanopyX: explicit intent bucket fields cannot be null.");
  }
  function viewIntentTupleExport(grid, tuples) {
    return tuples.map(tuple => ({ ...tuple, values: tuple.values.map(row => row.map((value, index) => {
      const field = tuple.columns[index], column = grid.view.columns.find(column => column.id === field.column);
      // Accepted drill-through paths may use explicit offsets; the proposal's UTC representation preserves their instant.
      return value !== null && !field.bucket && column.kind === "datetime" ? new Date(value).toISOString() : value;
    })) }));
  }
