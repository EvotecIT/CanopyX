  // ---------- flat-grid wire boundaries ----------
  function gridQueryStart(query, patch) { return { ...query, ...patch, offset: 0, cursor: undefined, revision: undefined }; }

  function gridScalar(cell, column) {
    const value = cellValue(cell);
    if (value == null) return null;
    if (column.kind === "number") {
      if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
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

  function validateGridRows(rows, columns) {
    if (!Array.isArray(rows)) throw new Error("CanopyX: grid rows must be an array.");
    const ids = new Set(), declared = new Map(columns.map(column => [column.id, column]));
    for (const row of rows) {
      requireIdentifier(row && row.id, "grid row ID");
      if (ids.has(row.id)) throw new Error("CanopyX: duplicate grid row ID " + row.id);
      ids.add(row.id);
      if (Object.keys(row).some(name => !["id", "cells", "tone", "className"].includes(name)) || !row.cells || typeof row.cells !== "object" || Array.isArray(row.cells))
        throw new Error("CanopyX: invalid flat row fields.");
      gridDecoration(row.tone, row.className);
      for (const id of Object.keys(row.cells)) {
        if (!declared.has(id)) throw new Error("CanopyX: undeclared grid column " + id);
        const cell = row.cells[id];
        if (isCellObject(cell)) {
          if (Array.isArray(cell) || Object.keys(cell).some(name => !["value", "text", "searchText", "title", "tone", "badges"].includes(name)) ||
              ["text", "searchText", "title", "tone"].some(name => cell[name] !== undefined && typeof cell[name] !== "string") ||
              cell.badges !== undefined && (!Array.isArray(cell.badges) || cell.badges.some(badge => !badge || typeof badge.text !== "string" ||
                ["tone", "title"].some(name => badge[name] !== undefined && typeof badge[name] !== "string"))))
            throw new Error("CanopyX: malformed grid cell.");
        }
        gridScalar(cell, declared.get(id));
      }
    }
    return rows;
  }

  function validateGridView(view) {
    checkDocument(view, "grid"); requireIdentifier(view.id, "grid ID");
    if (typeof view.label !== "string" || !view.label.trim() || !Array.isArray(view.columns) || !view.columns.length)
      throw new Error("CanopyX: a grid needs a label and columns.");
    if (view.reporting !== undefined) {
      if (!GRID_REPORTING.validate) throw new Error("CanopyX: this view needs the reporting runtime.");
      GRID_REPORTING.validate(view);
    }
    const ids = new Set();
    for (const column of view.columns) {
      requireIdentifier(column && column.id, "grid column ID");
      if (ids.has(column.id) || typeof column.title !== "string" || !["text", "number", "datetime"].includes(column.kind) || column.editable ||
          column.width !== undefined && (!Number.isInteger(column.width) || column.width < 40) || column.wrap !== undefined && typeof column.wrap !== "boolean")
        throw new Error("CanopyX: grid columns need unique IDs, supported kinds and valid widths.");
      ids.add(column.id);
    }
    if (view.columns.every(column => column.hidden)) throw new Error("CanopyX: a grid needs a visible column.");
    validateGridHighlights(view);
    if (view.searchDelayMs !== undefined && (!Number.isInteger(view.searchDelayMs) || view.searchDelayMs < 0 || view.searchDelayMs > 5000))
      throw new Error("CanopyX: search delay must be an integer from 0 to 5000 milliseconds.");
    if (view.searchColumns !== undefined && (!Array.isArray(view.searchColumns) || !view.searchColumns.length ||
        new Set(view.searchColumns).size !== view.searchColumns.length || view.searchColumns.some(id => !ids.has(id))))
      throw new Error("CanopyX: search columns must identify unique declared columns.");
    if (view.rowHeight !== "auto" && (!Number.isInteger(view.rowHeight) || view.rowHeight < 20 || view.rowHeight > 64) ||
        view.estimatedRowHeight !== undefined && (!Number.isInteger(view.estimatedRowHeight) || view.estimatedRowHeight < 20 || view.estimatedRowHeight > 64) ||
        !Number.isInteger(view.pageSize) || view.pageSize < 1 || view.pageSize > 10000 ||
        !["none", "single", "multiple"].includes(view.selection)) throw new Error("CanopyX: invalid grid sizing or selection.");
    if (!view.source || !["inline", "host"].includes(view.source.kind)) throw new Error("CanopyX: grid source must be inline or host.");
    if (view.source.navigation !== undefined && !["offset", "cursor"].includes(view.source.navigation))
      throw new Error("CanopyX: invalid grid source navigation.");
    if (view.source.navigation === "cursor" && (view.source.kind !== "host" || view.presentation !== "paged"))
      throw new Error("CanopyX: cursors need a hosted paged grid.");
    if (view.presentation !== undefined && !["continuous", "paged"].includes(view.presentation) ||
        view.pageLength !== undefined && (!Number.isInteger(view.pageLength) || view.pageLength < 1 || view.pageLength > 10000))
      throw new Error("CanopyX: invalid grid presentation or page length.");
    if (view.source.kind === "inline") validateGridRows(view.rows, view.columns);
    else if (view.rows !== undefined) throw new Error("CanopyX: host grids cannot discard inline rows.");
    if (view.query !== undefined) gridQuery(view, view.query);
    return view;
  }

  function gridQuery(view, input) {
    input = input || {};
    const cursor = view.source.navigation === "cursor", type = cursor ? "gridCursorQuery" : "gridQuery";
    if (typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(name =>
        !["protocol", "type", "view", "revision", "search", "searchMode", "sort", "filters", "filterGroup", "offset", "limit", "cursor"].includes(name)) ||
        input.protocol !== undefined && input.protocol !== PROTOCOL || input.type !== undefined && input.type !== type ||
        input.view !== undefined && input.view !== view.id) throw new Error("CanopyX: query belongs to a different grid or protocol.");
    const query = { protocol: PROTOCOL, type: type, view: view.id,
      limit: input.limit === undefined ? cursor ? view.pageLength || 50 : view.pageSize : input.limit, search: input.search === undefined ? "" : input.search };
    if (cursor ? input.offset !== undefined && input.offset !== 0 : input.cursor !== undefined)
      throw new Error("CanopyX: cursor and offset navigation cannot be mixed.");
    if (!cursor) query.offset = input.offset === undefined ? 0 : input.offset;
    if (!cursor && !validStructuralCount(query.offset) || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 10000 || typeof query.search !== "string")
      throw new Error("CanopyX: invalid grid query window or search.");
    if (input.revision !== undefined) { requireIdentifier(input.revision, "grid revision"); query.revision = input.revision; }
    if (input.cursor !== undefined) {
      gridCursor(input.cursor); if (!query.revision) throw new Error("CanopyX: a cursor requires its dataset revision.");
      query.cursor = input.cursor;
    }
    if (input.searchMode !== undefined) {
      if (!["substring", "words"].includes(input.searchMode)) throw new Error("CanopyX: invalid grid search mode.");
      query.searchMode = input.searchMode;
    }
    const columns = new Map(view.columns.map(column => [column.id, column])), sorts = new Set();
    if (input.sort !== undefined && !Array.isArray(input.sort) || input.filters !== undefined && !Array.isArray(input.filters))
      throw new Error("CanopyX: grid sort and filters must be arrays.");
    query.sort = (input.sort || []).map(sort => {
      if (!sort || !columns.has(sort.column) || !columns.get(sort.column).sortable || sorts.has(sort.column) ||
          !["asc", "desc"].includes(sort.direction) || Object.keys(sort).some(name => !["column", "direction"].includes(name)))
        throw new Error("CanopyX: invalid grid sort column or direction.");
      sorts.add(sort.column); return Object.freeze({ column: sort.column, direction: sort.direction });
    });
    const budget = { predicates: 0, groups: 0 };
    query.filters = (input.filters || []).map(filter => gridPredicate(filter, columns, budget));
    if (input.filterGroup !== undefined) query.filterGroup = gridFilterGroup(input.filterGroup, columns, budget, 1);
    Object.freeze(query.sort); Object.freeze(query.filters); return Object.freeze(query);
  }

  function validateGridPage(page, view, query, accepted) {
    checkDocument(page, "gridPage"); requireIdentifier(page.revision, "grid revision");
    if (page.view !== view.id || page.offset !== query.offset || !validStructuralCount(page.total) || !validStructuralCount(page.matched) ||
        page.matched > page.total || page.offset > page.matched || !Array.isArray(page.items) ||
        page.items.length !== Math.min(query.limit, page.matched - page.offset)) throw new Error("CanopyX: grid page does not cover its requested window.");
    return checkedGridPage(page, view, query, accepted);
  }

  function checkedGridPage(page, view, query, accepted) {
    if (query.revision !== undefined && page.revision !== query.revision || accepted &&
        (page.revision !== accepted.revision || accepted.total !== undefined && page.total !== accepted.total ||
          accepted.matched !== undefined && page.matched !== accepted.matched)) throw new Error("CanopyX: grid page snapshot changed.");
    validateGridRows(page.items, view.columns);
    return { ...page, items: JSON.parse(JSON.stringify(page.items)) };
  }
