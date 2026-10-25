const VIEW_INTENT_LABELS = {"viewIntentPreview": "Preview view changes", "viewIntentApplied": "View changes applied.", "viewIntentSuperseded": "The view changed. Preview the proposal again.", "viewIntentSearch": "Search: {search}", "viewIntentSort": "Sort: {columns}", "viewIntentGroup": "Group by: {columns}", "viewIntentColumns": "Columns: {columns}", "viewIntentWords": "Whole words", "viewIntentSubstring": "Text contains"};
  // A view intent is data, never source text or an authorization grant. Snapshot before validation or preview.
  const VIEW_INTENT_MAX = 65536;
  function viewIntentSnapshot(input) {
    let nodes = 0, text = 0;
    const visit = (value, depth) => {
      if (++nodes > VIEW_INTENT_MAX || depth > 32) throw new Error("CanopyX: view intent exceeds its input bounds.");
      if (value === null || typeof value === "boolean") return value;
      if (typeof value === "string") { if ((text += value.length) > VIEW_INTENT_MAX) throw new Error("CanopyX: view intent is too large."); return value; }
      if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) return value;
      if (!value || typeof value !== "object" || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(value)))
        throw new Error("CanopyX: view intents contain JSON data only.");
      const array = Array.isArray(value), descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
      if (keys.some(key => typeof key !== "string" || key !== "length" && !Object.hasOwn(descriptors[key], "value")))
        throw new Error("CanopyX: view intents cannot contain accessors or symbols.");
      if (array) {
        if (value.length > VIEW_INTENT_MAX || keys.length !== value.length + 1 || keys.some(key => key !== "length" && !/^(0|[1-9]\d*)$/.test(key)))
          throw new Error("CanopyX: view intent arrays must be bounded JSON arrays.");
        return Array.from({ length: value.length }, (_, index) => visit(descriptors[index].value, depth + 1));
      }
      const copy = Object.create(null);
      for (const key of keys) { text += key.length; copy[key] = visit(descriptors[key].value, depth + 1); }
      return copy;
    };
    const copy = visit(input, 0), json = JSON.stringify(copy);
    if (json.length > VIEW_INTENT_MAX) throw new Error("CanopyX: view intent holds at most 65,536 characters.");
    return JSON.parse(json);
  }
  function viewIntentObject(value, names, what) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !names.includes(key)))
      throw new Error("CanopyX: invalid " + what + ".");
    return value;
  }
  function viewIntentArray(value, maximum, what) {
    if (!Array.isArray(value) || value.length > maximum) throw new Error("CanopyX: invalid " + what + ".");
    return value;
  }
  // Strictness is checked before gridQuery or saved-state migration can drop unknown columns or normalize fields.
  function viewIntentQuery(grid, patch) {
    viewIntentObject(patch, ["search", "searchMode", "sort", "filters", "filterGroup", "groupBy"], "view intent query");
    if (patch.search !== undefined && (typeof patch.search !== "string" || patch.search.length > 16384)) throw new Error("CanopyX: invalid intent search.");
    if (patch.searchMode !== undefined && !["substring", "words"].includes(patch.searchMode)) throw new Error("CanopyX: invalid intent search mode.");
    if (patch.sort !== undefined) viewIntentArray(patch.sort, 64, "intent sorts").forEach(sort => viewIntentObject(sort, ["column", "direction"], "intent sort"));
    let predicates = 0, groups = 0;
    const filter = item => {
      if (++predicates > 64) throw new Error("CanopyX: at most 64 intent predicates.");
      viewIntentObject(item, ["column", "operator", "values"], "intent predicate");
      viewIntentArray(item.values, 1000, "intent operands").forEach(value => {
        if (typeof value === "string" && value.length > 16384) throw new Error("CanopyX: intent operand is too long.");
        const column = grid.view.columns.find(column => column.id === item.column);
        if (column?.kind === "datetime") {
          const match = typeof value === "string" && /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,7}))?Z$/.exec(value);
          if (!match || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== match[1] || match[1].startsWith("0000"))
            throw new Error("CanopyX: intent date operands need valid UTC timestamps.");
        }
      });
    };
    const group = (item, depth) => {
      if (depth > 8 || ++groups > 64) throw new Error("CanopyX: intent groups exceed grid limits.");
      viewIntentObject(item, ["operator", "filters", "groups"], "intent group");
      viewIntentArray(item.filters, 64, "intent group filters").forEach(filter);
      viewIntentArray(item.groups, 64, "intent groups").forEach(child => group(child, depth + 1));
    };
    if (patch.filters !== undefined) viewIntentArray(patch.filters, 64, "intent filters").forEach(filter);
    if (patch.filterGroup !== undefined && patch.filterGroup !== null) group(patch.filterGroup, 1);
    if (patch.groupBy !== undefined) viewIntentArray(patch.groupBy, 4, "intent grouping levels").forEach(level =>
      viewIntentObject(level, ["column", "direction", "aggregate"], "intent grouping level"));
    // Suppress null only for the explicitly nullable clear operation; do not relax any other query fields.
    gridQuery(grid.view, { ...patch, filterGroup: patch.filterGroup === null ? undefined : patch.filterGroup }, true);
  }
  function readViewIntent(grid, input) {
    grid.labels = Object.freeze({ ...VIEW_INTENT_LABELS, ...grid.labels });
    if (grid.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
    if (grid.view.viewIntents !== true) throw new Error("CanopyX: this grid has not enabled view intents.");
    const intent = viewIntentSnapshot(input);
    viewIntentObject(intent, ["protocol", "type", "version", "view", "query", "columns"], "view intent");
    if (intent.protocol !== "canopyx/2" || intent.type !== "viewIntent" || intent.version !== 1 || intent.view !== grid.view.id)
      throw new Error("CanopyX: invalid view intent identity or version.");
    if (intent.query !== undefined) viewIntentQuery(grid, intent.query);
    if (intent.columns !== undefined) {
      const columns = viewIntentArray(intent.columns, 256, "intent visible columns");
      if (!columns.length || new Set(columns).size !== columns.length || columns.some(id => typeof id !== "string" || !grid.columns.some(column => column.id === id)))
        throw new Error("CanopyX: intent visible columns must be unique declared columns and keep one visible.");
    }
    if ((!intent.query || !Object.keys(intent.query).length) && intent.columns === undefined) throw new Error("CanopyX: empty view intent.");
    return gridFreeze(intent);
  }
