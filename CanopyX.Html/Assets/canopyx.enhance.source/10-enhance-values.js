  // ---------- table enhancement and simple init: values, kinds and cells (docs/enhance.md) ----------
  // The enhance part turns a table, plain records or a URL source into an ordinary grid definition. These helpers read
  // values the way people write them and build the cells: the value by column kind, the display text, and the sort and
  // search values when they differ from what the value already gives.
  const ENHANCE_KINDS = { text: "text", number: "number", datetime: "datetime", date: "datetime" };
  const ENHANCE_DATE = /^(\d{4}-\d\d-\d\d)(?:[T ](\d\d:\d\d(?::\d\d(?:\.\d{1,9})?)?)(Z|[+-]\d\d:?\d\d)?)?$/;
  // An optional sign or accounting parentheses, digits grouped by spaces, apostrophes, commas or dots, one decimal mark, up to
  // three symbols of currency before or after ("€ 1.234,50", "-12 %", "(1,200)"), or a unit of up to three letters after a
  // space ("1,024 MB"). Letters before the digits, or right after them, make a code ("A12", "Win10", "12a"), not a number.
  const ENHANCE_NUMBER = /^([^\p{L}\d\s+\-\u2212.,()]{0,3})\s?([+\-\u2212]?)(\(?)(\d[\d\s'\u2019.,\u00a0\u202f]*?)(\)?)(?:\s?[^\p{L}\d\s()]{1,3}|\s\p{L}{1,3})?$/u;
  let enhanceDecimal = null;

  /** The page language's decimal mark, which decides "1.500" and "1,500" when only one separator appears once. */
  function enhanceDecimalMark() {
    if (enhanceDecimal === null) {
      try { enhanceDecimal = new Intl.NumberFormat(document.documentElement.lang || undefined).formatToParts(1.5).find(part => part.type === "decimal")?.value || "."; }
      catch (_) { enhanceDecimal = "."; }
    }
    return enhanceDecimal;
  }

  /** Reads a number from text, or returns null when the text is not one number. */
  function enhanceNumber(text) {
    const match = typeof text === "string" && text.length <= 64 ? ENHANCE_NUMBER.exec(text.trim()) : null;
    if (!match) return null;
    if (!match[3] !== !match[5] || match[3] && match[2]) return null;
    const digits = match[4].replace(/[\s'\u2019\u00a0\u202f]/g, ""), dot = digits.lastIndexOf("."), comma = digits.lastIndexOf(",");
    let decimal = "";
    if (dot >= 0 && comma >= 0) decimal = dot > comma ? "." : ",";
    else if (dot >= 0 || comma >= 0) {
      const mark = dot >= 0 ? "." : ",", pieces = digits.split(mark);
      // One separator: the page's decimal mark, or a decimal unless exactly three digits follow ("1,234" groups thousands).
      if (pieces.length === 2) decimal = mark === enhanceDecimalMark() || pieces[1].length !== 3 ? mark : "";
    }
    const at = decimal ? digits.lastIndexOf(decimal) : -1, whole = at < 0 ? digits : digits.slice(0, at), fraction = at < 0 ? "" : digits.slice(at + 1);
    const groups = whole.split(/[.,]/);
    if (!/^\d*$/.test(fraction) || groups.some(group => !/^\d+$/.test(group)) || groups.slice(1).some(group => group.length !== 3) ||
        groups.length > 1 && groups[0].length > 3) return null;
    const value = Number((match[2] && match[2] !== "+" || match[3] ? "-" : "") + groups.join("") + (fraction ? "." + fraction : ""));
    return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : null;
  }

  /** Reads an ISO date or date and time; a missing zone is UTC. Returns the grid's wire value or null. */
  function enhanceDate(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    const match = typeof value === "string" ? ENHANCE_DATE.exec(value.trim()) : null;
    if (!match) return null;
    const zone = !match[3] || match[3] === "Z" ? "Z" : match[3].length === 5 ? match[3].slice(0, 3) + ":" + match[3].slice(3) : match[3];
    const iso = match[1] + "T" + (match[2] || "00:00") + zone;
    return Number.isFinite(Date.parse(iso)) ? iso : null;
  }

  /** The value a column of a kind stores; null when the input has none of that kind. */
  function enhanceValue(kind, value) {
    if (value === undefined || value === null || value === "") return null;
    if (kind === "number") {
      const number = typeof value === "number" ? value : typeof value === "string" ? enhanceNumber(value) : null;
      return number !== null && Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? number : null;
    }
    if (kind === "datetime") return typeof value === "number" && Number.isFinite(value) ? enhanceDate(new Date(value)) : enhanceDate(value);
    return typeof value === "string" || typeof value === "boolean" ? value : value instanceof Date ? value.toISOString() :
      typeof value === "object" ? JSON.stringify(value) : String(value);
  }

  /**
   * Infers a kind from every value: all numbers, else all ISO dates, else text. Strings count as numbers only when asked
   * (table text). The values read on the way go into parsed, so a number or date column is not read twice.
   */
  function enhanceInfer(values, numericText, parsed) {
    let kind = null;
    for (let index = 0; index < values.length; index++) {
      const value = values[index];
      if (value === null || value === undefined || value === "") { parsed[index] = null; continue; }
      if (kind !== "datetime") {
        const number = typeof value === "number" ? Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : null : numericText ? enhanceNumber(value) : null;
        if (number !== null) { kind = "number"; parsed[index] = number; continue; }
      }
      const date = kind === "number" ? null : enhanceDate(value);
      if (date === null) return "text";
      kind = "datetime"; parsed[index] = date;
    }
    return kind || "text";
  }

  /** A sort value from an attribute or a render result: a number when it reads as one, else bounded text. */
  function enhanceSortKey(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (value === null || value === undefined) return null;
    const text = String(value), number = /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text.trim()) ? Number(text) : NaN;
    return Number.isFinite(number) ? number : text.slice(0, 4096);
  }

  /**
   * Builds one cell. text is the display (null lets the grid format the value), sort and search override what the value
   * gives, and defaultText fills an empty cell; read says raw is already the stored value. A plain string cell is kept when
   * nothing else is needed.
   */
  function enhanceCell(kind, raw, text, sort, search, defaultText, tone, read) {
    const value = read ? raw : enhanceValue(kind, raw);
    if (value === null && (text === null || text === "")) {
      if (defaultText !== undefined) text = defaultText;
      else if (sort == null && search == null && !tone) return null;
    }
    if (kind === "text" && typeof value === "string" && (text === null || text === value) && sort === undefined && search === undefined && !tone) return value;
    const cell = { value };
    if (text !== null && text !== undefined && (typeof value !== "string" || text !== value)) cell.text = String(text);
    if (sort !== undefined && sort !== null) cell.sort = enhanceSortKey(sort);
    // Search reads the value; a display the reader sees ("1,234 MB") is searchable too unless a search value replaces it.
    if (search !== undefined && search !== null) cell.searchText = String(search);
    else if (cell.text !== undefined && kind !== "text") cell.searchText = cell.text;
    if (tone) cell.tone = tone;
    return cell;
  }

  /** Reads a field of a record: an array index, an own property (dots included), or a dotted path. */
  function enhancePath(record, path) {
    if (record === null || typeof record !== "object" || path === null || path === undefined) return undefined;
    if (typeof path === "number" || Object.hasOwn(record, path)) return record[path];
    let value = record;
    for (const key of String(path).split(".")) { value = value !== null && typeof value === "object" ? value[key] : undefined; if (value === undefined) break; }
    return value;
  }

  /** A column identity: the given id, else one derived from the field, unique within the grid. */
  function enhanceColumnId(spec, index, used) {
    let id = spec.id !== undefined ? spec.id : typeof spec.data === "string" && spec.data ? spec.data : "c" + index;
    if (spec.id !== undefined && (!isIdentifier(id) || used.has(id))) throw new Error("CanopyX: column ids must be unique identifiers.");
    for (let suffix = 2; used.has(id); suffix++) id = (spec.data || "c" + index) + "-" + suffix;
    used.add(id); return id;
  }
