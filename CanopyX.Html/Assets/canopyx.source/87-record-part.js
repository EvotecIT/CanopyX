  // ---------- record panel: the rich record drawer comes with a part ----------
  // A view with a record panel (view.record), a structured cell summary or a record deep link loads the record panel part
  // (canopyx.record-panel.source, docs/record-panel.md): drawer sections, tabs, structured values, collections, related
  // records, timelines, deep links and record actions for flat grids and trees. The part is one definition shared by both
  // view kinds; a flat grid's runtime hands it the grid helpers through RECORD_IMPL.grid (52-grid-record-part.js).
  // openRecord loads the part and runs again; a view that cannot load it keeps its plain drawer and reports the error.
  const RECORD_IMPL = {}, RECORD_PART = definePart(TreeGrid, "record-panel", "record panel", () => ({ RECORD_IMPL, TreeGrid, h, setText, fill,
    cellText, cellValue, isCellObject, formatValue, toneOf, applyTone, toneColors, badgeElement, loadSidecar, requireIdentifier, validateGridRows, PROTOCOL, foldText, createTreeGrid, svgIcon, gridExportField }));
  function loadRecordPanel() { return loadPart(RECORD_PART); }
  // A cell holds a structured value (a list, an object, a collection, a timeline or changes) or a link to another record.
  const RECORD_STRUCTURE = ["items", "fields", "records", "events", "changes", "ref"];
  /** Whether a node's drawer needs the part: a declared record panel, record fields or a structured cell. */
  TreeGrid.prototype.recordNeeded = function (node) {
    return !!this.view.record || !!node && (!!node.fields || Object.values(node.cells || {}).some(cell => isCellObject(cell) && RECORD_STRUCTURE.some(name => cell[name] !== undefined)));
  };
  /** Opens a record by id in the record drawer, also one outside the loaded rows (a deep link or a related record). */
  TreeGrid.prototype.openRecord = function (id, options) { return loadRecordPanel().then(() => RECORD_IMPL.open(this, id, options)); };
  // A view with record deep links reads the address once its rows are ready, and again when the fragment changes.
  function recordStart(grid) {
    if (grid.view.record?.deepLink) loadRecordPanel().then(() => RECORD_IMPL.start(grid), error => grid.emit("error", { error }));
  }
