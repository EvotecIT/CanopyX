  // ---------- inline full-dataset queries ----------
  function gridOrder(left, right) { return left === right ? 0 : left < right ? -1 : 1; }
  // Row identities order by UTF-16 code unit, except canonical integers ("0", "42": no sign, no leading zero), which order as
  // numbers and before every other identity, so numeric keys keep their natural order (2 before 10) without padding.
  function gridIntegerId(id) {
    if (id.length > 1 && id.charCodeAt(0) === 48) return false;
    for (let index = 0; index < id.length; index++) { const code = id.charCodeAt(index); if (code < 48 || code > 57) return false; }
    return id.length > 0;
  }
  function gridIdOrder(left, right) {
    if (left === right) return 0;
    const a = gridIntegerId(left), b = gridIntegerId(right);
    if (a !== b) return a ? -1 : 1;
    return a && left.length !== right.length ? left.length - right.length : left < right ? -1 : 1;
  }

  // A cell's sort field (text or a number) orders it; its value stays what filters, value lists and search read.
  function gridSortScalar(cell, column) { return !column.valueOrder?.length && isCellObject(cell) && cell.sort != null ? cell.sort : gridScalar(cell, column); }

  function gridCompare(left, right, column, direction) {
    return gridKeyCompare(gridSortScalar(left.cells[column.id], column), gridSortScalar(right.cells[column.id], column), column, direction);
  }

  function gridKeyCompare(a, b, column, direction) {
    // Empty strings are values. Missing/null cells sort last in either direction.
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    if (column.valueOrder?.length) {
      const at = value => { const index = typeof value === "string" ? column.valueOrder.indexOf(value) : -1; return index < 0 ? column.valueOrder.length : index; };
      const rank = at(a) - at(b), result = rank || gridOrder(typeof a, typeof b) || gridOrder(a, b);
      return direction === "desc" ? -result : result;
    }
    const x = column.kind === "text" && typeof a !== "number" ? String(a) : a, y = column.kind === "text" && typeof b !== "number" ? String(b) : b;
    // Keys of different types (a numeric sort key beside text) order by type, numbers first, so the order is consistent.
    const rank = gridOrder(typeof x, typeof y);
    if (rank) return rank;
    const result = gridOrder(x, y);
    return direction === "desc" ? -result : result;
  }

  function gridMatches(row, predicate, column) {
    if (!Object.hasOwn(GRID_FILTER_LABELS, predicate.operator)) throw new Error("CanopyX: no plugin provides filter operator '" + predicate.operator + "'.");
    if (predicate.bucket) return cellMatches(GRID_BUCKETS.key(predicate.bucket, gridScalar(row.cells[column.id], column)), predicate, { ...column, kind: "number" });
    return cellMatches(row.cells[column.id], predicate, column);
  }

  function gridQueryRows(view, query, columns, compare = gridCompare, matches = gridMatches, extended = false) {
    if (!extended && GRID_OPTIONS.queryRows && GRID_OPTION_GRIDS.has(view)) return GRID_OPTIONS.queryRows(view, query, columns, compare);
    const terms = gridSearchTerms(query.search, query.searchMode),
      searchColumns = view.searchColumns ? view.searchColumns.map(id => columns.get(id)) : view.columns;
    const rows = view.rows.filter(row => gridMatchesSearch(row, terms, searchColumns) &&
      query.filters.every(predicate => matches(row, predicate, columns.get(predicate.column))) && gridMatchesGroup(row, query.filterGroup, columns, matches) && gridMatchesTuples(row, query.tupleFilters, columns));
    if (compare !== gridCompare || !query.sort.length) return compare ? rows.sort((a, b) => {
      for (const sort of query.sort) {
        const compared = compare(a, b, columns.get(sort.column), sort.direction);
        if (compared) return compared;
      }
      return gridIdOrder(a.id, b.id);
    }) : rows;
    // The built-in order reads each row's keys once, not in every comparison: a date key parses its text.
    const sorts = query.sort.map(sort => [columns.get(sort.column), sort.direction]),
      keys = sorts.map(([column]) => rows.map(row => gridSortScalar(row.cells[column.id], column)));
    return rows.map((row, index) => index).sort((a, b) => {
      for (let s = 0; s < sorts.length; s++) {
        const compared = gridKeyCompare(keys[s][a], keys[s][b], sorts[s][0], sorts[s][1]);
        if (compared) return compared;
      }
      return gridIdOrder(rows[a].id, rows[b].id);
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
