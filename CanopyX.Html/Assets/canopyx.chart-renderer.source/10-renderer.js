  GRID_DATA_CHARTS.create = global.ChartForgeXRenderer.create;
  GRID_DATA_CHARTS.caption = (value, fallback) => {
    const text = String(value ?? "").trim() || String(fallback);
    return text.length <= 2000 ? text : text.slice(0, 1999).replace(/[\uD800-\uDBFF]$/, "") + "…";
  };
