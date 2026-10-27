  const calculationPlans = new WeakMap();
  const calculationRaw = (row, id) => Object.hasOwn(row.cells, id) ? cellValue(row.cells[id]) : null;
  function calculationDefinitions(view) {
    return view.columns.filter(column => column.calculation !== undefined).map(column => ({ id: column.id, title: column.title, kind: column.kind, expression: column.calculation }));
  }
  function calculationPlan(columns) {
    const known = new Map(columns.map(column => [column.id, column])), programs = new Map(), ordered = [], visiting = new Set(), visited = new Set();
    for (const column of columns) if (column.calculation !== undefined) {
      if (column.editable || programs.size >= 32) throw new Error("CanopyX: at most 32 read-only calculated columns are supported.");
      const program = calculationParse(column.calculation);
      if (program.dependencies.some(id => !known.has(id))) throw new Error("CanopyX: unknown calculation column reference.");
      programs.set(column.id, program);
    }
    const visit = id => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error("CanopyX: calculated-column dependency cycle.");
      visiting.add(id);
      for (const dependency of programs.get(id).dependencies) if (programs.has(dependency)) visit(dependency);
      visiting.delete(id); visited.add(id); ordered.push({ column: known.get(id), program: programs.get(id) });
    };
    for (const id of programs.keys()) visit(id);
    return { ordered, inputs: [...new Set([...programs.values()].flatMap(program => program.dependencies).filter(id => !programs.has(id)))], cache: new WeakMap(),
      key: JSON.stringify(columns.filter(column => column.calculation !== undefined).map(column => [column.id, column.kind, column.calculation])), revision: 0 };
  }
  function calculationApply(view, rows = view.rows) {
    if (view.source?.kind !== "inline" || !view.columns.some(column => column.calculation !== undefined)) return;
    let plan = calculationPlans.get(view); if (!plan) { plan = calculationPlan(view.columns); calculationPlans.set(view, plan); }
    for (const row of rows) {
      const inputs = plan.inputs.map(id => calculationRaw(row, id)), previous = plan.cache.get(row);
      if (previous && inputs.every((value, index) => Object.is(value, previous[index]))) continue;
      const results = new Map();
      for (const { column, program } of plan.ordered) {
        const result = calculationEvaluate(program, id => results.has(id) ? results.get(id) : calculationRaw(row, id));
        if (!result.error && result.value !== null) {
          if (column.kind === "number") result.error = typeof result.value !== "number" ? "type" : Math.abs(result.value) > Number.MAX_SAFE_INTEGER ? "number-range" : null;
          else if (column.kind === "text" && !["string", "boolean"].includes(typeof result.value)) result.error = "type";
          else if (column.kind === "datetime") {
            try { result.value = calculationDate(result.value).toISOString().replace(/\.000Z$/, "Z"); }
            catch (fault) { if (!(fault instanceof CalculationFailure)) throw fault; result.error = fault.message; }
          }
        }
        const error = result.error;
        results.set(column.id, error ? { calculationError: error } : result.value);
        Object.defineProperty(row.cells, column.id, { value: error ? { value: null, text: error === "divide-by-zero" ? "#DIV/0" : "#ERROR", tone: "danger", title: column.title + " (" + column.calculation + "): " + fill(view.labels?.gridCalculationError || DEFAULT_CALCULATION_ERROR, { error: error === "divide-by-zero" ? view.labels?.gridCalculationDivideZero || "Division by zero" : error }) } : result.value,
          enumerable: true, configurable: true, writable: true });
      }
      plan.cache.set(row, inputs);
    }
  }
  const DEFAULT_CALCULATION_ERROR = "Calculation error: {error}";
  function calculationColumns(grid, definitions) {
    if (!Array.isArray(definitions) || definitions.length > 32) throw new Error("CanopyX: invalid calculated columns.");
    const base = grid.calculationBaseColumns || grid.view.columns.filter(column => column.calculation === undefined), seen = new Set(base.map(column => column.id)),
      authored = grid.calculationAuthoredColumns || grid.view.columns.filter(column => column.calculation !== undefined);
    const calculated = definitions.map(input => {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["id", "title", "kind", "expression"].includes(key))) throw new Error("CanopyX: invalid calculated column.");
      requireIdentifier(input.id, "calculated column ID");
      if (seen.has(input.id) || typeof input.title !== "string" || !input.title.trim() || input.title.length > 256 || !["text", "number", "datetime"].includes(input.kind)) throw new Error("CanopyX: invalid calculated column identity or kind.");
      seen.add(input.id);
      const original = authored.find(column => column.id === input.id);
      if (original && original.kind !== input.kind) throw new Error("CanopyX: authored calculated columns retain their declared result kind.");
      return { ...(original || { width: 160, autoWidth: true, sortable: true, filterable: true, exportable: true }), id: input.id, title: input.title, kind: input.kind, calculation: input.expression, editable: false };
    });
    if (authored.some(column => !calculated.some(item => item.id === column.id))) throw new Error("CanopyX: authored calculated columns must remain declared.");
    const columns = [...base, ...calculated]; calculationPlan(columns); return columns;
  }
  function calculationProspective(grid, columns, action) {
    const viewColumns = grid.view.columns, runtimeColumns = grid.columns;
    grid.view.columns = columns; grid.columns = columns;
    try { return action(); } finally { grid.view.columns = viewColumns; grid.columns = runtimeColumns; }
  }
  function calculationInstall(grid, columns) {
    const ids = new Set(columns.map(column => column.id)), previous = new Map(grid.columns.map(column => [column.id, column]));
    const oldPlan = calculationPlans.get(grid.view), plan = calculationPlan(columns);
    plan.revision = (oldPlan?.revision || 0) + (oldPlan?.key === plan.key ? 0 : 1);
    for (const row of grid.view.rows || []) for (const column of grid.view.columns) if (column.calculation !== undefined && !ids.has(column.id)) delete row.cells[column.id];
    grid.view.columns = columns;
    grid.columns = columns.map(column => ({ ...column, ...previous.get(column.id), id: column.id, title: column.title, kind: column.kind, calculation: column.calculation,
      autoWidth: previous.get(column.id)?.autoWidth ?? (column.autoWidth || column.width === undefined), render: previous.get(column.id)?.render || null }));
    gridFitPrepare(grid);
    calculationPlans.set(grid.view, plan);
    calculationApply(grid.view);
    if (grid.view.source.kind === "inline") {
      if (grid.view.rowData && !grid.source.decoded && !grid.acceptedQuery) grid.source = rowDataSource(grid);
      else grid.source = inlineGridSource(grid.view);
    }
    grid.columnList = null; grid.columnFind = null;
  }
  GRID_CALCULATIONS.definitions = view => gridFreeze(calculationDefinitions(view));
  GRID_CALCULATIONS.apply = calculationApply;
  GRID_CALCULATIONS.revision = view => { const revision = calculationPlans.get(view)?.revision; return revision ? "inline-calculation-" + revision : undefined; };
  GRID_CALCULATIONS.prepare = grid => {
    if (grid.calculationPrepared) return;
    if (grid.opts.source && grid.view.source.kind === "inline") throw new Error("CanopyX: calculated inline columns require the built-in inline source.");
    grid.calculationBaseColumns = grid.view.columns.filter(column => column.calculation === undefined);
    grid.calculationAuthoredColumns = grid.view.columns.filter(column => column.calculation !== undefined);
    calculationPlans.set(grid.view, calculationPlan(grid.view.columns));
    calculationApply(grid.view); grid.calculationPrepared = true; grid.prepareState();
  };
