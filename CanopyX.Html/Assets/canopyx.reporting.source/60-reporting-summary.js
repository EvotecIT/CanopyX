  // ---------- complete-query summary capability and fixed grouping order ----------
  const SUMMARY_VALIDATE = GRID_REPORTING.validate, SUMMARY_COMPARE = GRID_REPORTING.compare, SUMMARY_QUERY = gridQuery;
  const SUMMARY_BASE = { requestPage: DataGrid.prototype.requestPage, render: DataGrid.prototype.render };
  function reportingSummaryEnabled(view) { return !!view.reporting?.grouping || !!view.reporting?.aggregates?.length; }
  function reportingGroupKey(value) { return JSON.stringify([typeof value, value]); }
  function reportingGroupAt(summary, index) {
    let low = 0, high = summary.groups.length;
    while (low < high) { const middle = (low + high) >>> 1; if (summary.groups[middle].offset <= index) low = middle + 1; else high = middle; }
    return low ? summary.groups[low - 1] : null;
  }
  GRID_REPORTING.validate = view => {
    SUMMARY_VALIDATE(view);
    const grouping = view.reporting.grouping, aggregates = view.reporting.aggregates || [], ids = new Set();
    if (reportingSummaryEnabled(view) && view.source.navigation === "cursor") throw new Error("CanopyX: summaries require offset navigation.");
    if (grouping !== undefined && (!grouping || typeof grouping !== "object" || Array.isArray(grouping) ||
        Object.keys(grouping).some(key => !["column", "direction"].includes(key)) || !["asc", "desc"].includes(grouping.direction) ||
        !view.columns.some(column => column.id === grouping.column && column.sortable))) throw new Error("CanopyX: invalid grouping column or order.");
    if (!Array.isArray(aggregates) || aggregates.length > 32) throw new Error("CanopyX: at most 32 aggregates are supported.");
    for (const aggregate of aggregates) {
      if (!aggregate || typeof aggregate !== "object" || Array.isArray(aggregate) ||
          Object.keys(aggregate).some(key => !["id", "column", "operation", "label"].includes(key))) throw new Error("CanopyX: invalid aggregate.");
      requireIdentifier(aggregate.id, "aggregate ID"); const column = view.columns.find(item => item.id === aggregate.column);
      if (!column || ids.has(aggregate.id) || !["count", "sum", "average", "minimum", "maximum"].includes(aggregate.operation) ||
          aggregate.operation !== "count" && column.kind !== "number" || typeof aggregate.label !== "string" ||
          !aggregate.label.trim() || aggregate.label.length > 512) throw new Error("CanopyX: invalid aggregate binding.");
      ids.add(aggregate.id);
    }
  };
  gridQuery = (view, input) => {
    const query = SUMMARY_QUERY(view, input), grouping = view.reporting?.grouping;
    return !grouping ? query : gridFreeze({ ...query, sort: [grouping, ...query.sort.filter(sort => sort.column !== grouping.column)] });
  };
  GRID_REPORTING.compare = view => {
    const compare = SUMMARY_COMPARE(view), grouping = view.reporting?.grouping;
    return !grouping ? compare : (a, b, column, direction) => {
      const compared = compare(a, b, column, direction);
      if (compared || column.id !== grouping.column) return compared;
      const left = gridScalar(a.cells[column.id], column), right = gridScalar(b.cells[column.id], column);
      const result = gridOrder(typeof left, typeof right) || gridOrder(String(left), String(right));
      return direction === "desc" ? -result : result;
    };
  };
  function reportingSummaryQuery(view, query, revision) { return gridQuery(view, { ...query, offset: 0, limit: view.pageSize, revision }); }
  function reportingSummaryValues(view, values, count) {
    const declarations = view.reporting.aggregates || [];
    if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length !== declarations.length)
      throw new Error("CanopyX: summary aggregate bindings differ.");
    for (const aggregate of declarations) {
      const value = values[aggregate.id];
      if (!Object.hasOwn(values, aggregate.id) || value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) ||
          aggregate.operation === "count" && (!validStructuralCount(value) || value > count) ||
          !count && aggregate.operation !== "count" && value !== null) throw new Error("CanopyX: invalid aggregate value.");
    }
  }
  function reportingSummaryResult(view, query, page, summary) {
    checkDocument(summary, "gridSummary");
    if (Object.keys(summary).some(key => !["protocol", "type", "view", "revision", "query", "matched", "groups", "aggregates"].includes(key)) ||
        JSON.stringify(summary).length > 4194304 || summary.view !== view.id || summary.revision !== page.revision || summary.matched !== page.matched ||
        !Array.isArray(summary.groups) || summary.groups.length > 10000 || !validStructuralCount(summary.matched + summary.groups.length) || !view.reporting.grouping && summary.groups.length ||
        !summary.query || !["protocol", "type", "view", "offset", "limit", "sort", "filters", "search", "revision"].every(key => Object.hasOwn(summary.query, key)) ||
        summary.query.type !== "gridQuery" || summary.query.protocol !== PROTOCOL || summary.query.revision !== page.revision || summary.query.offset !== 0 ||
        JSON.stringify(gridQuery(view, summary.query)) !== JSON.stringify(query)) throw new Error("CanopyX: summary ownership or counts differ.");
    reportingSummaryValues(view, summary.aggregates, summary.matched);
    let offset = 0; const keys = new Set(), column = view.columns.find(item => item.id === view.reporting.grouping?.column), values = new Set();
    const compare = column ? GRID_REPORTING.compare(view) : null; let previous = null;
    for (const group of summary.groups) {
      if (!group || !Object.hasOwn(group, "value") || Object.keys(group).some(key => !["key", "value", "offset", "count", "aggregates", "cells"].includes(key)) ||
          group.value !== null && typeof group.value === "object") throw new Error("CanopyX: groups carry raw values.");
      requireIdentifier(group.key, "group key"); const value = gridScalar(group.value, column), key = reportingGroupKey(value);
      if (group.cells !== undefined) validateGridRows([{id:group.key,cells:group.cells}],view.columns);
      if (group.key.length > 4096 || keys.has(group.key) || values.has(key) || group.offset !== offset ||
          !validStructuralCount(group.count) || !group.count || previous && compare(previous, {cells:{[column.id]:group.value}}, column, view.reporting.grouping.direction) >= 0)
        throw new Error("CanopyX: invalid complete group range.");
      previous = {cells:{[column.id]:group.value}};
      keys.add(group.key); values.add(key); offset += group.count; reportingSummaryValues(view, group.aggregates, group.count);
    }
    if (view.reporting.grouping && offset !== page.matched) throw new Error("CanopyX: groups omit matching records.");
    return gridFreeze(JSON.parse(JSON.stringify(summary)));
  }
  Object.assign(DataGrid.prototype, {
    async requestPage(query, signal) {
      const page = await SUMMARY_BASE.requestPage.call(this, query, signal);
      // Export/range readers have independent operation signals and need records, not display metadata.
      if (!reportingSummaryEnabled(this.view) || signal !== this.dataLifetime.signal) return page;
      validateGridPage(page, this.view, query);
      const request = reportingSummaryQuery(this.view, query, page.revision), key = JSON.stringify(request);
      if (this.summaryCandidate?.key !== key) {
        const hook = this.source.summary || (this.view.source.kind === "inline" ? request => reportingInlineSummary(this.view, request) : null);
        if (!hook) throw new Error("CanopyX: hosted summaries need an explicit source summary hook.");
        const summary = await this.runGridHook(signal => hook.call(this.source, request, { signal }), signal);
        gridOperationActive(this, signal);
        this.summaryCandidate = { key, result: reportingSummaryResult(this.view, request, page, summary) };
      }
      if (this.summaryCandidate.result.matched !== page.matched) throw new Error("CanopyX: a page differs from its complete-query summary count.");
      if (this.view.reporting.grouping) {
        const column = this.view.columns.find(column => column.id === this.view.reporting.grouping.column);
        for (let i = 0; i < page.items.length; i++) {
          const group = reportingGroupAt(this.summaryCandidate.result, page.offset + i);
          if (!group || reportingGroupKey(gridScalar(page.items[i].cells[column.id], column)) !== reportingGroupKey(gridScalar(group.value, column)))
            throw new Error("CanopyX: a page record differs from its complete-query group.");
        }
      }
      return page;
    },
    render() {
      if (this.acceptedQuery && reportingSummaryEnabled(this.view)) {
        const key = JSON.stringify(reportingSummaryQuery(this.view, this.acceptedQuery, this.snapshot.revision));
        if (this.summaryCandidate?.key === key && this.summary !== this.summaryCandidate.result) {
          this.summary = this.summaryCandidate.result; this.groupProjectionKey = null;
        }
        this.prepareGroupProjection?.(); this.syncSummaryControls?.();
      }
      return SUMMARY_BASE.render.call(this);
    }
  });
