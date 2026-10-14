  // ---------- history presenters: the status strip and the sparklines come with a part ----------
  // Their drawing (37-grid-history.js) ships in canopyx-history.js (Build/history-parts.json), outside the grid entry points.
  // A grid with such a column starts loading the part with its first query, whose order it does not change (a host query
  // or a remembered view still wins), and is ready once both are; a history cell painted earlier asks for the part too and
  // is drawn when it arrives. A grid whose part cannot load keeps its other cells, leaves those empty and reports the error.
  const GRID_HISTORY_IMPL = {}, GRID_HISTORY = { key: "CanopyXHistory", name: "history", label: "history presenters", version: "__CX_HISTORY_VERSION__",
    script: "__CX_HISTORY_SCRIPT__", context: () => ({ GRID_HISTORY_IMPL, h, setText, fill, gridSeries, gridPresenterTone, toneColors, toneOf, GRID_TONE_RANK }) };
  const GRID_HISTORY_INIT = DataGrid.prototype.initializeState;
  // One load per grid: history cells painted while it runs, or after it failed, neither request the part again nor repeat the error.
  DataGrid.prototype.loadHistory = function () {
    return this.historyLoad ||= loadPart(GRID_HISTORY).then(() => { this.version++; this.scheduleRender(); }, error => this.emit("error", { error }));
  };
  DataGrid.prototype.initializeState = function () {
    const ready = GRID_HISTORY_INIT.call(this);
    return this.columns.some(column => GRID_HISTORY_KINDS.includes(column.presenter?.kind)) ? Promise.all([ready, this.loadHistory()]).then(([result]) => result) : ready;
  };
