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
    let column = filter && columns.get(filter.column);
    const values = filter && filter.values, bucket = filter?.bucket === undefined ? null : gridBucketDefinition(filter.bucket, column || {});
    if (bucket) column = { ...column, kind: "number" };
    if (!column || budget.filterable && column.filterable === false || typeof filter.operator !== "string" ||
        !(Object.hasOwn(GRID_FILTER_LABELS, filter.operator) || !bucket && /^[a-z][a-zA-Z\d]{0,31}$/.test(filter.operator)) ||
        !Array.isArray(values))
      throw new Error("CanopyX: invalid grid predicate.");
    const nullTest = filter.operator === "isNull" || filter.operator === "isNotNull";
    if (nullTest ? values.length !== 0 : filter.operator === "in" ? values.length < 1 || values.length > 1000 : values.length !== 1)
      throw new Error("CanopyX: invalid grid predicate arity.");
    if (["contains", "startsWith"].includes(filter.operator) && (column.kind !== "text" || values.some(value => typeof value !== "string")) ||
        ["gt", "ge", "lt", "le"].includes(filter.operator) && !["number", "datetime"].includes(column.kind))
      throw new Error("CanopyX: predicate does not match the column kind.");
    values.forEach(value => { if (value == null || typeof value === "object") throw new Error("CanopyX: predicate operands are non-null raw values."); gridScalar(value, column); });
    return gridQueryRecord(filter, { column: column.id, operator: filter.operator, values: values.slice(), ...(bucket ? { bucket } : {}) }, budget.strict);
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

  function gridMatchesGroup(row, group, columns, matches = gridMatches) {
    if (!group) return true;
    if (group.operator === "and") return group.filters.every(filter => matches(row, filter, columns.get(filter.column))) &&
      group.groups.every(child => gridMatchesGroup(row, child, columns, matches));
    return group.filters.some(filter => matches(row, filter, columns.get(filter.column))) ||
      group.groups.some(child => gridMatchesGroup(row, child, columns, matches));
  }

  function gridSearchTerms(text, mode) {
    if (mode === "regex") return text ? [{ pattern: boundedPattern(text, false), deadline: performance.now() + 50 }] : [];
    if (mode !== "words") return text ? [foldText(text)] : [];
    // Quoted text is one phrase; an unfinished quote runs through the end of the input.
    return [...text.matchAll(/"([^"]*)(?:"|$)|([^\s"]+)/g)].map(match => foldText(match[1] === undefined ? match[2] : match[1])).filter(Boolean);
  }

  // An ASCII term searches the raw text with a case-insensitive pattern instead of folding a copy of every cell. Folding
  // lowercases ASCII, which the i flag matches, and maps a few other characters onto ASCII letters (the Kelvin sign to
  // "k"); the pattern lists those beside the letter, so it finds exactly what folding would. Other terms, and terms long
  // enough to strain the pattern engine, fold the cells.
  const GRID_ASCII = /^[\0-\x7f]*$/, GRID_TERM_PATTERNS = new Map();
  let gridFoldsToAscii = null;
  function gridTermPattern(term) {
    let pattern = GRID_TERM_PATTERNS.get(term);
    if (pattern !== undefined) return pattern;
    if (GRID_TERM_PATTERNS.size >= 64) GRID_TERM_PATTERNS.clear();
    pattern = null;
    if (term.length <= 256 && GRID_ASCII.test(term)) {
      if (!gridFoldsToAscii) {
        gridFoldsToAscii = new Map();
        for (let code = 128; code < 65536; code++) {
          const folded = foldText(String.fromCharCode(code)).charCodeAt(0);
          if (folded < 128) gridFoldsToAscii.set(folded, (gridFoldsToAscii.get(folded) || "") + "\\u" + code.toString(16).padStart(4, "0"));
        }
      }
      let source = "";
      for (const char of term) {
        const others = gridFoldsToAscii.get(char.charCodeAt(0)), escaped = /[.*+?^${}()|[\]\\\/-]/.test(char) ? "\\" + char : char;
        source += others ? "[" + escaped + others + "]" : escaped;
      }
      pattern = new RegExp(source, "i");
    }
    GRID_TERM_PATTERNS.set(term, pattern);
    return pattern;
  }

  function gridMatchesSearch(row, terms, columns) {
    for (const term of terms) {
      const ascii = term.pattern ? null : gridTermPattern(term);
      let found = false;
      for (let index = 0; index < columns.length && !found; index++) {
        const cell = row.cells[columns[index].id], text = isCellObject(cell) && cell.searchText !== undefined ? cell.searchText : cellValue(cell);
        if (term.pattern) {
          if (performance.now() > term.deadline) throw new Error("CanopyX: regex search exceeded its 50 ms evaluation budget.");
          const input = text == null ? "" : String(text);
          // Like the .NET providers, a cell over 4,096 code units never matches; the row can still match on its other cells.
          found = input.length <= 4096 && term.pattern.test(input);
        } else if (text != null) found = ascii ? ascii.test(typeof text === "string" ? text : String(text)) : foldText(text).includes(term);
      }
      if (!found) return false;
    }
    return true;
  }

