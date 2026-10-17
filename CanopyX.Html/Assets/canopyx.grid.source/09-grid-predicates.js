  // ---------- bounded typed query expressions ----------
  const GRID_FILTER_LABELS = { eq: "=", ne: "≠", contains: "gridContains", startsWith: "gridStartsWith", in: "gridIn",
    gt: ">", ge: "≥", lt: "<", le: "≤", isNull: "gridIsNull", isNotNull: "gridIsNotNull" };
  function gridQueryRecord(input, record, strict, cursor) {
    // Saved cursor intent may name the first offset; cursor requests omit that field.
    if (strict && Object.keys(input).some(key => !Object.hasOwn(record, key) && !(cursor && key === "offset"))) throw new Error("CanopyX: invalid state query.");
    return gridFreeze(record);
  }
  function gridPredicate(filter, columns, budget) {
    if (++budget.predicates > 64) throw new Error("CanopyX: at most 64 grid predicates.");
    const column = filter && columns.get(filter.column), values = filter && filter.values;
    if (!column || budget.filterable && column.filterable === false || !Object.keys(GRID_FILTER_LABELS).includes(filter.operator) ||
        !Array.isArray(values))
      throw new Error("CanopyX: invalid grid predicate.");
    const nullTest = filter.operator === "isNull" || filter.operator === "isNotNull";
    if (nullTest ? values.length !== 0 : filter.operator === "in" ? values.length < 1 || values.length > 1000 : values.length !== 1)
      throw new Error("CanopyX: invalid grid predicate arity.");
    if (["contains", "startsWith"].includes(filter.operator) && (column.kind !== "text" || values.some(value => typeof value !== "string")) ||
        ["gt", "ge", "lt", "le"].includes(filter.operator) && !["number", "datetime"].includes(column.kind))
      throw new Error("CanopyX: predicate does not match the column kind.");
    values.forEach(value => { if (value == null || typeof value === "object") throw new Error("CanopyX: predicate operands are non-null raw values."); gridScalar(value, column); });
    return gridQueryRecord(filter, { column: column.id, operator: filter.operator, values: values.slice() }, budget.strict);
  }

  function gridFilterGroup(group, columns, budget, depth) {
    if (depth > 8 || ++budget.groups > 64) throw new Error("CanopyX: grid filter groups exceed their depth or count limit.");
    if (!group || !["and", "or"].includes(group.operator) || !Array.isArray(group.filters) || !Array.isArray(group.groups) ||
        !group.filters.length && !group.groups.length)
      throw new Error("CanopyX: invalid or empty grid filter group.");
    const filters = group.filters.map(filter => gridPredicate(filter, columns, budget));
    const groups = group.groups.map(child => gridFilterGroup(child, columns, budget, depth + 1));
    return gridQueryRecord(group, { operator: group.operator, filters, groups }, budget.strict);
  }

  function gridMatchesGroup(row, group, columns) {
    if (!group) return true;
    if (group.operator === "and") return group.filters.every(filter => gridMatches(row, filter, columns.get(filter.column))) &&
      group.groups.every(child => gridMatchesGroup(row, child, columns));
    return group.filters.some(filter => gridMatches(row, filter, columns.get(filter.column))) ||
      group.groups.some(child => gridMatchesGroup(row, child, columns));
  }

  function gridSearchTerms(text, mode) {
    if (mode !== "words") return text ? [foldText(text)] : [];
    // Quoted text is one phrase; an unfinished quote runs through the end of the input.
    return [...text.matchAll(/"([^"]*)(?:"|$)|([^\s"]+)/g)].map(match => foldText(match[1] === undefined ? match[2] : match[1])).filter(Boolean);
  }

  function gridMatchesSearch(row, terms, columns) {
    return terms.every(term => columns.some(column => {
      const cell = row.cells[column.id], text = isCellObject(cell) && cell.searchText !== undefined ? cell.searchText : cellValue(cell);
      return foldText(text).includes(term);
    }));
  }
