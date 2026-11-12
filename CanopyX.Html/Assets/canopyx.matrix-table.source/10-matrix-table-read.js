  // ---------- matrix table: a server-rendered <table> read into a matrix document (docs/matrix.md#a-table-from-the-server) ----------
  // The table is the page without script and for search engines: column headers, row headers and cells whose links are the
  // no-script path. data-matrix on the table carries document fields as JSON (states, attributes, groupBy, sort, ...); the
  // items, the cells and their notes come from the markup. A cell's state is its data-state, or one read from its data-tone,
  // data-symbol or leading symbol and named by its title; states found this way follow the declared ones, worst tone first.
  const MX_TABLE_GLYPHS = { "✓": "check", "✕": "cross", "!": "warning", "i": "info", "•": "dot", "–": "dash", "?": "question", "◷": "clock", "‖": "pause" };
  const MX_TABLE_SYMBOL_TONES = { check: "success", cross: "danger", warning: "warning", info: "info", clock: "warning" };
  const MX_TABLE_TONE_SYMBOLS = { success: "check", danger: "cross", warning: "warning", info: "info" };
  const mxTableRank = tone => { const at = ["danger", "warning", "info"].indexOf(tone); return at >= 0 ? at : tone === "success" ? 4 : tone === "muted" ? 5 : 3; };
  const mxTableFail = message => { throw new Error("CanopyX: the matrix table " + message + "."); };
  const mxTableText = element => (element.textContent || "").replace(/\s+/g, " ").trim();
  function mxTableJson(element, name) {
    const raw = element.getAttribute("data-" + name);
    if (raw === null) return undefined;
    try { return JSON.parse(raw); } catch { return mxTableFail("has data-" + name + " that is not JSON"); }
  }

  // The header cells by their place on the visual grid, rowspan and colspan included, as the browser lays them out.
  function mxTableLayout(rows) {
    const grid = rows.map(() => []), starts = new Map();
    rows.forEach((row, r) => {
      let p = 0;
      for (const cell of row.cells) {
        while (grid[r][p]) p++;
        const across = Math.max(1, cell.colSpan || 1), down = Math.max(1, Math.min(cell.rowSpan || rows.length, rows.length - r));
        for (let i = 0; i < down; i++) for (let j = 0; j < across; j++) grid[r + i][p + j] = cell;
        starts.set(cell, p); p += across;
      }
    });
    return { grid, starts };
  }

  // An axis item from a row (its header cell names it) or a column header: id, label, secondary text, link and attribute values.
  function mxTableItem(element, header, fallback) {
    const own = name => element.getAttribute("data-" + name) ?? header.getAttribute("data-" + name);
    const link = header.querySelector("a[href]"), href = own("href") ?? link?.getAttribute("href"), secondary = own("secondary");
    const values = mxTableJson(element, "values") ?? (element === header ? undefined : mxTableJson(header, "values"));
    const item = { id: element.getAttribute("data-id") || element.id || header.getAttribute("data-id") || fallback, label: own("label") || mxTableText(header) };
    if (secondary) item.secondary = secondary;
    if (href) item.href = href;
    if (values !== undefined) item.values = values;
    return item;
  }
  // A group heading or band names the group of the items under it that carry no value of the axis's groupBy attribute.
  function mxTableGroup(item, attribute, value) {
    if (!attribute || value == null) return;
    const values = item.values ||= {};
    if (values && typeof values === "object" && values[attribute] === undefined) values[attribute] = value;
  }

  // A cell's state id and its extras; null for a cell without data. New states join the map from the first cell that names them.
  function mxTableCell(cell, states) {
    const own = name => cell.getAttribute("data-" + name), tone = own("tone");
    let text = mxTableText(cell), symbol = own("symbol"), id = own("state");
    const glyph = MX_TABLE_GLYPHS[text[0]] && (text.length === 1 || text[1] === " ") ? text[0] : null;
    if (glyph) { text = text.slice(1).trim(); symbol ||= MX_TABLE_GLYPHS[glyph]; }
    if (!id && !tone && !symbol) return null;
    const stateTone = tone || MX_TABLE_SYMBOL_TONES[symbol] || null;
    symbol ||= MX_TABLE_TONE_SYMBOLS[stateTone] || "dot";
    id ||= (stateTone || "state") + "-" + symbol;
    let state = states.get(id);
    if (!state) {
      const attention = own("attention");
      state = { id, label: own("label") || cell.title || id, symbol, attention: attention !== null ? attention !== "false" : stateTone === "danger" || stateTone === "warning" };
      if (stateTone) state.tone = stateTone;
      states.set(id, state);
    }
    const value = own("value"), number = value === null ? null : Number(value), link = cell.querySelector("a[href]");
    if (value !== null && (!/\S/.test(value) || !Number.isFinite(number))) mxTableFail("has a data-value that is not a number");
    const note = { value: number, text: own("text"), title: own("title") ?? (cell.title && cell.title !== state.label ? cell.title : null),
      details: mxTableJson(cell, "details") ?? null, href: own("href") ?? link?.getAttribute("href") ?? null };
    // Without data-value or data-text, what the cell shows after its symbol is its text; a long one becomes its title.
    if (note.text === null && value === null && text) { if (text.length <= 64) note.text = text; else note.title ??= text; }
    return { id, note };
  }

  /** Reads a matrix table into a matrix document: data-matrix, then the markup, then the view option, then the details option. */
  function mxTableDocument(table, options) {
    const base = mxTableJson(table, "matrix") ?? {}, extra = options.view ?? {};
    if (!base || typeof base !== "object" || Array.isArray(base) || !extra || typeof extra !== "object") mxTableFail("takes document fields as an object");
    const doc = { ...base, ...extra, protocol: PROTOCOL, type: "matrix" }, square = doc.square === true;
    const axis = name => ({ ...(base[name] || {}), ...(extra[name] || {}) }), rowAxis = axis("rows"), columnAxis = axis("columns");
    const all = [...table.rows], head = table.tHead ? [...table.tHead.rows] : all.length && [...all[0].cells].every(cell => cell.tagName === "TH") ? [all[0]] : [];
    if (!head.length) mxTableFail("needs a header row");
    const { grid, starts } = mxTableLayout(head), last = grid[grid.length - 1];
    // The bottom header row names the columns (a header marked data-total is the totals column the matrix draws itself).
    const columns = [], positions = new Map();
    for (let p = 1; p < last.length; p++) {
      const cell = last[p];
      if (!cell || starts.get(cell) !== p || cell.hasAttribute("data-total")) continue;
      positions.set(p, columns.length);
      columns.push(mxTableItem(cell, cell, "c" + (columns.length + 1)));
    }
    // Header rows above it are bands: each names the group of the columns below it.
    const columnGroupBy = square ? null : columnAxis.groupBy;
    for (let r = 0; r < grid.length - 1; r++) for (const cell of new Set(grid[r])) {
      const start = starts.get(cell);
      if (!cell || !start || last[start] === cell) continue;
      const value = cell.getAttribute("data-group") ?? mxTableText(cell);
      for (let p = start; p < start + cell.colSpan; p++) if (positions.has(p)) mxTableGroup(columns[positions.get(p)], columnGroupBy, value);
    }
    const corner = last[0] ? mxTableText(last[0]) : "";
    if (rowAxis.title === undefined && corner) rowAxis.title = corner;
    // Body rows: group headings (scope="rowgroup" or data-group), note rows that span columns (a legend), and item rows.
    const items = [], marks = [];
    for (const section of table.tBodies) {
      let group = null;
      for (const row of section.rows) {
        const first = row.cells[0];
        if (!first || head.includes(row)) continue;
        if (first.getAttribute("scope") === "rowgroup" || row.hasAttribute("data-group")) { group = row.getAttribute("data-group") ?? first.getAttribute("data-group") ?? mxTableText(first); continue; }
        if (first.colSpan > 1) continue;
        const item = mxTableItem(row, first, "r" + (items.length + 1)), found = [];
        mxTableGroup(item, rowAxis.groupBy, group);
        let p = 0;
        for (const cell of row.cells) { if (positions.has(p)) found.push([positions.get(p), cell]); p += Math.max(1, cell.colSpan); }
        items.push(item); marks.push(found);
      }
    }
    // A square matrix's columns are its rows: a column header names its row by id, or by its place.
    const rowIds = new Map(items.map((item, index) => [item.id, index]));
    const place = square ? columns.map((column, index) => rowIds.get(column.id) ?? (index < items.length ? index : mxTableFail("has a column that names no row"))) : columns.map((_, index) => index);
    const width = square ? items.length : columns.length, states = new Map(), declared = Array.isArray(doc.states) ? doc.states : [];
    for (const state of declared) if (state && typeof state === "object") states.set(state.id, state);
    const ids = items.map(() => new Array(width).fill(null)), notes = [], self = square && doc.diagonal !== "data";
    marks.forEach((found, r) => {
      for (const [column, cell] of found) {
        const c = place[column], read = self && r === c ? null : mxTableCell(cell, states);
        if (!read) continue;
        ids[r][c] = read.id;
        const { value, text, title, details, href } = read.note, note = [r, c, value, text, title, details, href];
        while (note.length > 3 && note[note.length - 1] === null) note.pop();
        if (note.some((part, index) => index > 1 && part !== null)) notes.push(note);
      }
    });
    // Declared states keep their order; states read from the cells follow, worst tone first, then in the order they appeared.
    const found = [...states.values()].filter(state => !declared.includes(state)).sort((a, b) => mxTableRank(a.tone) - mxTableRank(b.tone));
    const list = [...declared, ...found], digit = new Map(list.map((state, index) => [state && state.id, "0123456789abcdefghijklmnopqrstuvwxyz"[index]]));
    if (list.length > 36) mxTableFail("names more than 36 states");
    Object.assign(doc, { id: doc.id ?? (table.id || "matrix"), label: doc.label ?? ((table.caption && mxTableText(table.caption)) || table.getAttribute("aria-label") || table.title || undefined),
      rows: { ...rowAxis, items }, states: list, cells: ids.map(line => line.map(id => id === null ? "." : digit.get(id)).join("")) });
    if (square) delete doc.columns; else doc.columns = { ...columnAxis, items: columns };
    if (notes.length) doc.notes = notes; else delete doc.notes;
    if (options.details !== undefined) doc.details = options.details;
    return doc;
  }
