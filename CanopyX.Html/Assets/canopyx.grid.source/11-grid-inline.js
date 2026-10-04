  // ---------- inline full-dataset queries ----------
  function gridOrder(left, right) { return left === right ? 0 : left < right ? -1 : 1; }

  function gridCompare(left, right, column, direction) {
    const a = gridScalar(left.cells[column.id], column), b = gridScalar(right.cells[column.id], column);
    // Empty strings are values. Missing/null cells sort last in either direction.
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    const result = gridOrder(column.kind === "text" ? String(a) : a, column.kind === "text" ? String(b) : b);
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

  function gridQueryRows(view, query, columns, compare) {
    const terms = gridSearchTerms(query.search, query.searchMode),
      searchColumns = view.searchColumns ? view.searchColumns.map(id => columns.get(id)) : view.columns;
    const rows = view.rows.filter(row => gridMatchesSearch(row, terms, searchColumns) &&
      query.filters.every(predicate => gridMatches(row, predicate, columns.get(predicate.column))) && gridMatchesGroup(row, query.filterGroup, columns));
    return compare ? rows.sort((a, b) => {
      for (const sort of query.sort) {
        const compared = compare(a, b, columns.get(sort.column), sort.direction);
        if (compared) return compared;
      }
      return gridOrder(a.id, b.id);
    }) : rows;
  }

  function inlineGridSource(view) {
    const columns = new Map(view.columns.map(column => [column.id, column]));
    const compare = GRID_REPORTING.compare?.(view) || gridCompare;
    let lastShape = null, ordered = null;
    return {
      query(query, options) {
        if (options.signal.aborted) throw new DOMException("Grid query was cancelled.", "AbortError");
        const shape = gridResultShape(query);
        if (shape !== lastShape) {
          ordered = gridQueryRows(view, query, columns, compare);
          lastShape = shape;
        }
        return { protocol: PROTOCOL, type: "gridPage", view: view.id, revision: "inline", offset: query.offset,
          total: view.rows.length, matched: ordered.length, items: ordered.slice(query.offset, query.offset + query.limit) };
      }
    };
  }
