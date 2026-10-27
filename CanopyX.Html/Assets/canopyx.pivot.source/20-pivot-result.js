  function pivotResult(grid, definition, query, page, input) {
    checkDocument(input, "gridPivot");
    if (input.view !== grid.view.id || input.revision !== page.revision || input.matched !== page.matched ||
        !validStructuralCount(input.matched) || !validStructuralCount(input.distinctColumns) || typeof input.columnsLimited !== "boolean" ||
        JSON.stringify(pivotDefinition(grid.view, input.definition)) !== JSON.stringify(definition) || JSON.stringify(gridQuery(grid.view, input.query, true)) !== JSON.stringify(query) ||
        !Array.isArray(input.rows) || !Array.isArray(input.columns) || !Array.isArray(input.cells) || input.cells.length > 100000 ||
        !Array.isArray(input.retainedColumns) || input.retainedColumns.length > definition.maxColumns) throw new Error("CanopyX: pivot ownership or bounds differ from the accepted query.");
    const axis = (nodes, levels, letter, limit) => {
      if (!nodes.length || nodes.length > limit) throw new Error("CanopyX: pivot axis exceeds its bounds.");
      const found = new Map();
      for (const node of nodes) {
        if (!node || typeof node !== "object" || !Array.isArray(node.path) || node.path.length > levels.length || typeof node.key !== "string" || typeof node.other !== "boolean" ||
            found.has(node.key) || node.other && (letter !== "c" || node.key !== "c:other" || node.parent !== "c" || node.path.length) ||
            !node.other && (pivotKey(letter, node.path, levels, grid) !== node.key || node.path.length === 0 && node.parent !== undefined ||
              node.path.length > 0 && (!found.has(node.parent) || node.parent !== pivotKey(letter, node.path.slice(0, -1), levels, grid)))) throw new Error("CanopyX: invalid pivot axis prefix.");
        node.path.forEach((value, index) => { if (value !== null) gridScalar(value, levels[index].bucket ? { kind: "number" } : pivotColumn(grid, levels[index].column)); });
        found.set(node.key, node);
      }
      if (nodes[0].key !== letter || nodes.filter(node => !nodes.some(child => child.parent === node.key)).length > (letter === "c" ? definition.maxColumns : 10000)) throw new Error("CanopyX: invalid pivot leaf bound.");
      return found;
    };
    const rows = axis(input.rows, definition.rows, "r", 10001), columns = axis(input.columns, definition.columns, "c", 402), lookup = new Map();
    if (rows.size * columns.size * definition.values.length > 100000) throw new Error("CanopyX: pivot tables support at most 100,000 display cells. Narrow the query, axes or values.");
    for (const cell of input.cells) {
      if (!cell || !rows.has(cell.row) || !columns.has(cell.column) || !validStructuralCount(cell.count) || cell.count > input.matched ||
          !cell.aggregates || typeof cell.aggregates !== "object" || Array.isArray(cell.aggregates) || Object.keys(cell.aggregates).length !== definition.values.length) throw new Error("CanopyX: invalid pivot intersection.");
      for (const id of definition.values) {
        const value = cell.aggregates[id], aggregate = grid.view.reporting.aggregates.find(item => item.id === id), counting = ["count", "distinctCount"].includes(aggregate.operation);
        if (!Object.hasOwn(cell.aggregates, id) || value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) ||
            counting && (!validStructuralCount(value) || value > cell.count) || !cell.count && !counting && value !== null) throw new Error("CanopyX: invalid pivot aggregate.");
      }
      if (!lookup.has(cell.row)) lookup.set(cell.row, new Map());
      if (lookup.get(cell.row).has(cell.column)) throw new Error("CanopyX: duplicate pivot intersection.");
      lookup.get(cell.row).set(cell.column, cell);
    }
    if (lookup.get("r")?.get("c")?.count !== input.matched) throw new Error("CanopyX: pivot grand total differs.");
    for (const [nodes, rowAxis] of [[rows, true], [columns, false]]) {
      const children = new Map();
      for (const node of nodes.values()) if (node.parent) { if (!children.has(node.parent)) children.set(node.parent, []); children.get(node.parent).push(node.key); }
      for (const [parent, keys] of children) for (const opposite of (rowAxis ? columns : rows).keys()) {
        const at = key => (rowAxis ? lookup.get(key)?.get(opposite) : lookup.get(opposite)?.get(key))?.count || 0;
        const covered = keys.reduce((sum, key) => sum + at(key), 0);
        // Top-N's global Other can overlap a retained raw prefix. Raw prefix totals include all descendants.
        if ((rowAxis || !input.columnsLimited) && covered !== at(parent)) throw new Error("CanopyX: pivot prefix counts do not cover their parent.");
      }
    }
    const retained = new Set();
    for (const path of input.retainedColumns) {
      if (!Array.isArray(path) || path.length !== definition.columns.length) throw new Error("CanopyX: invalid retained pivot column path.");
      const key = pivotKey("c", path, definition.columns, grid);
      if (!columns.has(key) || retained.has(key)) throw new Error("CanopyX: retained pivot columns differ."); retained.add(key);
    }
    if (input.columnsLimited !== columns.has("c:other") || input.columnsLimited && input.distinctColumns <= retained.size) throw new Error("CanopyX: invalid pivot column-cap metadata.");
    return gridFreeze(JSON.parse(JSON.stringify(input)));
  }
  const PIVOT_LOOKUPS = new WeakMap();
  function pivotCell(result, row, column) {
    let lookup = PIVOT_LOOKUPS.get(result);
    if (!lookup) {
      lookup = new Map(); for (const cell of result.cells) { if (!lookup.has(cell.row)) lookup.set(cell.row, new Map()); lookup.get(cell.row).set(cell.column, cell); }
      PIVOT_LOOKUPS.set(result, lookup);
    }
    return lookup.get(row)?.get(column) || { row, column, count: 0, aggregates: null };
  }
  function pivotDisplay(grid, result, row, column, aggregate) {
    const node = result.rows.find(node => node.key === row), siblings = result.rows.filter(sibling => sibling.parent === node.parent), mode = showAsMode(grid, aggregate);
    const raw = (r, c) => pivotCell(result, r, c).aggregates?.[aggregate.id] ?? (["count", "distinctCount"].includes(aggregate.operation) ? 0 : null);
    const values = siblings.map(sibling => raw(sibling.key, column));
    const displayed = GRID_SHOW_AS.evaluate(values, mode, raw("r", "c"), raw(node.parent || "r", column), siblings.map(sibling => raw(sibling.key, "c")), siblings.map(() => raw("r", column)));
    return { value: displayed[siblings.findIndex(sibling => sibling.key === row)], mode, numberFormat: GRID_SHOW_AS.numberFormat(mode) };
  }
  Object.assign(GRID_PIVOT, { validate: pivotResult, cell: pivotCell, display: pivotDisplay });
