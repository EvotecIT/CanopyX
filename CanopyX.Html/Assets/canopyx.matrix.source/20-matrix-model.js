  // ---------- matrix: what the reader sees, derived from the document and the query ----------
  // Each axis is filtered (search, facet values, only problems or hide empty), totalled over the other axis's visible items, sorted and
  // grouped. An expanded row group is a heading row and its members; a collapsed group is one rolled-up row or column whose
  // cells show the worst state of their members and how many need attention. Self cells of a square matrix count nowhere.
  const MATRIX_AXES = ["rows", "columns"];
  function matrixNatural(a, b) {
    const x = foldText(a), y = foldText(b), digits = /(\d+)|(\D+)/g;
    const left = x.match(digits) || [], right = y.match(digits) || [];
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const p = left[i], q = right[i], numeric = /^\d/.test(p) && /^\d/.test(q);
      if (numeric) { const s = p.replace(/^0+/, ""), t = q.replace(/^0+/, ""); if (s.length !== t.length) return s.length - t.length; if (s !== t) return s < t ? -1 : 1; }
      else if (p !== q) return p < q ? -1 : 1;
    }
    return left.length - right.length || (a < b ? -1 : a > b ? 1 : 0);
  }
  /** The key a value filters and groups by, and the text it shows. */
  function matrixValueKey(value) { return value == null || value.value == null ? "" : String(value.value); }
  function matrixValueText(value, attribute, format) {
    if (!value || value.value == null) return value && value.text ? value.text : "";
    if (value.text) return value.text;
    if (attribute.kind === "number") return format.format(value.value);
    if (attribute.kind === "datetime") return String(value.value).slice(0, 16).replace("T", " ");
    return String(value.value);
  }

  class MatrixModel {
    constructor(doc, format) { this.doc = doc; this.format = format; this.cache = new Map(); }
    /** The query a new matrix starts from: the document's sorts, groups and only-problems switch. */
    initialQuery() {
      const doc = this.doc, axis = name => doc[name];
      return { search: "", attentionOnly: doc.attentionOnly, hideEmpty: doc.hideEmpty, filters: { rows: {}, columns: {} },
        sort: { rows: axis("rows").sort, columns: axis("columns").sort }, group: { rows: axis("rows").groupBy, columns: axis("columns").groupBy },
        collapsed: { rows: [], columns: [] } };
    }
    itemText(item, axis) {
      return [item.label, item.secondary || "", ...axis.attributes.map(attribute => matrixValueText(item.values[attribute.id], attribute, this.format))].join(" ");
    }
    candidates(axis, filters, search) {
      const entries = Object.entries(filters || {}).filter(([, values]) => values && values.length);
      const passes = item => entries.every(([id, values]) => values.includes(matrixValueKey(item.values[id])));
      const found = axis.items.filter(passes);
      if (!search) return { items: found, searched: false };
      const term = foldText(search), hits = found.filter(item => foldText(this.itemText(item, axis)).includes(term));
      return { items: hits, searched: true, hits: hits.length };
    }
    derive(query) {
      const doc = this.doc, C = doc.columns.items.length, grid = doc.grid;
      this.cache.clear(); this.query = query;
      const search = query.search.trim();
      let rows = this.candidates(doc.rows, query.filters.rows, search), columns = this.candidates(doc.columns, query.filters.columns, doc.square ? "" : search);
      // Search filters each axis it matches; in a square matrix it finds rows, and the columns stay whole.
      if (!doc.square && search) {
        if (!rows.hits && columns.hits) rows = this.candidates(doc.rows, query.filters.rows, "");
        else if (rows.hits && !columns.hits) columns = this.candidates(doc.columns, query.filters.columns, "");
      }
      let rowItems = rows.items, columnItems = columns.items;
      // Only problems keeps the rows and columns with a cell that needs attention; hide empty those with any cell that has data.
      // Each axis is judged against the other's visible items, so a search or facet on one axis keeps the partners on the other.
      if (query.attentionOnly || query.hideEmpty) {
        const attention = doc.attention, only = query.attentionOnly, keepRow = new Uint8Array(doc.rows.items.length), keepColumn = new Uint8Array(C);
        for (const row of rowItems) for (const column of columnItems) {
          const state = grid[row.index * C + column.index];
          if (state < MATRIX_SELF && (!only || attention[state])) { keepRow[row.index] = 1; keepColumn[column.index] = 1; }
        }
        rowItems = rowItems.filter(item => keepRow[item.index]); columnItems = columnItems.filter(item => keepColumn[item.index]);
      }
      const rowTotal = new Float64Array(doc.rows.items.length), columnTotal = new Float64Array(C), counts = new Float64Array(doc.states.length + 1), counted = doc.total;
      for (const row of rowItems) for (const column of columnItems) {
        const state = grid[row.index * C + column.index];
        if (state === MATRIX_SELF) continue;
        if (state === MATRIX_NONE) { counts[doc.states.length]++; continue; }
        counts[state]++;
        if (counted[state]) { rowTotal[row.index]++; columnTotal[column.index]++; }
      }
      this.rowTotal = rowTotal; this.columnTotal = columnTotal; this.counts = counts;
      this.visible = { rows: rowItems.length, columns: columnItems.length };
      this.rows = this.arrange("rows", rowItems, rowTotal, query);
      this.columns = this.arrange("columns", columnItems, columnTotal, query);
      let grand = 0;
      for (const row of rowItems) grand += rowTotal[row.index];
      this.grandTotal = grand;
      return this;
    }
    compare(axis, sort, totals) {
      if (!sort) return (a, b) => a.index - b.index;
      const sign = sort.direction === "desc" ? -1 : 1;
      if (sort.by === "#label") return (a, b) => sign * matrixNatural(a.label, b.label) || a.index - b.index;
      if (sort.by === "#total") return (a, b) => sign * (totals[a.index] - totals[b.index]) || matrixNatural(a.label, b.label) || a.index - b.index;
      const attribute = axis.attributeById.get(sort.by);
      return (a, b) => {
        const x = a.values[attribute.id]?.value ?? null, y = b.values[attribute.id]?.value ?? null;
        if (x === null || y === null) return x === y ? a.index - b.index : x === null ? 1 : -1;
        const result = attribute.kind === "number" ? x - y : attribute.kind === "datetime" ? matrixMoment(x) - matrixMoment(y) : matrixNatural(String(x), String(y));
        return sign * result || a.index - b.index;
      };
    }
    arrange(name, items, totals, query) {
      const axis = this.doc[name], compare = this.compare(axis, query.sort[name], totals), sorted = items.slice().sort(compare);
      const entries = [], group = query.group[name];
      if (!group) { for (const item of sorted) entries.push({ kind: "item", key: "i" + item.index, item, label: item.label, members: [item], total: totals[item.index] }); return entries; }
      const attribute = axis.attributeById.get(group), groups = new Map();
      for (const item of sorted) {
        const key = matrixValueKey(item.values[group]);
        if (!groups.has(key)) groups.set(key, { key, label: matrixValueText(item.values[group], attribute, this.format) || "—", members: [], total: 0 });
        const entry = groups.get(key); entry.members.push(item); entry.total += totals[item.index];
      }
      const sort = query.sort[name], sign = sort && sort.direction === "desc" ? -1 : 1;
      const ordered = [...groups.values()].sort((a, b) => sort && sort.by === "#total" ? sign * (a.total - b.total) || matrixNatural(a.label, b.label) : sign * matrixNatural(a.label, b.label));
      const collapsed = new Set(query.collapsed[name]);
      for (const entry of ordered) {
        const closed = collapsed.has(entry.key), base = { group: entry, key: "g" + entry.key, label: entry.label, members: entry.members, total: entry.total };
        if (closed) entries.push(Object.assign({ kind: "rollup" }, base));
        else {
          if (name === "rows") entries.push(Object.assign({ kind: "heading" }, base));
          for (const item of entry.members) entries.push({ kind: "item", key: "i" + item.index, item, label: item.label, members: [item], total: totals[item.index], band: entry });
        }
      }
      return entries;
    }
    /** A cell of two entries: its state index (MATRIX_NONE, MATRIX_SELF), how many members need attention, and its note. */
    cell(row, column) {
      const doc = this.doc, C = doc.columns.items.length;
      if (row.kind === "item" && column.kind === "item") {
        const at = row.item.index * C + column.item.index, state = doc.grid[at];
        return { state, attention: state < MATRIX_SELF && doc.attention[state] ? 1 : 0, note: doc.notes.get(at) || null, members: 1 };
      }
      const key = row.key + "\u0000" + column.key, cached = this.cache.get(key);
      if (cached) return cached;
      let worst = MATRIX_NONE, attention = 0, members = 0;
      for (const r of row.members) for (const c of column.members) {
        const state = doc.grid[r.index * C + c.index];
        if (state >= MATRIX_SELF) continue;
        members++;
        if (state < worst) worst = state;
        if (doc.attention[state]) attention++;
      }
      const result = { state: worst, attention, note: null, members, rolled: true };
      if (this.cache.size > 20000) this.cache.clear();
      this.cache.set(key, result);
      return result;
    }
  }
