  // ---------- editing: typed editors, validation, changes, commit and undo come with a part ----------
  // The editors and everything around them (canopyx.editing.source) ship in canopyx-editing.js (Build/parts.json), outside
  // the grid entry points. A grid with an editable column loads the part with its first query and is ready once both are;
  // a grid without one loads it on the first editing call. Until it installs nothing can have changed, so the reads answer
  // empty and the actions load it first. A part that cannot load is reported as the grid's error and editing stays off.
  const GRID_EDITING = definePart(DataGrid, "editing", "editing", () => ({ DataGrid, h, setText, fill, gridButton, gridDecorateButton, GRID_ICONS,
    cellValue, cellText, isCellObject, gridFreeze, numberFormat, gridQuery, foldText, requireIdentifier, checkDocument, validateGridRows, inlineGridSource, PROTOCOL, boundedPattern, validateGridFacetPage }));
  const GRID_EDIT_INIT = DataGrid.prototype.initializeState;
  // The API members the part implements; createDataGrid looks them up on each call, so they switch to the part once it is in.
  // Until then the first six load the part and run, the next eight answer false and getChanges an empty list.
  const GRID_EDIT_API = ["beginEdit", "endEdit", "setCellValue", "validate", "commitRow", "commitChanges", "isEditing", "hasChanges", "undo", "redo",
    "canUndo", "canRedo", "cancelEdit", "revertChanges", "getChanges", "setReadOnly"];
  GRID_EDIT_API.forEach((name, index) => {
    DataGrid.prototype[name] = index < 6 ? function (...args) { return this.loadEditing().then(() => this[name](...args)); } : index < 14 ? () => false : () => [];
  });
  DataGrid.prototype.setReadOnly = function (value) { this.editReadOnly = !!value; };
  DataGrid.prototype.loadEditing = function () {
    return this.editLoad ||= loadPart(GRID_EDITING).then(() => this.startEditing()).catch(error => { this.editLoad = null; this.emit("error", { error }); throw error; });
  };
  DataGrid.prototype.initializeState = function () {
    const ready = GRID_EDIT_INIT.call(this);
    return this.columns.some(column => column.editable) ? Promise.all([ready, this.loadEditing().catch(() => {})]).then(([result]) => result) : ready;
  };
