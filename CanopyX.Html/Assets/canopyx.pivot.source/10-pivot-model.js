  const pivotColumn = (grid, id) => grid.view.columns.find(column => column.id === id);
  function pivotRaw(grid, level, row) {
    const column = pivotColumn(grid, level.column), value = gridScalar(row.cells[column.id], column);
    return level.bucket ? GRID_BUCKETS.key(level.bucket, value) : column.kind === "datetime" && value !== null ? new Date(value).toISOString().replace(".000Z", "Z") : value;
  }
  function pivotKey(axis, path, levels, grid) {
    return axis + path.map((value, index) => {
      const kind = pivotColumn(grid, levels[index].column).kind;
      const text = value === null ? "z" : !levels[index].bucket && kind === "datetime" ? "d" + Date.parse(value) :
        typeof value === "string" ? "s" + value : typeof value === "boolean" ? value ? "b1" : "b0" : "n" + String(value);
      return "|" + text.length + ":" + text;
    }).join("");
  }
  function pivotCompare(grid, levels, left, right) {
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      const level = levels[index], column = level.bucket ? { kind: "number" } : pivotColumn(grid, level.column);
      const scalar = value => !level.bucket && column.kind === "datetime" && value !== null ? Date.parse(value) : value;
      const compare = gridKeyCompare(scalar(left[index]), scalar(right[index]), column, level.direction);
      if (compare) return compare;
    }
    return left.length - right.length;
  }
  const pivotNumberOrder = (a, b, descending) => a === null || b === null ? a === b ? 0 : a === null ? 1 : -1 : descending ? b - a : a - b;
  function pivotInline(grid, definition, query) {
    const source = gridQueryRows(grid.view, query, new Map(grid.view.columns.map(column => [column.id, column])), null);
    if (source.length > 100000) throw new Error("CanopyX: inline pivot supports at most 100,000 records; use a hosted pivot for larger datasets.");
    const aggregates = definition.values.map(id => grid.view.reporting.aggregates.find(value => value.id === id));
    const aggregate = rows => Object.fromEntries(aggregates.map(value => [value.id, GRID_ROWS.aggregateValue(grid, value, rows, 0, rows.length)]));
    const paths = new Map(), contributions = source.map(row => {
      const rows = definition.rows.map(level => pivotRaw(grid, level, row)), columns = definition.columns.map(level => pivotRaw(grid, level, row));
      const key = pivotKey("c", columns, definition.columns, grid);
      if (!paths.has(key)) paths.set(key, { key, path: columns, members: [] }); paths.get(key).members.push(row); return { rows, columns, row };
    });
    let leaves = [...paths.values()].sort((a, b) => pivotCompare(grid, definition.columns, a.path, b.path));
    const requested = Math.min(definition.maxColumns, definition.topNColumns ?? definition.maxColumns), limited = leaves.length > requested;
    if (limited) {
      const totals = new Map(leaves.map(leaf => [leaf.key, aggregate(leaf.members)[definition.values[0]]]));
      leaves.sort((a, b) => pivotNumberOrder(totals.get(a.key), totals.get(b.key), true) || pivotCompare(grid, definition.columns, a.path, b.path));
      leaves = leaves.slice(0, Math.min(requested, definition.maxColumns - 1));
    }
    const kept = new Set(leaves.map(leaf => leaf.key)), rowNodes = new Map(), columnNodes = new Map(), members = new Map();
    const nodes = (map, axis, path, levels) => {
      for (let depth = 0; depth <= path.length; depth++) {
        const prefix = path.slice(0, depth), key = pivotKey(axis, prefix, levels, grid);
        if (!map.has(key)) {
          if (map.size >= 10001) throw new Error("CanopyX: a pivot axis supports at most 10,000 prefixes.");
          map.set(key, { key, ...(depth ? { parent: pivotKey(axis, path.slice(0, depth - 1), levels, grid) } : {}), path: prefix, other: false });
        }
      }
    };
    nodes(rowNodes, "r", [], definition.rows); nodes(columnNodes, "c", [], definition.columns);
    leaves.forEach(leaf => nodes(columnNodes, "c", leaf.path, definition.columns));
    if (limited) columnNodes.set("c:other", { key: "c:other", parent: "c", path: [], other: true });
    let count = 0;
    const at = (r, c) => {
      if (!members.has(r)) members.set(r, new Map());
      if (!members.get(r).has(c)) { if (++count > 100000) throw new Error("CanopyX: pivot exceeds 100,000 populated prefix intersections."); members.get(r).set(c, []); }
      return members.get(r).get(c);
    };
    at("r", "c");
    for (const entry of contributions) {
      nodes(rowNodes, "r", entry.rows, definition.rows);
      if (rowNodes.size * columnNodes.size * aggregates.length > 100000) throw new Error("CanopyX: pivot tables support at most 100,000 display cells. Narrow the query, axes or values.");
      const other = limited && !kept.has(pivotKey("c", entry.columns, definition.columns, grid));
      for (let r = 0; r <= entry.rows.length; r++) {
        const row = pivotKey("r", entry.rows.slice(0, r), definition.rows, grid); at(row, "c").push(entry.row);
        if (other) at(row, "c:other").push(entry.row);
        for (let c = 1; c <= entry.columns.length; c++) {
          const column = pivotKey("c", entry.columns.slice(0, c), definition.columns, grid);
          if (columnNodes.has(column)) at(row, column).push(entry.row);
        }
      }
    }
    const cells = [], lookup = new Map();
    for (const [row, columns] of members) for (const [column, records] of columns) {
      const cell = { row, column, count: records.length, aggregates: aggregate(records) }; cells.push(cell);
      if (!lookup.has(row)) lookup.set(row, new Map()); lookup.get(row).set(column, cell);
    }
    const order = (nodes, levels, rows) => {
      const result = [], children = new Map();
      for (const node of nodes.values()) { const parent = node.parent || ""; if (!children.has(parent)) children.set(parent, []); children.get(parent).push(node); }
      const walk = parent => {
        const siblings = children.get(parent) || [];
        siblings.sort((a, b) => {
          if (a.other || b.other) return a.other === b.other ? 0 : a.other ? 1 : -1;
          if (rows && definition.sortByTotal) {
            const id = definition.sortByTotal.aggregate, sorted = pivotNumberOrder(lookup.get(a.key).get("c").aggregates[id], lookup.get(b.key).get("c").aggregates[id], definition.sortByTotal.direction === "desc");
            if (sorted) return sorted;
          }
          return pivotCompare(grid, levels, a.path, b.path);
        });
        for (const node of siblings) { result.push(node); walk(node.key); }
      };
      walk(""); return result;
    };
    return { protocol: "canopyx/2", type: "gridPivot", view: grid.view.id, matched: source.length, distinctColumns: paths.size, columnsLimited: limited, definition,
      rows: order(rowNodes, definition.rows, true), columns: order(columnNodes, definition.columns, false), retainedColumns: leaves.map(leaf => leaf.path), cells, query, revision: "inline" };
  }
  Object.assign(GRID_PIVOT, { inline: pivotInline, key: pivotKey });
