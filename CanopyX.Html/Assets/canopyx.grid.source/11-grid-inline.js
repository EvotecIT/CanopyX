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
      case "contains": return foldText(value).includes(foldText(operand));
      case "startsWith": return foldText(value).startsWith(foldText(operand));
      case "gt": return value > operand;
      case "ge": return value >= operand;
      case "lt": return value < operand;
      case "le": return value <= operand;
    }
    return false;
  }

  function inlineGridSource(view) {
    const rows = view.rows, columns = new Map(view.columns.map(column => [column.id, column]));
    const searchColumns = view.searchColumns ? view.searchColumns.map(id => columns.get(id)) : view.columns;
    let lastShape = null, ordered = null;
    return {
      query(query, options) {
        if (options.signal.aborted) throw new DOMException("Grid query was cancelled.", "AbortError");
        const shape = gridResultShape(query);
        if (shape !== lastShape) {
          const terms = gridSearchTerms(query.search, query.searchMode);
          ordered = rows.filter(row => gridMatchesSearch(row, terms, searchColumns) &&
            query.filters.every(predicate => gridMatches(row, predicate, columns.get(predicate.column))) && gridMatchesGroup(row, query.filterGroup, columns));
          ordered.sort((a, b) => {
            for (const sort of query.sort) {
              const compared = gridCompare(a, b, columns.get(sort.column), sort.direction);
              if (compared) return compared;
            }
            return gridOrder(a.id, b.id);
          });
          lastShape = shape;
        }
        return { protocol: PROTOCOL, type: "gridPage", view: view.id, revision: "inline", offset: query.offset,
          total: rows.length, matched: ordered.length, items: ordered.slice(query.offset, query.offset + query.limit) };
      }
    };
  }
