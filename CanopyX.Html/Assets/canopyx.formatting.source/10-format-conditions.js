  // ---------- conditions: the filter builder's groups and predicates, with more operators, value types, case and culture ----------
  // A group is { operator: "and" | "or" | "none", filters, groups }, so every filter group is a condition. A predicate is
  // { column, operator, values, valueColumn?, type?, caseSensitive?, culture? }. Missing values match only isNull, as in
  // filters; text compares case-insensitively by default with the runtime's search folding, or with the culture's rules.
  // Conditions compile once into closures; a rule evaluates a row with plain calls and no allocation.
  const FORMAT_OPERATORS = { eq: 1, ne: 1, gt: 1, ge: 1, lt: 1, le: 1, contains: 1, notContains: 1, startsWith: 1, endsWith: 1, like: 1, notLike: 1,
    matches: 1, notMatches: 1, in: -1, notIn: -1, between: 2, betweenExclusive: 2, isNull: 0, isNotNull: 0, olderThan: 1, withinLast: 1 };
  const FORMAT_TYPES = ["text", "number", "boolean", "date"], FORMAT_DAY = 86400000;
  function formatError(message) { throw new Error("CanopyX: " + message); }
  function formatKeys(value, keys, what) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) formatError("invalid " + what + ".");
  }
  const formatCultures = new Map();
  // A culture's number parser and collator, created once: the decimal and group separators come from Intl.
  function formatCulture(culture) {
    let entry = formatCultures.get(culture);
    if (!entry) {
      let tag;
      try { tag = Intl.getCanonicalLocales(culture)[0]; } catch (_) { formatError("unknown culture '" + culture + "'."); }
      const parts = new Intl.NumberFormat(tag).formatToParts(12345.6), part = type => (parts.find(item => item.type === type) || {}).value;
      entry = { tag, group: part("group") || ",", decimal: part("decimal") || ".",
        accent: new Intl.Collator(tag, { sensitivity: "accent" }), variant: new Intl.Collator(tag, { sensitivity: "variant" }) };
      if (formatCultures.size < 64) formatCultures.set(culture, entry);
    }
    return entry;
  }
  function formatNumber(text, culture) {
    let value = String(text).trim().replace(/[\s  ']/g, "");
    if (culture) value = value.split(culture.group).join("").replace(culture.decimal, ".");
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ? Number(value) : null;
  }
  // The typed value of a raw cell or operand: numbers, epoch milliseconds, booleans or text; null when it does not convert.
  function formatCoerce(raw, type, culture) {
    if (raw == null) return null;
    if (type === "number") return typeof raw === "number" ? Number.isFinite(raw) ? raw : null : typeof raw === "boolean" ? +raw : formatNumber(raw, culture);
    if (type === "date") {
      // ISO dates and times without a zone are UTC, as the static renderer reads them; other text does not convert.
      const iso = typeof raw === "string" && /^\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d(?:\.\d+)?)?(Z|[+-]\d\d:\d\d)?)?$/.exec(raw.trim());
      const time = typeof raw === "number" ? raw : iso ? Date.parse(raw.trim() + (iso[1] || raw.trim().length === 10 ? "" : "Z")) : NaN;
      return Number.isFinite(time) ? time : null;
    }
    if (type === "boolean") {
      if (typeof raw === "boolean") return raw;
      if (typeof raw === "number") return raw !== 0;
      const word = String(raw).trim();
      return /^(?:true|yes|on|1)$/i.test(word) ? true : /^(?:false|no|off|0)$/i.test(word) ? false : null;
    }
    return type === "text" ? String(raw) : raw;
  }
  function formatWildcard(pattern) {
    return "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[\\s\\S]*").replace(/\?/g, "[\\s\\S]") + "$";
  }
  function formatPredicate(predicate, columns, budget) {
    if (++budget.predicates > 64) formatError("a formatting rule has at most 64 conditions.");
    formatKeys(predicate, ["column", "operator", "values", "valueColumn", "type", "caseSensitive", "culture"], "formatting condition");
    const column = columns.get(predicate.column), op = predicate.operator, arity = FORMAT_OPERATORS[op], values = predicate.values ?? [];
    const other = predicate.valueColumn === undefined ? null : columns.get(predicate.valueColumn) || formatError("a condition compares with an undeclared column.");
    if (!column || arity === undefined || !Array.isArray(values) || predicate.caseSensitive !== undefined && typeof predicate.caseSensitive !== "boolean" ||
        predicate.type !== undefined && !FORMAT_TYPES.includes(predicate.type) || predicate.culture !== undefined && (typeof predicate.culture !== "string" || !predicate.culture || predicate.culture.length > 64))
      formatError("invalid formatting condition.");
    const patterned = op === "like" || op === "notLike" || op === "matches" || op === "notMatches";
    if (other ? values.length || arity !== 1 || op === "olderThan" || op === "withinLast" || patterned : arity < 0 ? values.length < 1 || values.length > 1000 : values.length !== arity)
      formatError("formatting condition '" + op + "' has the wrong number of values.");
    if (values.some(value => !(typeof value === "string" && value.length <= 4096 || typeof value === "boolean" || Number.isFinite(value))))
      formatError("condition values are text, finite numbers or booleans.");
    const culture = predicate.culture ? formatCulture(predicate.culture) : null, exact = !!predicate.caseSensitive;
    const type = op === "olderThan" || op === "withinLast" ? "date" : predicate.type || (column.kind === "number" ? "number" : column.kind === "datetime" ? "date" : null);
    if ((op === "olderThan" || op === "withinLast") && !(typeof values[0] === "number" && values[0] >= 0 && values[0] <= 36500))
      formatError("relative dates take a number of days from 0 to 36500.");
    const text = value => typeof value === "string" ? exact ? value : culture ? value.toLocaleLowerCase(culture.tag) : foldText(value) : value;
    const read = (cells, id) => text(formatCoerce(cellValue(cells[id]), type, culture));
    const collator = culture && (exact ? culture.variant : culture.accent);
    const order = (a, b) => typeof a === "string" && typeof b === "string" && collator ? collator.compare(a, b) : a < b ? -1 : a > b ? 1 : 0;
    let operands = [], pattern = null;
    if (patterned) {
      // Patterns use the syntax ECMAScript and .NET share; the static renderer evaluates them too.
      const source = String(values[0]);
      if (source.length > 256) formatError("patterns have at most 256 characters.");
      if (/\(\?(?![:=!]|<[=!]|<[A-Za-z])/.test(source)) formatError("pattern '" + source + "' uses a construct outside the shared syntax.");
      try { pattern = new RegExp(op === "like" || op === "notLike" ? formatWildcard(source) : source, exact ? "u" : "iu"); }
      catch (_) { formatError("invalid pattern '" + source + "'."); }
    } else if (op === "olderThan" || op === "withinLast") operands = [values[0] * FORMAT_DAY];
    else operands = values.map(value => {
      const typed = text(formatCoerce(value, type, culture));
      if (typed === null) formatError("value '" + value + "' does not convert to " + (type || "text") + ".");
      return typed;
    });
    if ((op === "between" || op === "betweenExclusive") && order(operands[0], operands[1]) > 0) formatError("a range starts with its lower value.");
    // With a culture, membership compares like equality: by the collator, within one type.
    const id = column.id, otherId = other && other.id, set = arity < 0 && !collator ? new Set(operands) : null;
    const member = value => set ? set.has(value) : operands.some(operand => typeof operand === typeof value && order(value, operand) === 0);
    budget.relative ||= op === "olderThan" || op === "withinLast";
    return row => {
      const value = read(row.cells, id);
      if (op === "isNull") return value === null;
      if (op === "isNotNull" || value === null) return op === "isNotNull" && value !== null;
      const operand = other ? read(row.cells, otherId) : operands[0];
      if (operand === null) return false;
      switch (op) {
        case "eq": return order(value, operand) === 0 && typeof value === typeof operand;
        case "ne": return !(order(value, operand) === 0 && typeof value === typeof operand);
        case "gt": return order(value, operand) > 0;
        case "ge": return order(value, operand) >= 0;
        case "lt": return order(value, operand) < 0;
        case "le": return order(value, operand) <= 0;
        case "in": return member(value);
        case "notIn": return !member(value);
        case "between": return order(value, operand) >= 0 && order(value, operands[1]) <= 0;
        case "betweenExclusive": return order(value, operand) > 0 && order(value, operands[1]) < 0;
        case "contains": return String(value).includes(String(operand));
        case "notContains": return !String(value).includes(String(operand));
        case "startsWith": return String(value).startsWith(String(operand));
        case "endsWith": return String(value).endsWith(String(operand));
        case "like": case "matches": return pattern.test(String(value).slice(0, 4096));
        case "notLike": case "notMatches": return !pattern.test(String(value).slice(0, 4096));
        case "olderThan": return value < Date.now() - operand;
        case "withinLast": { const now = Date.now(); return value >= now - operand && value <= now; }
      }
      return false;
    };
  }
  function formatGroup(group, columns, budget, depth) {
    if (depth > 8 || ++budget.groups > 64) formatError("formatting conditions exceed eight levels or 64 groups.");
    formatKeys(group, ["operator", "filters", "groups"], "formatting condition group");
    const filters = group.filters ?? [], groups = group.groups ?? [];
    if (!["and", "or", "none"].includes(group.operator) || !Array.isArray(filters) || !Array.isArray(groups) || !filters.length && !groups.length)
      formatError("invalid or empty formatting condition group.");
    const tests = [...filters.map(filter => formatPredicate(filter, columns, budget)), ...groups.map(child => formatGroup(child, columns, budget, depth + 1))];
    const count = tests.length;
    if (group.operator === "and") return row => { for (let i = 0; i < count; i++) if (!tests[i](row)) return false; return true; };
    const any = row => { for (let i = 0; i < count; i++) if (tests[i](row)) return true; return false; };
    return group.operator === "or" ? any : row => !any(row);
  }
