  // ---------- column groups and cell ranges come with parts ----------
  // Multi-level headers (canopyx.column-groups.source) and cell ranges with the clipboard (canopyx.cell-range.source) ship
  // in canopyx-column-groups.js and canopyx-cell-range.js (Build/parts.json), outside the grid entry points. A grid whose
  // view declares columnGroups, or turns rangeSelection on, loads the part with its first query and is ready once both are.
  // Until a part is in, its reads answer empty and its actions load it first. A part that cannot load is reported as the
  // grid's error; the grid keeps working with plain headers or without cell ranges.
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridCellRangeSelected: "{rows} rows × {columns} columns selected", gridCellRangesSelected: "{ranges} ranges selected, {cells} cells",
    gridCellRangeCleared: "Cell selection cleared", gridCopyCells: "Copy cells", gridCopyCellsWithHeaders: "Copy cells with headers",
    gridPasteCells: "Paste", gridSelectAllCells: "Select all cells", gridCellsCopied: "Copied {rows} rows × {columns} columns",
    gridCellsPasted: "Pasted {count} cells", gridPasteRefused: "{count} cells were not pasted", gridPasteReadOnly: "This cell cannot be changed.",
    gridPasteType: "“{value}” is not a valid value for {column}.", gridPasteReport: "Paste report", gridPasteCell: "Row {row}, {column}: {reason}",
    gridFillHandle: "Drag to fill the cells below", gridCellsFilled: "Filled {count} cells", gridCellMenu: "Cell actions", gridClearCellRanges: "Clear cell selection"
  }));
  const GRID_PART_CONTEXT = () => ({ DataGrid, h, setText, fill, columnWidth, foldText, gridButton, gridIcon, gridDecorateButton,
    cellText, cellValue, isCellObject, numberFormat, gridFreeze, gridMomentFromParts, requireIdentifier, loadGridFilterEditor, CELL_CONTROLS, reachable, gridExportField, bindContextMenu });
  const GRID_COLUMN_GROUPS = definePart(DataGrid, "column-groups", "column groups", GRID_PART_CONTEXT);
  const GRID_CELL_RANGE = definePart(DataGrid, "cell-range", "cell ranges", GRID_PART_CONTEXT);
  // The API members the parts implement; createDataGrid looks them up on each call, so they switch to a part once it is in.
  // Before that the reads (the first of each list) answer empty and the actions load the part and run. Actions run at once
  // when the part is in, and always answer with a promise that rejects when they fail; they never raise the error event,
  // which reports failures of the grid's own work (a part loading for the view, input, menus).
  // Each entry declares one synchronous read followed by its asynchronous actions; a part may have several reads.
  const GRID_PART_API = [["column-groups", "getColumnGroups", "setColumnGroupVisible"], ["column-groups", "getColumnBands"],
    ["cell-range", "getCellRanges", "setCellRanges", "clearCellRanges", "selectAllCells", "copyCellRanges", "getCellRangeText", "pasteCells"]];
  const gridPartLoader = (part, start) => function () {
    return (this.partLoads ||= {})[start] ||= loadPart(part).then(() => this.destroyed || this["start" + start]()).catch(error => { this.partLoads[start] = null; throw error; });
  };
  DataGrid.prototype.loadColumnGroups = gridPartLoader(GRID_COLUMN_GROUPS, "ColumnGroups");
  DataGrid.prototype.loadCellRanges = gridPartLoader(GRID_CELL_RANGE, "CellRanges");
  for (const [part, read, ...actions] of GRID_PART_API) {
    const load = part === "cell-range" ? "loadCellRanges" : "loadColumnGroups";
    DataGrid.prototype[read] = () => [];
    for (const name of actions) {
      const stub = DataGrid.prototype[name] = function (...args) {
        return this[load]().then(() => { if (DataGrid.prototype[name] === stub) throw new Error("CanopyX: the " + part + " part did not install " + name + "."); return this[name](...args); });
      };
    }
  }
  const GRID_PARTS_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const ready = GRID_PARTS_INIT.call(this), range = this.opts.rangeSelection ?? this.view.rangeSelection;
    const parts = [this.view.columnGroups?.length && this.loadColumnGroups(), range && range.enabled !== false && this.loadCellRanges()].filter(Boolean);
    return parts.length ? Promise.all([ready, ...parts.map(part => part.catch(error => this.emit("error", { error })))]).then(([result]) => result) : ready;
  };
