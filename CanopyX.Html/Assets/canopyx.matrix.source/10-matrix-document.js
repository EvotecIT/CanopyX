  // ---------- matrix: the document (docs/data-protocol.md#matrix), read once and strictly ----------
  // Unknown properties, bad ids, cells that name no state and links with unsafe schemes fail the whole document, as CanopyMatrix
  // does in C#. Cells arrive as one string per row (a state digit per column, "." for no data) and become one byte per cell.
  const MATRIX_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz", MATRIX_NONE = 255, MATRIX_SELF = 254;
  const MATRIX_SYMBOLS = ["check", "cross", "warning", "info", "dot", "dash", "question", "clock", "pause"];
  const MATRIX_KEYS = ["protocol", "type", "id", "label", "rows", "columns", "square", "columnTitle", "diagonal", "states", "cells", "notes", "totals", "attentionOnly",
    "hideEmpty", "cellWidth", "density", "details", "phone", "legend", "autoHeight", "labels", "timeSlider"];
  const matrixObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  function matrixKeys(value, keys, what) {
    if (!matrixObject(value)) matrixFail(what + " must be an object");
    for (const key of Object.keys(value)) if (!keys.includes(key)) matrixFail(what + " has the unknown property '" + key + "'");
    return value;
  }
  function matrixText(value, what, max, optional) {
    if (value === undefined && optional) return null;
    if (typeof value !== "string" || !/\S/.test(value) || value.length > max) matrixFail(what + " must be visible text of at most " + max + " characters");
    return value;
  }
  function matrixId(value, what) {
    if (typeof value !== "string" || !value.length || value.length > 256 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) matrixFail(what + " must be a nonempty id of at most 256 characters");
    return value;
  }
  // Match the C# reader: an omitted zone means UTC, and ordering uses millisecond instants as grids do.
  function matrixMoment(value) {
    return typeof value === "string" ? Date.parse(value.includes("T") && !/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value + "Z" : value) : NaN;
  }
  /** An http, https or mailto address, or a relative one; never //host, control characters or backslashes. */
  function matrixHref(value) {
    if (typeof value !== "string" || !value.length || value.length > 2048 || value.startsWith("//") || /[\u0000- \u007f\\]/.test(value)) return false;
    const colon = value.indexOf(":"), boundary = value.search(/[/?#]/);
    return colon < 0 || boundary >= 0 && boundary < colon || /^(?:https?|mailto)$/i.test(value.slice(0, colon));
  }
  /** A count text: {count} in the text, or in every plural form ([one]…[other]…) of a complete list that ends with an other form. */
  function matrixPluralText(text) {
    if (!text.startsWith("[")) return text.includes("{count}");
    const forms = [...text.matchAll(/\[(zero|one|two|few|many|other)\]([^[]*)/g)];
    return forms.reduce((sum, form) => sum + form[0].length, 0) === text.length && forms.some(form => form[1] === "other") && forms.every(form => form[2].includes("{count}"));
  }
  function matrixAxis(input, what) {
    const axis = matrixKeys(input, ["title", "noun", "groupCount", "attributes", "items", "groupBy", "sort"], what);
    const attributes = [], byId = new Map();
    if (axis.attributes !== undefined && (!Array.isArray(axis.attributes) || axis.attributes.length > 32)) matrixFail(what + " has at most 32 attributes");
    for (const entry of axis.attributes || []) {
      const attribute = matrixKeys(entry, ["id", "title", "kind", "facet"], what + " attribute");
      const id = matrixId(attribute.id, "an attribute id");
      if (id[0] === "#" || byId.has(id)) matrixFail("the attribute '" + id + "' must be unique and not start with #");
      const kind = attribute.kind === undefined ? "text" : attribute.kind;
      if (!["text", "number", "datetime"].includes(kind) || attribute.facet !== undefined && typeof attribute.facet !== "boolean") matrixFail("the attribute '" + id + "' has an unknown kind or facet");
      const item = Object.freeze({ id, title: matrixText(attribute.title, "the title of attribute '" + id + "'", 200), kind, facet: attribute.facet === true });
      attributes.push(item); byId.set(id, item);
    }
    if (!Array.isArray(axis.items) || !axis.items.length || axis.items.length > 10000) matrixFail(what + " needs 1 to 10000 items");
    const ids = new Map(), items = axis.items.map((entry, index) => {
      const item = matrixKeys(entry, ["id", "label", "secondary", "href", "values"], what + " item");
      const id = matrixId(item.id, "an item id");
      if (ids.has(id)) matrixFail("the item '" + id + "' appears twice on " + what);
      if (item.href !== undefined && !matrixHref(item.href)) matrixFail("the link of '" + id + "' is not an http, https, mailto or relative address");
      const values = Object.create(null);
      if (item.values !== undefined) {
        if (!matrixObject(item.values)) matrixFail("the values of '" + id + "' must be an object");
        for (const [key, raw] of Object.entries(item.values)) {
          const attribute = byId.get(key);
          if (!attribute) matrixFail("'" + id + "' has a value for the undeclared attribute '" + key + "'");
          const cell = matrixObject(raw) ? matrixKeys(raw, ["value", "text"], "a value") : { value: raw };
          const value = cell.value ?? null;
          const fits = value === null || (attribute.kind === "number" ? typeof value === "number" && Number.isFinite(value) : attribute.kind === "datetime" ?
            typeof value === "string" && /^\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d(?:\.\d{1,7})?)?(?:Z|[+-]\d\d:\d\d)?)?$/.test(value) && Number.isFinite(matrixMoment(value)) : typeof value === "string" || typeof value === "boolean");
          if (!fits || cell.text !== undefined && typeof cell.text !== "string") matrixFail("the value of '" + key + "' of '" + id + "' does not fit its kind");
          values[key] = { value, text: cell.text ?? null };
        }
      }
      const result = Object.freeze({ id, index, label: matrixText(item.label, "the label of '" + id + "'", 200), secondary: matrixText(item.secondary, "the secondary text of '" + id + "'", 200, true),
        href: item.href ?? null, values: Object.freeze(values) });
      ids.set(id, result);
      return result;
    });
    if (axis.groupBy !== undefined && !byId.has(axis.groupBy)) matrixFail(what + " groups by an undeclared attribute");
    let sort = null;
    if (axis.sort !== undefined) {
      const value = matrixKeys(axis.sort, ["by", "direction"], what + " sort");
      if (!["#label", "#total"].includes(value.by) && !byId.has(value.by) || ![undefined, "asc", "desc"].includes(value.direction)) matrixFail(what + " sorts by an unknown key");
      sort = { by: value.by, direction: value.direction || "asc" };
    }
    if (axis.noun !== undefined) matrixText(axis.noun, what + " noun", 64);
    const groupCount = matrixText(axis.groupCount, what + " group count", 200, true);
    if (groupCount !== null && !matrixPluralText(groupCount)) matrixFail(what + " group count needs {count} in every form, and plural forms that end with [other]");
    return Object.freeze({ title: matrixText(axis.title, what + " title", 200, true), noun: axis.noun ?? null, groupCount, attributes: Object.freeze(attributes), attributeById: byId,
      items: Object.freeze(items), byId: ids, groupBy: axis.groupBy ?? null, sort });
  }

  /** Reads a matrix document into the model the view draws: axes, states, a byte per cell and the sparse notes. */
  function matrixDocument(input) {
    const doc = matrixKeys(input, MATRIX_KEYS, "the document");
    if (doc.protocol !== PROTOCOL || doc.type !== "matrix") matrixFail("it needs protocol " + PROTOCOL + " and type \"matrix\"");
    const id = matrixId(doc.id, "the matrix id"), label = matrixText(doc.label, "the label", 200);
    if (doc.square !== undefined && typeof doc.square !== "boolean") matrixFail("square must be true or false");
    const square = doc.square === true, rows = matrixAxis(doc.rows, "rows");
    if (square && doc.columns !== undefined || !square && (doc.columns === undefined || doc.columnTitle !== undefined)) matrixFail("a matrix has columns, or is square and has none (and may have a columnTitle)");
    const columns = square ? rows : matrixAxis(doc.columns, "columns");
    if (![undefined, "self", "data"].includes(doc.diagonal) || doc.diagonal !== undefined && !square) matrixFail("only a square matrix has a diagonal, self or data");
    if (rows.items.length * columns.items.length > 1000000) matrixFail("a matrix holds at most 1000000 cells");
    if (!Array.isArray(doc.states) || !doc.states.length || doc.states.length > 36) matrixFail("it needs 1 to 36 states");
    const stateIds = new Set(), states = doc.states.map((entry, index) => {
      const state = matrixKeys(entry, ["id", "label", "tone", "symbol", "attention"], "a state");
      if (typeof state.id !== "string" || !/^[A-Za-z][\w-]{0,63}$/.test(state.id) || stateIds.has(state.id)) matrixFail("states need unique ids");
      stateIds.add(state.id);
      if (state.tone !== undefined && (typeof state.tone !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(state.tone) || /-bg$/.test(state.tone))) matrixFail("the state '" + state.id + "' has an invalid tone");
      // Every state has a symbol, so no state is told apart by colour alone.
      if (!MATRIX_SYMBOLS.includes(state.symbol) || state.attention !== undefined && typeof state.attention !== "boolean") matrixFail("the state '" + state.id + "' needs one of the symbols");
      return Object.freeze({ id: state.id, index, label: matrixText(state.label, "the label of state '" + state.id + "'", 200), tone: state.tone || null, symbol: state.symbol, attention: state.attention === true });
    });
    const R = rows.items.length, C = columns.items.length, grid = new Uint8Array(R * C).fill(MATRIX_NONE);
    if (!Array.isArray(doc.cells) || doc.cells.length !== R) matrixFail("cells needs one string per row");
    doc.cells.forEach((line, r) => {
      if (typeof line !== "string" || line.length !== C) matrixFail("each cells string needs one character per column");
      for (let c = 0; c < C; c++) {
        const ch = line.charCodeAt(c);
        if (ch === 46) continue;
        const index = MATRIX_DIGITS.indexOf(line[c]);
        if (index < 0 || index >= states.length) matrixFail("cells name an undeclared state");
        grid[r * C + c] = index;
      }
    });
    const diagonal = doc.diagonal || "self";
    if (square && diagonal === "self") for (let r = 0; r < R; r++) grid[r * C + r] = MATRIX_SELF;
    const notes = new Map();
    if (doc.notes !== undefined && !Array.isArray(doc.notes)) matrixFail("notes must be a list");
    for (const note of doc.notes || []) {
      if (!Array.isArray(note) || note.length < 3 || note.length > 6 || !Number.isInteger(note[0]) || !Number.isInteger(note[1]) || note[0] < 0 || note[1] < 0 || note[0] >= R || note[1] >= C) matrixFail("a note names no cell");
      const at = note[0] * C + note[1];
      if (grid[at] >= MATRIX_SELF || notes.has(at)) matrixFail("a note names a cell without a state, or twice");
      const [, , value = null, text = null, title = null, details = null] = note;
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) matrixFail("a note value must be a finite number");
      if (text !== null) matrixText(text, "a note text", 64);
      if (title !== null) matrixText(title, "a note title", 1000);
      if (details !== null && (!Array.isArray(details) || details.length > 16 || details.some(pair => !Array.isArray(pair) || pair.length !== 2 ||
        typeof pair[0] !== "string" || !/\S/.test(pair[0]) || pair[0].length > 200 || typeof pair[1] !== "string" || pair[1].length > 1000))) matrixFail("note details are up to 16 label and value pairs");
      notes.set(at, Object.freeze({ value, text, title, details: details ? Object.freeze(details.map(pair => Object.freeze([...pair]))) : null }));
    }
    const totals = doc.totals === undefined ? {} : matrixKeys(doc.totals, ["states", "rows", "columns"], "totals");
    if (totals.states !== undefined && (!Array.isArray(totals.states) || totals.states.some(state => !stateIds.has(state)))) matrixFail("totals count undeclared states");
    if ([totals.rows, totals.columns, doc.attentionOnly, doc.hideEmpty, doc.legend, doc.autoHeight].some(value => value !== undefined && typeof value !== "boolean")) matrixFail("totals, attentionOnly, hideEmpty, legend and autoHeight take true or false");
    if (doc.cellWidth !== undefined && (!Number.isInteger(doc.cellWidth) || doc.cellWidth < 24 || doc.cellWidth > 120)) matrixFail("cellWidth is 24 to 120 pixels");
    if (![undefined, "compact", "normal", "comfortable"].includes(doc.density) || ![undefined, "dialog", "host"].includes(doc.details) || ![undefined, "scroll", "cards"].includes(doc.phone)) matrixFail("density, details or phone has an unknown value");
    const counted = totals.states ? states.filter(state => totals.states.includes(state.id)) : states.filter(state => state.attention);
    return Object.freeze({ id, label, square, diagonal, rows, columns, columnTitle: square ? matrixText(doc.columnTitle, "the column title", 200, true) || rows.title : columns.title, states: Object.freeze(states), stateById: new Map(states.map(state => [state.id, state])),
      grid, notes, total: new Uint8Array(states.map(state => counted.includes(state) ? 1 : 0)), attention: new Uint8Array(states.map(state => state.attention ? 1 : 0)),
      rowTotals: totals.rows !== false, columnTotals: totals.columns !== false, attentionOnly: doc.attentionOnly === true, hideEmpty: doc.hideEmpty === true, sparse: grid.includes(MATRIX_NONE), cellWidth: doc.cellWidth || 32,
      density: doc.density || "normal", details: doc.details || "dialog", phone: doc.phone || "scroll", legend: doc.legend !== false, autoHeight: doc.autoHeight !== false, labels: doc.labels });
  }
