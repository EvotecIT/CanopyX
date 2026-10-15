  // ---------- pager controls: page-size choices, numbered pages and the result sentence come with a part ----------
  // A paged grid whose view sets pager loads canopyx-pager.js (Build/parts.json) with its first query, and keeps the
  // built-in pager hidden until the part rebuilds it; if the part cannot load, the built-in pager returns and the error is
  // reported. A grid created after the part installed builds its pager at once.
  const GRID_PAGER_IMPL = {}, GRID_PAGER = definePart(DataGrid, "pager", "pager controls",
    () => ({ DataGrid, GRID_PAGER_IMPL, h, setText, fill, gridButton, gridOption, numberFormat, gridCountLabel }));
  const GRID_PAGER_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const ready = GRID_PAGER_INIT.call(this);
    return !this.pager || !this.view.pager || GRID_PAGER_IMPL.installed ? ready : Promise.all([ready, loadPart(GRID_PAGER).then(() => this.destroyed || this.buildPager())
      .catch(error => { this.pager.hidden = this.opts.toolbar === false; this.emit("error", { error }); })]).then(([result]) => result);
  };
