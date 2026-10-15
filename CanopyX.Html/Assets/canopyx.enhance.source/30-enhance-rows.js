  // ---------- columns and rows from a table or from records ----------
  // Column options are CanopyX column fields plus data (a field name, dotted path or array index), type (text, number,
  // datetime, date or auto), render, searchable, visible and defaultContent; every other field goes to the grid column.
  const ENHANCE_OWN_COLUMN_FIELDS = ["data", "type", "render", "searchable", "visible", "defaultContent", "id"];
  const ENHANCE_TONE = /^[a-z][a-z0-9-]{0,31}$/;

  function enhanceColumns(specs, sortable) {
    if (!Array.isArray(specs) || !specs.length) throw new Error("CanopyX: a grid needs columns, or records to read them from.");
    const used = new Set();
    return specs.map((spec, index) => {
      if (spec === null || typeof spec !== "object" || Array.isArray(spec)) throw new Error("CanopyX: each column option is an object.");
      const type = spec.type === undefined ? spec.kind : spec.type;
      if (type !== undefined && type !== "auto" && !ENHANCE_KINDS[type]) throw new Error("CanopyX: column type is text, number, datetime, date or auto.");
      if (spec.render !== undefined && typeof spec.render !== "function" && (spec.render === null || typeof spec.render !== "object"))
        throw new Error("CanopyX: a column render is a function or an object of functions and field paths by type.");
      const grid = {};
      for (const key of Object.keys(spec)) if (!ENHANCE_OWN_COLUMN_FIELDS.includes(key)) grid[key] = spec[key];
      grid.id = enhanceColumnId(spec, index, used);
      grid.title = String(spec.title ?? (typeof spec.data === "string" ? spec.data : index + 1));
      grid.sortable = spec.sortable === undefined ? sortable : !!spec.sortable;
      if (spec.visible === false && spec.hidden === undefined) grid.hidden = true;
      return { grid, index, data: spec.data === undefined ? index : spec.data, kind: type === undefined || type === "auto" ? null : ENHANCE_KINDS[type],
        render: spec.render, searchable: spec.searchable !== false, defaultContent: spec.defaultContent === undefined ? undefined : String(spec.defaultContent) };
    });
  }

  /** Columns read from the first record: its own keys, or its positions for arrays. */
  function enhanceRecordSpecs(records) {
    const first = records && records.find(record => record !== null && typeof record === "object");
    if (!first) throw new Error("CanopyX: a grid needs columns, or records to read them from.");
    return Array.isArray(first) ? first.map((_, index) => ({ data: index })) : Object.keys(first).map(key => ({ data: key, title: key }));
  }

  /** Calls a column's render for one purpose (display, sort, filter or type); an object render names a function or a field path per purpose. */
  function enhanceRender(column, raw, type, record, index) {
    const render = column.render, meta = { row: index, column: column.index, id: column.grid.id };
    const spec = typeof render === "function" ? render : Object.hasOwn(render, type) ? render[type] : render._;
    return typeof spec === "function" ? spec(raw, type, record, meta) : spec === undefined ? raw : enhancePath(record, spec);
  }

  /** What a column holds for one record before the kind applies: the type result of its render, or the raw field. */
  function enhanceTyped(column, record, index) {
    const raw = enhancePath(record, column.data);
    return column.render ? enhanceRender(column, raw, "type", record, index) : raw;
  }

  function enhanceDisplay(value) {
    return value === null || value === undefined ? null : typeof Node !== "undefined" && value instanceof Node ? enhanceText(value) : String(value);
  }

  /** One cell of a record: display, sort and search values come from render when a column has one. */
  function enhanceRecordCell(column, record, index) {
    const raw = enhancePath(record, column.data);
    if (!column.render) return enhanceCell(column.kind, raw, null, undefined, undefined, column.defaultContent);
    const typed = enhanceRender(column, raw, "type", record, index), display = enhanceDisplay(enhanceRender(column, raw, "display", record, index));
    const sort = enhanceRender(column, raw, "sort", record, index), filter = enhanceRender(column, raw, "filter", record, index);
    return enhanceCell(column.kind, typed, display, sort === typed ? undefined : sort, filter === undefined || filter === null ? undefined : String(filter), column.defaultContent);
  }

  /** A row identity: given ids must be unique identifiers; missing ones are generated from the position. */
  function enhanceRowId(value, index, ids) {
    if (value !== undefined && value !== null && value !== "") {
      const id = String(value);
      if (!isIdentifier(id) || ids.has(id)) throw new Error("CanopyX: row ids must be unique identifiers; " + id + " is not.");
      ids.add(id); return id;
    }
    let id = "r" + (index + 1);
    while (ids.has(id)) id += "~";
    ids.add(id); return id;
  }

  /** Infers the kinds of columns that did not declare one, from every value they hold; parsed keeps the values read. */
  function enhanceKinds(columns, count, valueAt, numericText) {
    columns.forEach(column => {
      column.parsed = null;
      if (column.kind) return;
      const values = new Array(count), parsed = new Array(count);
      for (let index = 0; index < count; index++) values[index] = valueAt(column, index);
      column.kind = enhanceInfer(values, numericText, parsed);
      if (column.kind !== "text") column.parsed = parsed;
    });
    columns.forEach(column => { column.grid.kind = column.kind; });
  }

  /** Rows from records (arrays or objects). Returns the rows and each row's record by id. */
  function enhanceRecordRows(records, columns, rowId, start = 0, ids = new Set()) {
    if (!Array.isArray(records)) throw new Error("CanopyX: data is an array of records.");
    enhanceKinds(columns, records.length, (column, index) => enhanceTyped(column, records[index], start + index), false);
    const rows = new Array(records.length), byId = new Map();
    records.forEach((record, index) => {
      if (record === null || typeof record !== "object") throw new Error("CanopyX: each record is an array or an object.");
      const cells = {};
      for (const column of columns) { const cell = enhanceRecordCell(column, record, start + index); if (cell !== null) cells[column.grid.id] = cell; }
      const id = enhanceRowId(rowId === undefined ? undefined : typeof rowId === "function" ? rowId(record, start + index) : enhancePath(record, rowId), start + index, ids);
      rows[index] = { id, cells }; byId.set(id, record);
    });
    columns.forEach(column => { column.parsed = null; });
    return { rows, records: byId };
  }

  /** Rows from a read table. Cells keep the text as written; attributes give sort and search values; markup is kept for display. */
  function enhanceTableRows(read, columns, keepMarkup) {
    const textOf = value => value === undefined ? "" : typeof value === "string" ? value : value.text;
    const texts = row => row.texts ||= row.values.map(textOf);
    enhanceKinds(columns, read.rows.length, (column, index) => column.render ? enhanceTyped(column, texts(read.rows[index]), index) : textOf(read.rows[index].values[column.data]), true);
    const ids = new Set(), rows = new Array(read.rows.length), markup = new Map();
    read.rows.forEach((row, index) => {
      const element = row.element, cells = {};
      for (const column of columns) {
        const value = row.values[column.data], id = column.grid.id;
        let cell;
        if (column.render) cell = enhanceRecordCell(column, texts(row), index);
        else if (value === undefined) continue;
        else if (typeof value === "string") cell = column.parsed ? enhanceCell(column.kind, column.parsed[index], value, undefined, undefined, column.defaultContent, undefined, true) :
          enhanceCell(column.kind, value, value, undefined, undefined, column.defaultContent);
        else {
          const tone = value.tone && ENHANCE_TONE.test(value.tone) && !value.tone.endsWith("-bg") ? value.tone : undefined;
          cell = column.parsed ? enhanceCell(column.kind, column.parsed[index], value.text, value.order, value.search, column.defaultContent, tone, true) :
            enhanceCell(column.kind, value.text, value.text, value.order, value.search, column.defaultContent, tone);
          if (keepMarkup && value.markup) (markup.get(index) || markup.set(index, new Map()).get(index)).set(id, value.markup);
        }
        if (cell !== null) cells[id] = cell;
      }
      const attribute = name => element.hasAttributes() ? element.getAttribute(name) : null;
      const record = { id: enhanceRowId(attribute("id") || attribute("data-id"), index, ids), cells }, tone = attribute("data-tone"), className = element.className;
      if (tone && ENHANCE_TONE.test(tone) && !tone.endsWith("-bg")) record.tone = tone;
      if (className && className.trim() && className.length <= 1024 && !/[\u0000-\u001f\u007f-\u009f]/.test(className)) record.className = className;
      rows[index] = record;
    });
    columns.forEach(column => { column.parsed = null; });
    // Markup is looked up by row id, which the grid hands its renderers; a row's record is its cell texts, read when asked for.
    const byId = new Map(), positions = new Map(rows.map((row, index) => [row.id, index]));
    markup.forEach((cells, index) => byId.set(rows[index].id, cells));
    return { rows, markup: byId, records: new Map(), tableRecord: id => positions.has(id) ? texts(read.rows[positions.get(id)]).slice() : undefined };
  }
