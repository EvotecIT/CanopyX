  // ---------- aggregate cells: function labels and the same declared precision on every aggregate surface ----------
  const AGGREGATE_LABELS = { count: "gridAggregateCount", sum: "gridAggregateSum", average: "gridAggregateAverage", minimum: "gridAggregateMinimum", maximum: "gridAggregateMaximum",
    distinctCount: "gridAggregateDistinct" };
  const reportingCounting = operation => operation === "count" || operation === "distinctCount";
  function reportingAggregateName(grid, aggregate) {
    const template = grid.labels[AGGREGATE_LABELS[aggregate.operation]] || grid.groupAggregates?.get(aggregate.operation)?.label || aggregate.operation;
    const operation = template.replace("{value}", "").trim() || aggregate.operation;
    return aggregate.label + " · " + operation.charAt(0).toLocaleUpperCase(grid.lang) + operation.slice(1);
  }
  function reportingValueText(grid, aggregate, value, mode = "value") {
    if (value === null || value === undefined) return "—";
    const column = grid.view.columns.find(column => column.id === aggregate.column);
    if (GRID_SHOW_AS.percent?.(mode)) return new Intl.NumberFormat(grid.lang, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value).replace(/[\s\u00a0\u202f]+%/g, "%");
    const format = aggregate.format || (!reportingCounting(aggregate.operation) && column?.format);
    return mode === "rank" ? numberText(value, grid.lang, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) :
      format ? numberText(value, grid.lang, format) : numberText(value, grid.lang, { minimumFractionDigits: reportingCounting(aggregate.operation) ? 0 : 2, maximumFractionDigits: reportingCounting(aggregate.operation) ? 0 : 2 });
  }
  function reportingAggregateParts(grid, column, aggregates, values) {
    const text = [], titles = [];
    for (const aggregate of aggregates) {
      const mode = showAsMode(grid, aggregate), display = mode === "value" ? null : GRID_SHOW_AS.entry?.(grid, values, aggregate);
      const value = display ? display.value : values[aggregate.id];
      if ((value === null || value === undefined) && mode === "value") continue;
      const shown = reportingValueText(grid, aggregate, value, mode), caption = showAsCaption(grid, mode);
      const labelled = fill(grid.labels[AGGREGATE_LABELS[aggregate.operation]] || grid.groupAggregates?.get(aggregate.operation)?.label || aggregate.operation + " {value}", {value: shown});
      text.push(mode === "value" ? labelled.charAt(0).toLocaleUpperCase(grid.lang) + labelled.slice(1) : shown + " " + caption.replace(/^% /, ""));
      titles.push(reportingAggregateName(grid, aggregate) + ": " + shown + (caption ? " (" + caption + ")" : ""));
    }
    return { text: text.join(" · "), title: titles.join(" · "), caption: "" };
  }
