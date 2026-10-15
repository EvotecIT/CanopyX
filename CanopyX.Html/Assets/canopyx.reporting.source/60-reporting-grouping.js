  // ---------- row grouping and detail rows: what the runtime keeps before their parts load ----------
  // Grouping (canopyx.grouping.source) and detail rows (canopyx.detail-rows.source) are lazy parts. The runtime keeps their
  // labels, the checks of a definition, the query fields they add, saved collapse state and the API, and loads the parts
  // with a grid's first page; a page request waits for them, so the first rows already show headings and expanders.
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridGroupHeading: "{column}: {value} ({count} records)", gridGroupMissing: "Missing value",
    gridGroupExpand: "Expand group", gridGroupCollapse: "Collapse group", gridSummary: "Query totals",
    gridGroupOrder: "Group order is fixed by this report", gridGroupBy: "Group by this column", gridUngroup: "Stop grouping by this column",
    gridGroupDrop: "Drag a column header here to group rows", gridExpandAll: "Expand all", gridCollapseAll: "Collapse all",
    gridExpandLevel: "Expand level {level}", gridCollapseLevel: "Collapse level {level}", gridGroupMove: "Alt+Left and Alt+Right move this level",
    gridGroupSortBy: "Sort groups by", gridGroupSortValue: "by value", gridGroupSortAggregate: "by {aggregate}", gridSelectGroup: "Select the records of {group}",
    gridAggregateCount: "count {value}", gridAggregateSum: "sum {value}", gridAggregateAverage: "avg {value}", gridAggregateMinimum: "min {value}",
    gridAggregateMaximum: "max {value}", gridAggregateDistinct: "distinct {value}", gridShowDetail: "Show details", gridHideDetail: "Hide details", gridDetailOf: "Details of {record}",
    gridDetailFailed: "Details could not load: {error}"
  }));
  const GROUP_LEVELS = 4, GROUP_OPERATIONS = ["count", "sum", "average", "minimum", "maximum", "distinctCount"];
  const GROUP_NUMERIC = ["sum", "average", "minimum", "maximum"], GRID_ROWS = { base: {} };
  const reportingDynamicGroups = view => view.reporting?.groupBy !== undefined || !!view.reporting?.groupable;
  function reportingSummaryEnabled(view) { return !!view.reporting?.grouping || reportingDynamicGroups(view) || !!view.reporting?.aggregates?.length; }
  const reportingRowsUsed = grid => reportingSummaryEnabled(grid.view) || !!grid.view.reporting?.detail || !!grid.opts.detail;
  function reportingGroupKey(value) { return JSON.stringify([typeof value, value]); }
  function reportingGroupLevels(view, input, columns = view.columns) {
    if (!Array.isArray(input) || input.length > GROUP_LEVELS) throw new Error("CanopyX: groupBy lists at most " + GROUP_LEVELS + " levels.");
    const seen = new Set(), aggregates = view.reporting.aggregates || [];
    return input.map(level => {
      const column = level && columns.find(item => item.id === level.column);
      if (!column || !column.sortable || seen.has(level.column) || !["asc", "desc"].includes(level.direction) ||
          Object.keys(level).some(key => !["column", "direction", "aggregate"].includes(key)) ||
          level.aggregate !== undefined && !aggregates.some(aggregate => aggregate.id === level.aggregate))
        throw new Error("CanopyX: invalid groupBy level.");
      seen.add(level.column);
      return gridFreeze({ column: level.column, direction: level.direction, ...(level.aggregate === undefined ? {} : { aggregate: level.aggregate }) });
    });
  }

  const GROUPING_VALIDATE = GRID_REPORTING.validate;
  GRID_REPORTING.validate = view => {
    GROUPING_VALIDATE(view);
    const options = view.reporting, grouping = options.grouping, aggregates = options.aggregates || [], ids = new Set();
    if (reportingSummaryEnabled(view) && view.source.navigation === "cursor") throw new Error("CanopyX: summaries require offset navigation.");
    if (grouping !== undefined && (!grouping || typeof grouping !== "object" || Array.isArray(grouping) ||
        !["asc", "desc"].includes(grouping.direction) ||
        !view.columns.some(column => column.id === grouping.column && column.sortable))) throw new Error("CanopyX: invalid grouping column or order.");
    if (options.groupable !== undefined && typeof options.groupable !== "boolean" || grouping !== undefined && reportingDynamicGroups(view))
      throw new Error("CanopyX: a fixed grouping cannot be combined with groupBy or groupable.");
    if (!Array.isArray(aggregates) || aggregates.length > 32) throw new Error("CanopyX: at most 32 aggregates are supported.");
    for (const aggregate of aggregates) {
      if (!aggregate || typeof aggregate !== "object" || Array.isArray(aggregate)) throw new Error("CanopyX: invalid aggregate.");
      requireIdentifier(aggregate.id, "aggregate ID"); const column = view.columns.find(item => item.id === aggregate.column);
      // A name outside the built-in operations is a custom aggregate: a plugin computes it for inline data, a host source its own.
      const custom = !GROUP_OPERATIONS.includes(aggregate.operation);
      if (!column || ids.has(aggregate.id) || typeof aggregate.operation !== "string" || custom && !/^[a-z][a-zA-Z\d]{0,31}$/.test(aggregate.operation) ||
          GROUP_NUMERIC.includes(aggregate.operation) && column.kind !== "number" || typeof aggregate.label !== "string" ||
          !aggregate.label.trim() || aggregate.label.length > 512) throw new Error("CanopyX: invalid aggregate binding.");
      ids.add(aggregate.id);
    }
    if (options.groupBy !== undefined) reportingGroupLevels(view, options.groupBy);
    const detail = options.detail;
    if (detail !== undefined && (!detail || typeof detail !== "object" || Array.isArray(detail) ||
        Object.keys(detail).some(key => !["template", "renderer", "view", "print", "label"].includes(key)) ||
        ["template", "renderer", "view"].filter(key => detail[key] !== undefined).length > 1 ||
        detail.template !== undefined && (typeof detail.template !== "string" || !/^[A-Za-z][\w:.-]{0,255}$/.test(detail.template)) ||
        detail.renderer !== undefined && (typeof detail.renderer !== "string" || !/^[a-z][a-z\d-]{0,31}$/.test(detail.renderer)) ||
        detail.view !== undefined && (!detail.view || typeof detail.view !== "object" || !["grid", "tree"].includes(detail.view.type)) ||
        detail.print !== undefined && typeof detail.print !== "boolean" ||
        detail.label !== undefined && (typeof detail.label !== "string" || !detail.label.trim() || detail.label.length > 256)))
      throw new Error("CanopyX: invalid detail rows definition.");
  };

  // A fixed grouping leads every sort as it always has. A grid that groups at runtime carries its levels in the query
  // (groupBy, in order); their columns lead the sort and the user's sorts follow inside the groups.
  const GROUPING_QUERY = gridQuery, GROUPING_SHAPE = gridResultShape;
  gridQuery = (view, input, strict) => {
    const grouping = view.reporting?.grouping;
    if (grouping) {
      const query = GROUPING_QUERY(view, input, strict);
      return gridFreeze({ ...query, sort: [grouping, ...query.sort.filter(sort => sort.column !== grouping.column)] });
    }
    if (!reportingDynamicGroups(view) || !input || typeof input !== "object") return GROUPING_QUERY(view, input, strict);
    const { groupBy, ...rest } = input, query = GROUPING_QUERY(view, rest, strict);
    // A sort of a grouped column turns its groups around (a level ordered by an aggregate keeps its own direction).
    const levels = reportingGroupLevels(view, groupBy === undefined ? view.reporting.groupBy || [] : groupBy).map(level => {
      const sort = !level.aggregate && query.sort.find(item => item.column === level.column);
      return sort && sort.direction !== level.direction ? gridFreeze({ ...level, direction: sort.direction }) : level;
    });
    // The levels always travel, an empty list included, so a saved or shared ungrouped view stays ungrouped.
    if (!levels.length) return gridFreeze({ ...query, groupBy: levels });
    // A level ordered by an aggregate keeps its records together by key; the summary orders the groups themselves.
    const lead = levels.map(level => ({ column: level.column, direction: level.aggregate ? "asc" : level.direction }));
    return gridFreeze({ ...query, groupBy: levels, sort: [...lead, ...query.sort.filter(sort => !levels.some(level => level.column === sort.column))] });
  };
  gridResultShape = query => query.groupBy ? GROUPING_SHAPE(query) + JSON.stringify(query.groupBy) : GROUPING_SHAPE(query);

  // Groups are runs of equal raw values, so a grouping column orders by its values: cell sort keys are left out, and exact
  // raw text and type break ties between values a text order treats as equal, so distinct raw values never interleave.
  function reportingGroupCompare(compare) {
    const plain = (row, column) => { const cell = row.cells[column.id]; return isCellObject(cell) && cell.sort != null ? { cells: { [column.id]: { ...cell, sort: null } } } : row; };
    return (a, b, column, direction) => {
      const compared = compare(plain(a, column), plain(b, column), column, direction);
      if (compared) return compared;
      const left = gridScalar(a.cells[column.id], column), right = gridScalar(b.cells[column.id], column);
      const result = gridOrder(typeof left, typeof right) || gridOrder(String(left), String(right));
      return direction === "desc" ? -result : result;
    };
  }
  const GROUPING_COMPARE = GRID_REPORTING.compare;
  GRID_REPORTING.compare = view => {
    const compare = GROUPING_COMPARE(view), grouping = view.reporting?.grouping;
    if (!grouping) return compare;
    const group = reportingGroupCompare(compare);
    return (a, b, column, direction) => column.id === grouping.column ? group(a, b, column, direction) : compare(a, b, column, direction);
  };
  // Inline data grouped at runtime is ordered by the grouping part, which orders groups by key or by an aggregate.
  const GROUPING_INLINE = inlineGridSource;
  inlineGridSource = view => {
    const base = GROUPING_INLINE(view), plain = base.query;
    if (!reportingDynamicGroups(view)) return base;
    let shape = null, ordered = null;
    // The source keeps its other hooks (facets); only its record query learns the levels.
    base.query = function (query, options) {
      if (!query.groupBy) return plain.call(base, query, options);
      if (options.signal.aborted) throw new DOMException("Grid cancelled.", "AbortError");
      if (gridResultShape(query) !== shape) { ordered = GRID_ROWS.order(view, query); shape = gridResultShape(query); }
      return { protocol: PROTOCOL, type: "gridPage", view: view.id, revision: "inline", offset: query.offset,
        total: view.rows.length, matched: ordered.length, items: ordered.slice(query.offset, query.offset + query.limit) };
    };
    return base;
  };

  // The parts install on the grid's first page request; every later request (pages, exports, ranges) waits for the same load.
  const DETAIL_ROWS = definePart(DataGrid, "detail-rows", "detail rows", () => ({ DataGrid, GRID_ROWS, GRID_REPORTING, h, setText, fill, gridButton, gridFreeze,
    cellText, requireIdentifier, GridRowOffsets, TreeGrid, createDataGrid, createTreeGrid, disposeRowHostCells, OWN_ARROWS }));
  const GROUPING = definePart(DataGrid, "grouping", "row grouping", () => ({ DataGrid, GRID_ROWS, GRID_REPORTING, h, setText, fill, numberFormat,
    formatValue, cellValue, cellText, isCellObject, gridScalar, gridQuery, gridFreeze, gridOrder, gridQueryRows, gridButton, gridDecorateButton,
    gridCellRenderer, gridPresenterTone, GRID_TONE_RANK, validateGridRows, validateGridPage, checkDocument, requireIdentifier, validStructuralCount, PROTOCOL,
    gridOperationActive, reportingGroupKey, reportingGroupCompare, reportingSummaryEnabled, reportingDynamicGroups, GROUP_OPERATIONS, reportingAggregateParts, disposeRowHostCells }));
  GRID_ROWS.base.requestPage = DataGrid.prototype.requestPage;
  Object.assign(DataGrid.prototype, {
    loadRows() {
      return this.rowsLoad ||= loadPart(reportingSummaryEnabled(this.view) ? GROUPING : DETAIL_ROWS).then(() => { if (!this.destroyed) this.attachRows(); },
        error => { this.rowsLoad = null; throw error; });
    },
    async requestPage(query, signal) {
      if (!reportingRowsUsed(this)) return GRID_ROWS.base.requestPage.call(this, query, signal);
      await this.loadRows();
      return (GRID_ROWS.requestPage || GRID_ROWS.base.requestPage).call(this, query, signal);
    },
    setGroupBy(groupBy) {
      if (!reportingDynamicGroups(this.view)) throw new Error("CanopyX: this report has no runtime grouping.");
      // The levels given win over the sorts of grouped columns, and a column that stops grouping also stops leading the sort.
      const query = this.queryForChange(true), levels = reportingGroupLevels(this.view, groupBy);
      const removed = (query.groupBy || []).filter(level => !levels.some(next => next.column === level.column)).map(level => level.column);
      return this.setQuery(gridQueryStart(query, { groupBy: levels, sort: (query.sort || []).filter(sort => !removed.includes(sort.column) && !levels.some(level => level.column === sort.column)) }));
    },
    getGroupBy() {
      const grouping = this.view.reporting?.grouping;
      return gridFreeze(grouping ? [{ column: grouping.column, direction: grouping.direction }] :
        JSON.parse(JSON.stringify((this.acceptedQuery || gridQuery(this.view, this.view.query || {})).groupBy || [])));
    }
  });
  const GROUPING_API = GRID_REPORTING.api;
  GRID_REPORTING.api = (api, grid) => {
    GROUPING_API?.(api, grid);
    const later = name => (...args) => grid.loadRows().then(() => grid[name](...args));
    if (reportingSummaryEnabled(grid.view)) {
      api.getSummary = () => grid.summary || null;
      api.getGroupBy = () => grid.getGroupBy();
      if (reportingDynamicGroups(grid.view)) api.setGroupBy = groupBy => grid.setGroupBy(groupBy);
    }
    if (grid.view.reporting?.grouping || reportingDynamicGroups(grid.view)) {
      api.setGroupCollapsed = (key, collapsed) => { if (!grid.setGroupCollapsed) throw new Error("CanopyX: choose an accepted group and a boolean collapse intent."); return grid.setGroupCollapsed(key, collapsed); };
      api.getCollapsedGroups = () => [...(grid.collapsedGroups || [])];
      api.expandAllGroups = later("expandAllGroups"); api.collapseAllGroups = later("collapseAllGroups");
      api.setGroupLevelCollapsed = later("setGroupLevelCollapsed");
    }
    if (grid.view.reporting?.detail || grid.opts.detail) {
      for (const name of ["expandDetail", "collapseDetail", "toggleDetail"]) api[name] = later(name);
      api.getExpandedDetails = () => [...(grid.detailRecords?.keys() || [])];
    }
  };
