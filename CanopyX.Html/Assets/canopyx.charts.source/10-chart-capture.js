  // CanopyX maps accepted records and analysis results. ChartForgeX owns all drawing and chart geometry.
  const chartTypes = ["line", "area", "bar", "column", "stacked", "win-loss", "bullet"];
  function chartFilters(grid, levels, path) {
    return path.map((value, index) => {
      const level = levels[index];
      return { field: level.column, predicate: { column: level.column,
        operator: value === null ? "isNull" : "eq", values: value === null ? [] : [value],
        ...(level.bucket ? { bucket: level.bucket } : {}) }, sourceLabel: grid.labels.gridChart };
    });
  }
  function chartRecords(grid, capture, options) {
    const columns = capture.columns || capture.request.columns;
    if (options.category !== undefined && !columns.some(column => column.id === options.category))
      throw new Error("CanopyX: the chart category must name a captured column.");
    const category = columns.find(column => column.id === options.category) || columns.find(column => column.kind !== "number") || columns[0];
    const numeric = columns.filter(column => column.kind === "number" && column.id !== category?.id);
    const values = options.values ? options.values.map(id => numeric.find(column => column.id === id)) : numeric.slice(0, 1);
    if (!category || !numeric.length || values.some(column => !column) || values.length > 32)
      throw new Error("CanopyX: a chart needs a category column and 1 to 32 numeric value columns.");
    const raw = (row, id) => cellValue(row.cells[id]), text = (row, column) => cellText(row.cells[column.id], column, grid.fmt);
    const categories = capture.rows.map(row => ({ id: String(row.id), label: text(row, category) || grid.labels.gridGroupMissing }));
    const instants = category.kind === "datetime" ? capture.rows.map(row => raw(row, category.id)) : null;
    if (instants?.every((value, index) => value && Number.isFinite(Date.parse(value)) &&
        (!index || Date.parse(value) > Date.parse(instants[index - 1])))) categories.forEach((item, index) => item.instant = instants[index]);
    const filters = new Map(capture.rows.map((row, index) => [categories[index].id, chartFilters(grid, [{ column: category.id }], [raw(row, category.id) ?? null])]));
    return { categories, series: values.map(column => ({ id: column.id, name: column.title,
      values: capture.rows.map(row => { const value = raw(row, column.id); return typeof value === "number" ? value : null; }) })), filters,
      availableValues: numeric.map(column => ({ id: column.id, name: column.title })),
      suggested: categories.every(item => item.instant) && categories.length ? "line" : "bar" };
  }
  function chartGroups(grid, options) {
    if (!grid.summary || !grid.groupLevels?.length) throw new Error("CanopyX: chart groups needs an accepted grouped result.");
    const levels = grid.groupLevels; let groups = grid.summary.groups, prefix = [];
    if (options.group !== undefined) {
      const find = (items, path) => {
        for (const item of items) {
          const next = [...path, item.value];
          if (item.key === options.group) return { groups: item.groups?.length ? item.groups : [item], prefix: item.groups?.length ? next : path };
          const found = find(item.groups || [], next); if (found) return found;
        }
      };
      const found = find(groups, []); if (!found) throw new Error("CanopyX: the chart group is no longer accepted.");
      ({ groups, prefix } = found);
    }
    const descriptors = grid.view.reporting.aggregates || [];
    const values = options.values ? options.values.map(id => descriptors.find(item => item.id === id)) : descriptors.slice(0, 1);
    if (!values.length || values.length > 32 || values.some(item => !item)) throw new Error("CanopyX: choose declared group aggregates.");
    const level = levels[prefix.length], column = grid.view.columns.find(item => item.id === level.column);
    const categories = groups.map(item => ({ id: item.key, label: item.value === null ? grid.labels.gridGroupMissing :
      level.bucket ? GRID_BUCKETS.label(level.bucket, item.value, grid.lang) : cellText(item.value, column, grid.fmt) }));
    return { categories, series: values.map(item => ({ id: item.id, name: reportingAggregateName(grid, item),
      values: groups.map(group => group.aggregates[item.id] ?? null) })),
      availableValues: descriptors.map(item => ({ id: item.id, name: reportingAggregateName(grid, item) })),
      filters: new Map(groups.map(item => [item.key, chartFilters(grid, levels, [...prefix, item.value])])), suggested: "bar" };
  }
  async function chartPivot(grid, options) {
    await grid.loadPivot(); const capture = grid.pivotExport(), state = grid.getPivot();
    // Collapse is presentation. Chart every accepted leaf without double-counting its summary prefixes.
    const columns = capture.columns.filter(column => column.kind === "number" && !column.summary && !column.grandTotal);
    const rows = capture.rows.filter(row => !row.summary && !row.grandTotal);
    const chosen = columns.length ? columns : capture.columns.filter(column => column.grandTotal);
    // Export IDs describe physical file positions. Interactive identity follows axis meaning instead.
    const axes = levels => levels.map(level => [level.column, level.bucket || null]);
    const columnAxis = axes(state.columns), rowAxis = axes(state.rows);
    const key = column => JSON.stringify([columnAxis, column.axisKey, column.aggregate]);
    const rowKey = row => JSON.stringify([rowAxis, row.axisKey]);
    const mapped = chosen.map(column => ({ ...column, id: key(column) }));
    const defaults = mapped.filter(column => column.aggregate === state.values[0]).map(column => column.id);
    const requested = options.pivotValues || (options.values ? options.values.map(id => {
      const column = chosen.find(column => column.id === id);
      if (!column) throw new Error("CanopyX: choose value columns from the accepted pivot.");
      return key(column);
    }) : defaults.length <= 32 ? defaults : defaults.slice(0, 1));
    const missing = requested.some(id => !mapped.some(column => column.id === id));
    const projectedRows = (rows.length ? rows : capture.rows.filter(row => row.grandTotal)).map(row => ({ ...row, id: rowKey(row),
      cells: { axis: row.cells.axis, ...Object.fromEntries(chosen.map(column => [key(column), row.cells[column.id]])) } }));
    const data = chartRecords(grid, { columns: [capture.columns[0], ...mapped], rows: projectedRows },
      { ...options, values: missing ? [] : requested });
    data.pivotValues = requested;
    data.filters = new Map(capture.rows.map(row => {
      const axis = capture.rowAxis.find(item => item.key === row.axisKey);
      return [rowKey(row), chartFilters(grid, state.rows, axis.path)];
    }));
    data.suggested = data.series.length > 1 ? "stacked" : "bar"; return data;
  }
  GRID_CHARTS.capture = async (grid, options, signal) => {
    options = { ...options, ...(options.values ? { values: options.values.slice() } : {}),
      ...(options.pivotValues ? { pivotValues: options.pivotValues.slice() } : {}) };
    let data;
    if (options.source === "groups") data = chartGroups(grid, options);
    else if (options.source === "pivot") data = await chartPivot(grid, options);
    else if (options.source === "range") {
      await grid.loadCellRanges(); data = chartRecords(grid, await grid.captureChartRange(signal), options);
    } else {
      const capture = await grid.materializeExport({ scope: options.source === "selected" ? "selected" : "filtered", values: "raw", maxRows: 10000, signal });
      data = chartRecords(grid, capture, options);
    }
    if (signal.aborted) throw new DOMException("Chart capture cancelled.", "AbortError");
    return data;
  };
