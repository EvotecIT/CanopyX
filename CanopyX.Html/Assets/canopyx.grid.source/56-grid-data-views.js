// Optional dataset comparison and view intents share the existing part loader.
const GRID_COMPARE = definePart(DataGrid, "compare", "dataset comparison", () => ({ DataGrid, h, setText, fill, plural, cellValue, numberFormat, gridQueryStart, gridQuery }));
const GRID_VIEW_INTENTS = definePart(DataGrid, "view-intents", "view intents", () => ({ DataGrid, h, setText, fill, gridButton, gridVariant, gridQuery, gridQueryStart, gridFreeze, GRID_FILTER_LABELS, GRID_REPORTING, watchOverlayTheme }));
for (const name of ["getViewIntent", "validateViewIntent", "previewViewIntent", "applyViewIntent"]) {
  const stub = DataGrid.prototype[name] = function (...args) {
    return loadPart(GRID_VIEW_INTENTS).then(() => {
      if (this.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
      if (DataGrid.prototype[name] === stub) throw new Error("CanopyX: view intents did not install " + name + ".");
      return this[name](...args);
    });
  };
}
DataGrid.prototype.getOnlyChanges = function () { return false; };
DataGrid.prototype.setOnlyChanges = function (...args) { return loadPart(GRID_COMPARE).then(() => {
  if (this.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
  this.startDatasetCompare(); return this.setOnlyChanges(...args);
}); };
const DATA_VIEWS_INIT = DataGrid.prototype.initializeState;
DataGrid.prototype.initializeState = function () {
  const parts = [this.view.compare && loadPart(GRID_COMPARE), this.view.viewIntents && loadPart(GRID_VIEW_INTENTS)].filter(Boolean);
  if (!parts.length) return DATA_VIEWS_INIT.call(this);
  return Promise.all(parts).then(() => {
    if (this.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
    if (this.view.compare) this.startDatasetCompare(); return DATA_VIEWS_INIT.call(this);
  });
};
