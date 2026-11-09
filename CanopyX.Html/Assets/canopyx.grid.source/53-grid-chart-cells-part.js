  const GRID_DATA_CHARTS = {}, GRID_CHART_CELLS = {}, GRID_CHART_CELL_KINDS = ["sparklineArea", "sparklineColumns", "sparklineWinLoss", "bullet"];
  const DATA_CHART_PART = definePart(DataGrid, "chart-renderer", "ChartForgeX renderer", () => ({ GRID_DATA_CHARTS }));
  const CHART_CELL_PART = definePart(DataGrid, "chart-cells", "chart cells", () => ({ DataGrid, GRID_CHART_CELLS, GRID_DATA_CHARTS, gridSeries, h, setText }));
  const CHART_CELL_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.loadChartCells = function () {
    return this.chartCellLoad ||= loadPart(CHART_CELL_PART).then(() => {
      this.version++; this.scheduleRender();
      const drawer = this.recordDrawer;
      if (drawer?.isConnected && drawer._cxRecord) drawer._cxPaint(drawer._cxRecord, drawer._cxIndex);
    }, error => { this.chartCellLoad = null; this.emit("error", { error }); });
  };
  DataGrid.prototype.initializeState = function () {
    const ready = CHART_CELL_INIT.call(this);
    return [...this.columns, ...(this.view.record?.fields || [])].some(column => GRID_CHART_CELL_KINDS.includes(column.presenter?.kind))
      ? Promise.all([ready, this.loadChartCells()]).then(([result]) => result) : ready;
  };
