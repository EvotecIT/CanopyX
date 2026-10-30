  // ---------- flat-grid wire boundaries ----------
  function gridQueryStart(query, patch) { return { ...query, ...patch, offset: 0, cursor: undefined, revision: undefined }; }
  function gridNumberFormat(format) {
    const minimum = format?.minimumFractionDigits ?? 0, maximum = format?.maximumFractionDigits ?? 3;
    if (!format || typeof format !== "object" || Array.isArray(format) || ![minimum, maximum].every(digits => Number.isInteger(digits) && digits >= 0 && digits <= 10) || minimum > maximum ||
        Object.keys(format).some(key => !["minimumFractionDigits", "maximumFractionDigits", "prefix", "suffix"].includes(key)) ||
        [format.prefix, format.suffix].some(text => text !== undefined && (typeof text !== "string" || !text || text.length > 16))) throw new Error("CanopyX: invalid number format.");
  }

  function validateGridView(view) {
    checkDocument(view, "grid"); requireIdentifier(view.id, "grid ID");
    if ([view.board, view.path, view.stack, view.calendar].filter(value => value != null).length > 1)
      throw new Error("CanopyX: choose one grid presentation: board, path, stack or calendar (with optional plan).");
    view = gridColumnDefaults(view);
    if (view.allowRegexSearch !== undefined && typeof view.allowRegexSearch !== "boolean") throw new Error("CanopyX: allowRegexSearch is a boolean.");
    const groups = [view.columnBands, view.columnGroups].filter(value => value !== undefined);
    if (groups.length > 1 || groups.some(value => !Array.isArray(value)))
      throw new Error("CanopyX: choose columnBands or columnGroups as an array.");
    if (view.rowIdentity !== undefined && !["stableKey", "ordinal"].includes(view.rowIdentity))
      throw new Error("CanopyX: rowIdentity must be stableKey or ordinal.");
    if (view.rowIdentity === "ordinal" && (view.live || view.record?.deepLink))
      throw new Error("CanopyX: rowIdentity must be stableKey for live updates or deep links.");
    if (typeof view.label !== "string" || !view.label.trim() || !Array.isArray(view.columns) || !view.columns.length)
      throw new Error("CanopyX: a grid needs a label and columns.");
    // The source is checked before anything that reads it, such as the reporting options.
    if (!view.source || typeof view.source !== "object" || !["inline", "host"].includes(view.source.kind))
      throw new Error("CanopyX: a grid needs source.kind inline or host.");
    if (view.reporting !== undefined) {
      if (!GRID_REPORTING.validate) throw new Error("CanopyX: this view needs the reporting runtime.");
      GRID_REPORTING.validate(view);
    }
    const ids = new Set();
    for (const column of view.columns) {
      requireIdentifier(column && column.id, "grid column ID");
      if (ids.has(column.id) || typeof column.title !== "string" || !["text", "number", "datetime"].includes(column.kind) ||
          column.headerDescription !== undefined && typeof column.headerDescription !== "string" ||
          column.width !== undefined && (!Number.isInteger(column.width) || column.width < 40) ||
          ["wrap", "autoWidth", "fixed", "rowHeader", "alwaysVisible", "editable", "filterable", "exportable"].some(name => column[name] !== undefined && typeof column[name] !== "boolean") ||
          column.flex !== undefined && !(typeof column.flex === "number" && column.flex >= 0 && column.flex <= 100) || column.autoSize !== undefined && !["content", "header", "none"].includes(column.autoSize) ||
          column.pinned !== undefined && ![null, "left", "right"].includes(column.pinned) || column.priority !== undefined && !gridPriority(column.priority) ||
          column.fixed && column.width === undefined || column.tooltip !== undefined && column.tooltip !== "auto" && !view.columns.some(item => item.id === column.tooltip))
        throw new Error("CanopyX: invalid or duplicate grid column.");
      gridColumnOptions(column, view.columns);
      ids.add(column.id);
      if (column.calculation !== undefined && (typeof column.calculation !== "string" || !column.calculation.trim() || column.calculation.length > 2048 || column.editable))
        throw new Error("CanopyX: calculated columns need a bounded expression and cannot be editable.");
      validateColumnValues(column);
      if (column.presenter !== undefined) gridPresenter(column.presenter, column, view.columns);
      if (column.format !== undefined) { if (column.kind !== "number") throw new Error("CanopyX: number formats need number columns."); gridNumberFormat(column.format); }
      if (column.aggregatable !== undefined && (typeof column.aggregatable !== "boolean" || column.aggregatable && column.kind !== "number") ||
          column.section !== undefined && (typeof column.section !== "string" || !column.section.trim() || column.section.length > 256))
        throw new Error("CanopyX: invalid column aggregate or drawer section.");
    }
    if (view.columns.every(column => column.hidden) || view.columns.filter(column => column.rowHeader).length > 1)
      throw new Error("CanopyX: a grid needs a visible column and one row header at most.");
    if (view.density !== undefined && !["compact", "default", "comfortable"].includes(view.density) ||
        ["zebra", "statusBar", "autoHeight", "rowAccents", "recordDrawerModal"].some(name => view[name] !== undefined && typeof view[name] !== "boolean") ||
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
    // Each sizing field is named in its own message, so a missing one is found without reading the protocol.
    if (!Number.isInteger(view.pageSize) || view.pageSize < 1 || view.pageSize > 10000)
      throw new Error("CanopyX: pageSize must be 1 to 10000.");
    if (!["none", "single", "multiple"].includes(view.selection))
      throw new Error("CanopyX: selection must be none, single or multiple.");
    if (view.autoRowHeight !== undefined && typeof view.autoRowHeight !== "boolean")
      throw new Error("CanopyX: autoRowHeight is a boolean.");
    if (view.rowHeight !== undefined && view.rowHeight !== "auto" && (!Number.isInteger(view.rowHeight) || view.rowHeight < 20 || view.rowHeight > 64))
      throw new Error("CanopyX: rowHeight must be auto or 20 to 64.");
    if (view.estimatedRowHeight !== undefined && (!Number.isInteger(view.estimatedRowHeight) || view.estimatedRowHeight < 20 || view.estimatedRowHeight > 64))
      throw new Error("CanopyX: estimatedRowHeight must be 20 to 64.");
    if (view.calculatedColumnsEditable !== undefined && (typeof view.calculatedColumnsEditable !== "boolean" || view.calculatedColumnsEditable && view.source.kind !== "inline"))
      throw new Error("CanopyX: the calculated-column editor requires an inline grid.");
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
    }
    const rows = view.rowData === undefined && view.source.kind === "inline" ? validateGridRows(view.rows, view.columns, undefined, repairGridCell) : view.rows;
    if (view.source.kind !== "inline" && view.rows !== undefined) throw new Error("CanopyX: host grids cannot discard inline rows.");
    if (view.query !== undefined) gridQuery(view, view.query);
    return { ...view, ...(rows === undefined ? {} : { rows }), rowHeight: view.rowHeight ?? (view.density === "compact" ? 32 : 40) };
  }

  function gridQuery(view, input, strict) {
    input = input || {};
    // Empty optional tuple criteria retain the original query shape, including strict saved-state reads.
    if (Array.isArray(input.tupleFilters) && !input.tupleFilters.length) { input = { ...input }; delete input.tupleFilters; }
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
    if (input.searchMode !== undefined && !["substring", "words", "regex"].includes(input.searchMode)) throw new Error("CanopyX: invalid grid search mode.");
    if (query.searchMode === "regex") {
      if (!view.allowRegexSearch) throw new Error("CanopyX: this grid does not allow regex search.");
      if (query.search) boundedPattern(query.search, false);
    }
    const columns = new Map(view.columns.map(column => [column.id, column])), sorts = new Set();
    if (input.sort !== undefined && !Array.isArray(input.sort) || input.filters !== undefined && !Array.isArray(input.filters))
      throw new Error("CanopyX: grid sort and filters must be arrays.");
    query.sort = (input.sort || []).map(sort => {
      if (!sort || !columns.has(sort.column) || !columns.get(sort.column).sortable || sorts.has(sort.column) ||
          !["asc", "desc"].includes(sort.direction))
        throw new Error("CanopyX: invalid grid sort column or direction.");
      sorts.add(sort.column); return gridQueryRecord(sort, { column: sort.column, direction: sort.direction }, strict);
    });
    if (view.preSort !== undefined) {
      if (!Array.isArray(view.preSort) || view.preSort.length > 32) throw new Error("CanopyX: invalid fixed pre-sort.");
      const fixed = new Set();
      for (const sort of view.preSort) {
        if (!columns.get(sort?.column)?.sortable || !["asc", "desc"].includes(sort.direction) || fixed.has(sort.column)) throw new Error("CanopyX: invalid fixed pre-sort.");
        fixed.add(sort.column);
      }
      query.sort = [...view.preSort.map(sort => ({column:sort.column,direction:sort.direction})), ...query.sort.filter(sort => !fixed.has(sort.column))];
    }
    const budget = { predicates: 0, groups: 0, strict, filterable: true };
    query.filters = (input.filters || []).map(filter => gridPredicate(filter, columns, budget));
    if (input.filterGroup !== undefined) query.filterGroup = gridFilterGroup(input.filterGroup, columns, budget, 1);
    if (input.tupleFilters !== undefined) query.tupleFilters = gridTupleFilters(input.tupleFilters, columns, strict);
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
    // Repair runs before the detaching copy, which would turn NaN and infinities into null without a warning.
    const items = JSON.parse(JSON.stringify(validateGridRows(page.items, view.columns, undefined, repairGridCell)));
    return { ...page, items };
  }

  // A number or bigint in a text column becomes its string, a numeric string in a number column its number; anything else
  // gets an empty raw value, so it sorts and filters as a missing value. Text keeps showing; a number outside the safe range
  // does not, because the browser may already have rounded it and would show a wrong value.
  function repairGridCell(cell, column) {
    const raw = cellValue(cell), shown = typeof raw === "string" || typeof raw === "boolean" ? String(raw) : undefined;
    let value = raw;
    try { gridScalar(value, column); } catch {
      value = null;
      if (column.kind === "number" && typeof raw === "string" && raw.trim()) value = Number(raw);
      else if (column.kind !== "number" && column.kind !== "datetime" && (typeof raw === "bigint" || safeGridNumber(raw))) value = String(raw);
      try { gridScalar(value, column); } catch { value = null; }
    }
    const text = isCellObject(cell) && !Array.isArray(cell) && typeof cell.text === "string" ? cell.text : value === null ? shown : undefined;
    if (isCellObject(cell) && !Array.isArray(cell)) {
      // Keep the tone, badges and other decorations when they are valid; an invalid sort key is dropped.
      const kept = { ...cell, value, ...(text === undefined ? {} : { text }) };
      try { validateGridCell(kept, column); return kept; } catch { }
      delete kept.sort;
      try { validateGridCell(kept, column); return kept; } catch { }
    }
    return text === undefined ? value : { value, text };
  }
