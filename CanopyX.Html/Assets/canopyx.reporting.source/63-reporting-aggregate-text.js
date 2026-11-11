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
    const counting = reportingCounting(aggregate.operation), format = aggregate.format || (!counting && column?.format);
    if (mode === "rank" || counting && !format) return numberText(value, grid.lang, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (format) return numberText(value, grid.lang, format);
    // A progress column reads as a share of its maximum, so its totals do too; other values show the digits they need, up to two.
    const presenter = column?.presenter;
    if (presenter?.kind === "progress") return numberText(value / (presenter.maximum || 100) * 100, grid.lang, { maximumFractionDigits: 1, suffix: "%" });
    return numberText(value, grid.lang, { maximumFractionDigits: 2 });
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
    return { text: text.join(" · "), parts: text, title: titles.join(" · "), caption: "" };
  }
  /** Writes aggregate texts as unbreakable parts joined by " · ", so a one-line cell breaks only between whole aggregates. */
  function reportingAggregateSpans(element, parts) {
    element.replaceChildren(...parts.flatMap((part, index) => { const item = h("span", "cx-aggregate-part"); setText(item, part); return index ? [" · ", item] : [item]; }));
  }
