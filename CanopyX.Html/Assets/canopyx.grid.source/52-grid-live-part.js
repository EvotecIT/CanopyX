  // ---------- live data: rows that change in place come with a part (docs/live-data.md) ----------
  // Transactions (add, update, remove), the batched update rate, the stable order with its "Order changed" prompt, changed
  // cells that flash, polling and the revision-aware refresh of hosted grids ship in canopyx-live.js (Build/parts.json). A
  // grid whose view or options declare live loads the part with its first query and is ready once both are; any other grid
  // loads it on the first live call. Until it installs nothing has changed: the actions load it first and getLiveState
  // answers from the grid. A part that cannot load is reported as the grid's error; the grid keeps its rows.
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridLiveOrderChanged: "Order changed", gridLiveResort: "Re-sort", gridLiveNewData: "New data", gridLiveRefresh: "Refresh",
    gridLiveOrderHint: "Rows keep their places while data changes. Re-sort to move them where the sort puts them.",
    gridLiveChanged: "Rows changed: {added} added, {updated} updated, {removed} removed", gridLiveSorted: "Rows moved to their sorted places.",
    gridLiveRecordRemoved: "This record was removed."
  }));
  const GRID_LIVE = definePart(DataGrid, "live", "live data", () => ({ DataGrid, h, setText, fill, gridButton, gridIcon, gridQuery, gridResultShape,
    gridQueryRows, gridCompare, gridOrder, gridIdOrder, validateGridRows, validateGridPage, validateGridCursorPage, gridFreeze, requireIdentifier, checkDocument,
    cellValue, PROTOCOL, GRID_REPORTING, VIEW_MODES, inlineGridSource }));
  // The API members the part implements; createDataGrid looks them up on each call, so they switch to the part once it is in.
  const GRID_LIVE_API = ["applyTransaction", "addRows", "updateRows", "removeRows", "setRows", "flushTransactions", "refreshRows", "resort", "poll"];
  for (const name of GRID_LIVE_API) DataGrid.prototype[name] = function (...args) { return this.loadLive().then(() => this[name](...args)); };
  Object.assign(DataGrid.prototype, {
    loadLive() {
      if (this.view.rowIdentity === "ordinal") return Promise.reject(new Error("CanopyX: ordinal row identity is snapshot-local; keyed live updates require stable row keys."));
      return this.liveLoad ||= loadPart(GRID_LIVE).then(() => this.destroyed || this.startLive()).catch(error => { this.liveLoad = null; throw error; });
    },
    getLiveState() {
      return this.liveStatus ? this.liveStatus() : gridFreeze({ orderChanged: false, newData: false, pending: 0, polling: false, revision: this.snapshot?.revision ?? null });
    }
  });
  const GRID_LIVE_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const ready = GRID_LIVE_INIT.call(this);
    return this.view.live && this.opts.live !== false || this.opts.live ? Promise.all([ready, this.loadLive().catch(error => this.emit("error", { error }))]).then(([result]) => result) : ready;
  };
