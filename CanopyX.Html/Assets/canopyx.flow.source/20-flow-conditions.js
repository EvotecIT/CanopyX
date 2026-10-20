  // ---------- flow: conditions as data (docs/flow.md#conditions) ----------
  // The filter builder's grammar with field in place of column: groups of predicates joined by and, or and none. No script
  // strings, so a strict Content Security Policy holds, and C# evaluates the same documents (CanopyFlowCondition.Evaluate,
  // with shared fixtures in tests/fixtures/flow-conditions.json).
  const FLOW_ARITY = { eq: 1, ne: 1, gt: 1, ge: 1, lt: 1, le: 1, contains: 1, notContains: 1, startsWith: 1, endsWith: 1, matches: 1, notMatches: 1,
    in: -1, notIn: -1, between: 2, isNull: 0, isNotNull: 0 };

  /** Checks a condition and returns it compiled; counts holds the groups and predicates seen so far. */
  function flowCondition(raw, model, counts, depth = 1) {
    flowKeys(raw, ["operator", "filters", "groups"], "A condition");
    if (depth > 8 || ++counts.groups > 64) flowFail("a condition holds at most eight levels and 64 groups");
    const filters = raw.filters ?? [], groups = raw.groups ?? [];
    if (!["and", "or", "none"].includes(raw.operator) || !Array.isArray(filters) || !Array.isArray(groups) || !filters.length && !groups.length)
      flowFail("a condition group needs and, or or none and at least one predicate or group");
    return Object.freeze({ operator: raw.operator, groups: groups.map(group => flowCondition(group, model, counts, depth + 1)), filters: filters.map(filter => {
      flowKeys(filter, ["field", "operator", "values"], "A condition predicate");
      if (++counts.filters > 64) flowFail("a condition holds at most 64 predicates");
      if (!model.fields.has(filter.field)) flowFail("a condition names the unknown field '" + filter.field + "'");
      if (model.fields.get(filter.field).type === "secret") flowFail("a condition cannot read the secret field '" + filter.field + "'");
      const arity = FLOW_ARITY[filter.operator], values = filter.values ?? [];
      if (arity === undefined || !Array.isArray(values) || (arity < 0 ? values.length < 1 || values.length > 1000 : values.length !== arity) || !values.every(flowScalar))
        flowFail("a condition on '" + filter.field + "' has an unknown operator or the wrong values");
      const safe = value => typeof value !== "number" || Math.abs(value) <= Number.MAX_SAFE_INTEGER, op = filter.operator;
      if (!values.every(value => safe(value) && (typeof value !== "string" || value.length <= 4096)) ||
          ["startsWith", "endsWith", "matches", "notMatches"].includes(op) && typeof values[0] !== "string" ||
          ["gt", "ge", "lt", "le"].includes(op) && typeof values[0] === "boolean" ||
          op === "between" && !(typeof values[0] === typeof values[1] && ["number", "string"].includes(typeof values[0]) && flowOrder(values[0], values[1]) <= 0))
        flowFail("a condition on '" + filter.field + "' has values its operator does not take");
      let pattern = null;
      if (filter.operator === "matches" || filter.operator === "notMatches") {
        if (typeof values[0] !== "string") flowFail("a pattern condition needs a pattern");
        try { pattern = boundedPattern(values[0], false); } catch (error) { flowFail("a condition has an invalid or unsafe pattern"); }
      }
      return Object.freeze({ field: filter.field, operator: filter.operator, values: Object.freeze(values.slice()), pattern });
    }) });
  }

  /** The fields a condition reads. */
  function flowRefs(condition, into = new Set()) {
    if (condition) { condition.filters.forEach(filter => into.add(filter.field)); condition.groups.forEach(group => flowRefs(group, into)); }
    return into;
  }

  // Text folds and orders by code unit; numbers order as numbers; nothing converts. null when the two cannot be ordered.
  const flowSame = (left, right) => typeof left === typeof right && (typeof left === "string" ? foldText(left) === foldText(right) : left === right);
  function flowOrder(left, right) {
    if (typeof left === "number" && typeof right === "number") return left < right ? -1 : left > right ? 1 : 0;
    if (typeof left !== "string" || typeof right !== "string") return null;
    const a = foldText(left), b = foldText(right);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /** Whether one answer satisfies a predicate. An empty answer matches only isNull, as in grid filters. */
  function flowMatch(filter, value) {
    const operator = filter.operator, operand = filter.values[0];
    if (flowEmpty(value)) return operator === "isNull";
    if (operator === "isNull" || operator === "isNotNull") return operator === "isNotNull";
    const listed = item => filter.values.some(entry => flowSame(item, entry));
    if (Array.isArray(value)) {
      if (operator === "contains" || operator === "notContains") return value.some(item => flowSame(item, operand)) === (operator === "contains");
      if (operator === "in" || operator === "notIn") return value.some(listed) === (operator === "in");
      return false;
    }
    const text = typeof value === "string" && typeof operand === "string", order = flowOrder(value, operand);
    switch (operator) {
      case "eq": return flowSame(value, operand);
      case "ne": return !flowSame(value, operand);
      case "in": return listed(value);
      case "notIn": return !listed(value);
      case "gt": return order !== null && order > 0;
      case "ge": return order !== null && order >= 0;
      case "lt": return order !== null && order < 0;
      case "le": return order !== null && order <= 0;
      case "between": { const low = flowOrder(value, filter.values[0]), high = flowOrder(value, filter.values[1]); return low !== null && high !== null && low >= 0 && high <= 0; }
      case "contains": return text && foldText(value).includes(foldText(operand));
      case "notContains": return text && !foldText(value).includes(foldText(operand));
      case "startsWith": return text && foldText(value).startsWith(foldText(operand));
      case "endsWith": return text && foldText(value).endsWith(foldText(operand));
      case "matches": return typeof value === "string" && filter.pattern.test(value.slice(0, 4096));
      case "notMatches": return typeof value === "string" && !filter.pattern.test(value.slice(0, 4096));
      default: return false;
    }
  }

  /** Evaluates a compiled condition; read(fieldId) returns an answer, empty when its field is hidden. */
  function flowTest(condition, read) {
    if (!condition) return true;
    const results = [...condition.filters.map(filter => flowMatch(filter, read(filter.field))), ...condition.groups.map(group => flowTest(group, read))];
    return condition.operator === "and" ? results.every(Boolean) : condition.operator === "or" ? results.some(Boolean) : !results.some(Boolean);
  }

  // The conditions of the steps, sections and fields, compiled; a field may not depend on itself through them.
  function flowConditions(model) {
    const compile = raw => raw === undefined ? null : flowCondition(raw, model, { groups: 0, filters: 0 });
    for (const step of model.steps) {
      step.when = compile(step.raw.when);
      for (const block of step.blocks) if (block.section) block.section.when = compile(block.section.raw.when);
    }
    for (const field of model.fields.values()) {
      field.when = compile(field.raw.when);
      field.refs = flowRefs(field.step.when, flowRefs(field.section?.when, flowRefs(field.when)));
    }
    const state = new Map(), visit = field => {
      if (state.get(field.id) === 2) return;
      if (state.get(field.id) === 1) flowFail("the conditions of field " + field.id + " depend on themselves");
      state.set(field.id, 1);
      field.refs.forEach(id => visit(model.fields.get(id)));
      state.set(field.id, 2);
    };
    model.fields.forEach(visit);
  }
