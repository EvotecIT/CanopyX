  // Print context comes from the frozen export request, never from the grid after an asynchronous read.
  function printContext(grid, snapshot) {
    const { request, rows } = snapshot, labels = grid.labels, query = request.query, locale = request.locale || grid.lang,
      scope = labels[request.scope === "all" ? "gridAllResults" : request.scope === "selected" ? "gridSelectedRows" : "gridFilteredResults"],
      parts = [scope, numberFormat(locale).format(rows.length) + " " + labels.gridRows];
    if (request.grouping?.levels.length) parts.push(labels.gridGroupedBy + " " + request.grouping.levels.map(level => level.title).join(", "));
    if (query?.search) parts.push(labels.searchPlaceholder + ": “" + query.search + "”");
    const filter = item => {
      const column = request.columns.find(column => column.id === item.column), value = item.values ?? item.value;
      const operator = { eq: "=", ne: "≠", gt: ">", ge: "≥", lt: "<", le: "≤", contains: labels.gridContains,
        startsWith: labels.gridStartsWith, in: labels.gridIn, isNull: labels.gridIsNull, isNotNull: labels.gridIsNotNull }[item.operator] || item.operator;
      return (column?.title || item.column) + " " + operator + (value == null ? "" : " " + (Array.isArray(value) ? value.join(", ") : String(value)));
    };
    const group = value => "(" + [...(value.filters || []).map(filter), ...(value.groups || []).map(group)].join(value.operator === "or" ? " ∨ " : " ∧ ") + ")";
    const filters = [...(query?.filters || []).map(filter), ...(query?.filterGroup ? [group(query.filterGroup)] : [])].filter(Boolean);
    if (filters.length) parts.push(labels.gridFilters + ": " + filters.join(" · "));
    const time = new Date(request.generatedAt || Date.now());
    parts.push(new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", ...(request.timeZone === "utc" ? { timeZone: "UTC" } : {}) }).format(time) +
      (request.timeZone === "utc" ? " UTC" : ""));
    return parts.join(" · ");
  }
