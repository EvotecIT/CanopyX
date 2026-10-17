  // ---------- flat-grid wire boundaries ----------
  function gridQueryStart(query, patch) { return { ...query, ...patch, offset: 0, cursor: undefined, revision: undefined }; }

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
      if (ids.has(column.id) || typeof column.title !== "string" || !["text", "number", "datetime"].includes(column.kind) ||
          column.width !== undefined && (!Number.isInteger(column.width) || column.width < 40) ||
          ["wrap", "autoWidth", "fixed", "rowHeader", "alwaysVisible", "editable"].some(name => column[name] !== undefined && typeof column[name] !== "boolean") ||
          column.flex !== undefined && !(typeof column.flex === "number" && column.flex >= 0 && column.flex <= 100) || column.autoSize !== undefined && !["content", "header", "none"].includes(column.autoSize) ||
          column.pinned !== undefined && ![null, "left", "right"].includes(column.pinned) || column.priority !== undefined && !gridPriority(column.priority) ||
          column.fixed && column.width === undefined || column.tooltip !== undefined && column.tooltip !== "auto" && !view.columns.some(item => item.id === column.tooltip))
        throw new Error("CanopyX: invalid or duplicate grid column.");
      ids.add(column.id);
      if (column.presenter !== undefined) gridPresenter(column.presenter, column, view.columns);
      if (column.aggregatable !== undefined && (typeof column.aggregatable !== "boolean" || column.aggregatable && column.kind !== "number") ||
          column.section !== undefined && (typeof column.section !== "string" || !column.section.trim() || column.section.length > 256))
        throw new Error("CanopyX: invalid column aggregate or drawer section.");
    }
    if (view.columns.every(column => column.hidden) || view.columns.filter(column => column.rowHeader).length > 1)
      throw new Error("CanopyX: a grid needs a visible column and one row header at most.");
    if (view.density !== undefined && !["compact", "default", "comfortable"].includes(view.density) ||
        ["zebra", "statusBar", "autoHeight", "rowAccents"].some(name => view[name] !== undefined && typeof view[name] !== "boolean") ||
        view.rowAction !== undefined && !["none", "details", "link"].includes(view.rowAction) ||
        view.noun !== undefined && (typeof view.noun !== "string" || !view.noun.trim() || view.noun.length > 256) ||
        view.emptyReason !== undefined && (typeof view.emptyReason !== "string" || view.emptyReason.length > 4096)) throw new Error("CanopyX: invalid grid appearance or state text.");
    validateGridHighlights(view);
    if (view.searchDelayMs !== undefined && (!Number.isInteger(view.searchDelayMs) || view.searchDelayMs < 0 || view.searchDelayMs > 5000))
      throw new Error("CanopyX: search delay must be an integer from 0 to 5000 milliseconds.");
    if (view.searchColumns !== undefined && (!Array.isArray(view.searchColumns) || !view.searchColumns.length ||
        new Set(view.searchColumns).size !== view.searchColumns.length || view.searchColumns.some(id => !ids.has(id))))
      throw new Error("CanopyX: search columns must identify unique declared columns.");
    if (view.exportFormats !== undefined && !exportFormatIds(view.exportFormats)) throw new Error("CanopyX: exportFormats lists unique format IDs.");
    if (view.autoRowHeight !== undefined && typeof view.autoRowHeight !== "boolean" ||
        view.rowHeight !== undefined && view.rowHeight !== "auto" && (!Number.isInteger(view.rowHeight) || view.rowHeight < 20 || view.rowHeight > 64) ||
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
    // rowData replaces an inline grid's rows; the data part (52-grid-row-data.js) decodes and validates it with the first query.
    if (view.rowData !== undefined) {
      if (view.source.kind !== "inline" || view.rows !== undefined || !validStructuralCount(view.rowData?.count)) throw new Error("CanopyX: invalid grid rowData.");
    } else if (view.source.kind === "inline") validateGridRows(view.rows, view.columns);
    else if (view.rows !== undefined) throw new Error("CanopyX: host grids cannot discard inline rows.");
    if (view.query !== undefined) gridQuery(view, view.query);
    return { ...view, rowHeight: view.rowHeight ?? (view.density === "compact" ? 28 : view.density === "comfortable" ? 42 : 34) };
  }

  function gridQuery(view, input, strict) {
    input = input || {};
    const cursor = view.source.navigation === "cursor", type = cursor ? "gridCursorQuery" : "gridQuery";
    if (typeof input !== "object" || Array.isArray(input) ||
        input.protocol !== undefined && input.protocol !== PROTOCOL || input.type !== undefined && input.type !== type ||
        input.view !== undefined && input.view !== view.id) throw new Error("CanopyX: invalid grid query identity.");
    const query = { protocol: PROTOCOL, type, view: view.id,
      limit: input.limit === undefined ? cursor ? view.pageLength || 50 : view.pageSize : input.limit, search: input.search === undefined ? "" : input.search,
      cursor: input.cursor, revision: input.revision, searchMode: input.searchMode, filterGroup: undefined };
    if (cursor ? input.offset !== undefined && input.offset !== 0 : input.cursor !== undefined)
      throw new Error("CanopyX: cursor and offset navigation cannot be mixed.");
    if (!cursor) query.offset = input.offset === undefined ? 0 : input.offset;
    if (!cursor && !validStructuralCount(query.offset) || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 10000 || typeof query.search !== "string")
      throw new Error("CanopyX: invalid grid query window or search.");
    if (input.revision !== undefined) requireIdentifier(input.revision, "grid revision");
    if (input.cursor !== undefined) {
      gridCursor(input.cursor); if (!query.revision) throw new Error("CanopyX: a cursor requires its dataset revision.");
    }
    if (input.searchMode !== undefined && !["substring", "words"].includes(input.searchMode)) throw new Error("CanopyX: invalid grid search mode.");
    const columns = new Map(view.columns.map(column => [column.id, column])), sorts = new Set();
    if (input.sort !== undefined && !Array.isArray(input.sort) || input.filters !== undefined && !Array.isArray(input.filters))
      throw new Error("CanopyX: grid sort and filters must be arrays.");
    query.sort = (input.sort || []).map(sort => {
      if (!sort || !columns.has(sort.column) || !columns.get(sort.column).sortable || sorts.has(sort.column) ||
          !["asc", "desc"].includes(sort.direction))
        throw new Error("CanopyX: invalid grid sort column or direction.");
      sorts.add(sort.column); return gridQueryRecord(sort, { column: sort.column, direction: sort.direction }, strict);
    });
    const budget = { predicates: 0, groups: 0, strict };
    query.filters = (input.filters || []).map(filter => gridPredicate(filter, columns, budget));
    if (input.filterGroup !== undefined) query.filterGroup = gridFilterGroup(input.filterGroup, columns, budget, 1);
    // Sorting and paging normalize reader queries; preserve their internal origin without adding wire fields.
    if (input[LINK_IMPL.queryOwn]) query[LINK_IMPL.queryOwn] = true;
    return gridQueryRecord(input, query, strict, cursor);
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
