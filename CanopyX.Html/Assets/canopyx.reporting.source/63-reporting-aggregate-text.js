  // ---------- aggregate cells: function label, the column's precision and compact large values ----------
  const AGGREGATE_LABELS = { count: "gridAggregateCount", sum: "gridAggregateSum", average: "gridAggregateAverage", minimum: "gridAggregateMinimum", maximum: "gridAggregateMaximum",
    distinctCount: "gridAggregateDistinct" };
  const reportingCounting = operation => operation === "count" || operation === "distinctCount";
  const AGGREGATE_FORMATS = new Map();
  function reportingAggregateFormat(lang, digits, compact) {
    const key = (lang || "") + "|" + digits + "|" + compact;
    let format = AGGREGATE_FORMATS.get(key);
    if (!format) {
      const options = compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: digits };
      // A value that rounds to zero shows 0, not -0; engines without signDisplay fall back to the plain options.
      try { format = new Intl.NumberFormat(lang || undefined, { ...options, signDisplay: "negative" }); }
      catch (e) { try { format = new Intl.NumberFormat(lang || undefined, options); } catch (f) { format = new Intl.NumberFormat(undefined, options); } }
      if (AGGREGATE_FORMATS.size >= 32) AGGREGATE_FORMATS.delete(AGGREGATE_FORMATS.keys().next().value);
      AGGREGATE_FORMATS.set(key, format);
    }
    return format;
  }
  // The column's precision is the most fraction digits among its loaded raw values, read once per accepted summary from at
  // most 200 loaded records and capped at three, so headings and the footer agree while the reader scrolls.
  function reportingColumnPrecision(grid, column) {
    if (!grid.aggregatePrecision || grid.aggregatePrecision.summary !== grid.summary) grid.aggregatePrecision = { summary: grid.summary, columns: new Map() };
    const known = grid.aggregatePrecision.columns.get(column.id);
    if (known !== undefined) return known;
    let digits = 0, numbers = 0, visited = 0;
    for (const row of grid.rowCache?.values() || []) {
      if (++visited > 200) break;
      const value = cellValue(row.h?.cells?.[column.id]);
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      numbers++;
      const text = String(value), dot = text.indexOf(".");
      if (text.includes("e")) digits = 3; else if (dot >= 0) digits = Math.max(digits, Math.min(3, text.length - dot - 1));
      if (digits === 3) break;
    }
    // Without loaded numbers, keep three digits and look again on the next render.
    if (!numbers) return 3;
    grid.aggregatePrecision.columns.set(column.id, digits);
    return digits;
  }
  // Visible text "sum 12.7M" or "avg 36.2" (translatable templates); the tooltip gives the aggregate's label and the full value.
  // A custom aggregate shows the {value} template its plugin registers (the grouping part keeps them in groupAggregates).
  function reportingAggregateParts(grid, column, aggregates, values) {
    const precision = aggregates.some(item => !reportingCounting(item.operation)) ? reportingColumnPrecision(grid, column) : 0;
    const text = [], titles = [];
    for (const aggregate of aggregates) {
      const value = values[aggregate.id];
      if (value === null || value === undefined) continue;
      const digits = reportingCounting(aggregate.operation) ? 0 : aggregate.operation === "average" ? Math.min(3, precision + 1) : precision;
      const shown = reportingAggregateFormat(grid.lang, digits, Math.abs(value) >= 1e6).format(value);
      const label = AGGREGATE_LABELS[aggregate.operation];
      text.push(fill(label ? grid.labels[label] : grid.groupAggregates?.get(aggregate.operation)?.label || aggregate.operation + " {value}", { value: shown }));
      titles.push(aggregate.label + ": " + reportingAggregateFormat(grid.lang, 3, false).format(value));
    }
    return { text: text.join(" · "), title: titles.join(" · ") };
  }
