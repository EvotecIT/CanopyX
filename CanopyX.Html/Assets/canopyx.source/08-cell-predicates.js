  // ---------- ordinary typed cell predicates shared by grids and linked trees ----------
  // Raw cell values retain their column kind: dates compare by instant, text folds case, and booleans remain booleans.
  function gridScalar(cell, column) {
    const value = cellValue(cell);
    if (value == null) return null;
    if (column.kind === "number") {
      if (!safeGridNumber(value))
        throw new Error("CanopyX: numeric grid cells need finite values within the safe integer magnitude.");
      return value;
    }
    if (column.kind === "datetime") {
      const date = typeof value === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
      if (!Number.isFinite(date))
        throw new Error("CanopyX: date grid cells need ISO dates with an explicit time zone.");
      return date;
    }
    if (typeof value !== "string" && typeof value !== "boolean") throw new Error("CanopyX: text grid cells need strings or booleans.");
    return value;
  }

  function gridExactTokens(column) { return column.kind === "text" && (column.valueOrder?.length || Object.keys(column.valueLabels || {}).length); }
  function cellMatches(cell, predicate, column) {
    const scalar = gridScalar(cell, column), op = predicate.operator;
    if (op === "isNull") return scalar === null;
    if (op === "isNotNull") return scalar !== null;
    if (scalar === null) return false;
    const normalize = value => column.kind === "text" && !gridExactTokens(column) && typeof value === "string" ? foldText(value) : value;
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
