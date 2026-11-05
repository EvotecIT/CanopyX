  // Only the intent and action are eager. The renderer and capture adapter load on first use.
  const GRID_CHARTS = {};
  const CHART_PART = definePart(DataGrid, "charts", "chart analysis", () => ({ DataGrid, GRID_CHARTS, GRID_BUCKETS,
    h, setText, gridButton, cellValue, cellText, reportingAggregateName, GRID_DATA_CHARTS }));
  const CHART_VALIDATE = GRID_REPORTING.validate, CHART_CHROME = DataGrid.prototype.buildGridChrome,
    CHART_API = GRID_REPORTING.api;
  GRID_REPORTING.validate = view => {
    CHART_VALIDATE(view);
    if (view.reporting.chartable !== undefined && typeof view.reporting.chartable !== "boolean")
      throw new Error("CanopyX: chartable must be a boolean.");
  };
  Object.assign(DataGrid.prototype, {
    async openChart(options = {}) {
      if (!this.view.reporting?.chartable) throw new Error("CanopyX: this view does not enable chart analysis.");
      if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("CanopyX: invalid chart options.");
      const request = { ...options }, epoch = this.queryEpoch;
      if (Array.isArray(request.values)) request.values = request.values.slice();
      await this.loadRows(); await loadGridFilterEditor(); await loadPart(CHART_PART);
      if (this.destroyed || epoch !== this.queryEpoch) throw new DOMException("Chart opening was superseded.", "AbortError");
      return this.showChart(request);
    },
    buildGridChrome() {
      CHART_CHROME.call(this);
      if (!this.view.reporting?.chartable) return;
      const run = source => this.openChart({ source }).catch(error => this.emit("error", { error }));
      const button = gridButton(this.labels.gridChart, () => run()); button.classList.add("cx-chart-open"); this.toolbar.append(button);
      if (typeof this.opts.onChart !== "function") this.selectionBar.append(gridButton(this.labels.gridChart, () => run("selected")));
    }
  });
  GRID_REPORTING.api = (api, grid) => {
    CHART_API?.(api, grid);
    if (grid.view.reporting?.chartable) api.openChart = options => grid.openChart(options);
  };
