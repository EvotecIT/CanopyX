  // ---------- presenters part: the activity part with relative times and logs ----------
  // Their painting (canopyx.activity.source) ships in canopyx-activity.js. The presenters part loads it with its own load when a
  // column or record field needs it, so a grid's first query waits for both; a cell painted earlier shows its text and asks.
  const GRID_ACTIVITY = {}, GRID_ACTIVITY_KINDS = ["relativeTime", "log"];
  const GRID_ACTIVITY_PART = definePart(DataGrid, "activity", "relative time and log cells", () => ({
    GRID_ACTIVITY, h, setText, fill, cellValue, cellText, formatValue, isCellObject, gridPresenterTone, toneOf, applyTone, gridIcon }));
  DataGrid.prototype.loadActivity = function () {
    return this.activityLoad ||= loadPart(GRID_ACTIVITY_PART).then(() => {
      this.version++; this.scheduleRender();
      const drawer = this.recordDrawer;
      if (drawer?.isConnected && drawer._cxRecord) drawer._cxPaint(drawer._cxRecord, drawer._cxIndex);
    }, error => this.emit("error", { error }));
  };
  function gridPresenterReady(grid) {
    return [...grid.columns, ...(grid.view.record?.fields || [])].some(column => GRID_ACTIVITY_KINDS.includes(column.presenter?.kind)) && grid.loadActivity();
  }
