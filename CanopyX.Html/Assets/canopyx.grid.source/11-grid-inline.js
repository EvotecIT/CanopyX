  // ---------- inline full-dataset queries ----------
  function gridOrder(left, right) { return left === right ? 0 : left < right ? -1 : 1; }

  // A cell's sort field (text or a number) orders it; its value stays what filters, value lists and search read.
  function gridSortScalar(cell, column) { return isCellObject(cell) && cell.sort != null ? cell.sort : gridScalar(cell, column); }

  function gridCompare(left, right, column, direction) {
    return gridKeyCompare(gridSortScalar(left.cells[column.id], column), gridSortScalar(right.cells[column.id], column), column, direction);
  }

  function gridKeyCompare(a, b, column, direction) {
    // Empty strings are values. Missing/null cells sort last in either direction.
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    const x = column.kind === "text" && typeof a !== "number" ? String(a) : a, y = column.kind === "text" && typeof b !== "number" ? String(b) : b;
    // Keys of different types (a numeric sort key beside text) order by type, numbers first, so the order is consistent.
    const rank = gridOrder(typeof x, typeof y);
    if (rank) return rank;
    const result = gridOrder(x, y);
    return direction === "desc" ? -result : result;
  }

  function gridMatches(row, predicate, column) {
    const scalar = gridScalar(row.cells[column.id], column), op = predicate.operator;
    if (op === "isNull") return scalar === null;
    if (op === "isNotNull") return scalar !== null;
    if (scalar === null) return false;
    const normalize = value => column.kind === "text" && typeof value === "string" ? foldText(value) : value;
    const value = normalize(scalar), values = predicate.values.map(operand => normalize(gridScalar(operand, column))), operand = values[0];
    switch (op) {
      case "eq": return value === operand;
      case "ne": return value !== operand;
      case "in": return values.includes(value);
      // Text strings were folded above; boolean text keeps its distinct raw type for eq/in.
      case "contains": return String(value).includes(String(operand));
      case "startsWith": return String(value).startsWith(String(operand));
      case "gt": return value > operand;
      case "ge": return value >= operand;
      case "lt": return value < operand;
      case "le": return value <= operand;
    }
    return false;
  }

  function gridQueryRows(view, query, columns, compare = gridCompare) {
    const terms = gridSearchTerms(query.search, query.searchMode),
      searchColumns = view.searchColumns ? view.searchColumns.map(id => columns.get(id)) : view.columns;
    const rows = view.rows.filter(row => gridMatchesSearch(row, terms, searchColumns) &&
      query.filters.every(predicate => gridMatches(row, predicate, columns.get(predicate.column))) && gridMatchesGroup(row, query.filterGroup, columns));
    if (compare !== gridCompare || !query.sort.length) return compare ? rows.sort((a, b) => {
      for (const sort of query.sort) {
        const compared = compare(a, b, columns.get(sort.column), sort.direction);
        if (compared) return compared;
      }
      return gridOrder(a.id, b.id);
    }) : rows;
    // The built-in order reads each row's keys once, not in every comparison: a date key parses its text.
    const sorts = query.sort.map(sort => [columns.get(sort.column), sort.direction]),
      keys = sorts.map(([column]) => rows.map(row => gridSortScalar(row.cells[column.id], column)));
    return rows.map((row, index) => index).sort((a, b) => {
      for (let s = 0; s < sorts.length; s++) {
        const compared = gridKeyCompare(keys[s][a], keys[s][b], sorts[s][0], sorts[s][1]);
        if (compared) return compared;
      }
      return gridOrder(rows[a].id, rows[b].id);
    }).map(index => rows[index]);
  }

  function inlineGridSource(view) {
    const columns = new Map(view.columns.map(column => [column.id, column]));
    const compare = GRID_REPORTING.compare?.(view);
    let lastShape = null, ordered = null;
    return {
      query(query, options) {
        if (options.signal.aborted) throw new DOMException("Grid cancelled.", "AbortError");
        const shape = gridResultShape(query);
        if (shape !== lastShape) {
          ordered = gridQueryRows(view, query, columns, compare);
          lastShape = shape;
        }
        return { protocol: PROTOCOL, type: "gridPage", view: view.id, revision: "inline", offset: query.offset,
          total: view.rows.length, matched: ordered.length, items: ordered.slice(query.offset, query.offset + query.limit) };
      },
      // A record's position in a query's result (-1 outside it) and a record by id, for record deep links and related records.
      position(query, id) {
        if (gridResultShape(query) !== lastShape) { ordered = gridQueryRows(view, query, columns, compare); lastShape = gridResultShape(query); }
        return ordered.findIndex(row => row.id === id);
      },
      row(id) { return view.rows.find(row => row.id === id) || null; }
    };
  }
