  // The painter loads with declarative columns. Plain grids keep query and ordinary cell painting in the core.
  const GRID_PRESENTER_IMPL = {}, GRID_PRESENTERS = definePart(DataGrid, "presenters", "cell presenters", () => ({
    GRID_PRESENTER_IMPL, h, setText, fill, cellValue, cellText, changeCellText, isCellObject, columnNumericTone, columnValueTone,
    gridPresenterTone, gridPresenterLink, numberFormat, toneColors, toneOf, applyTone, gridIcon, badgeElement,
    GRID_HISTORY_KINDS, GRID_HISTORY_IMPL, GRID_CHART_CELL_KINDS, GRID_CHART_CELLS, RECORD_IMPL, DataGrid, definePart, loadPart, formatValue
  }));
  function gridCellRenderer(grid, column, options, record = false, complete = false) {
    let paint;
    return (row, element) => {
      if (!GRID_PRESENTER_IMPL.create) return false;
      return (paint ||= GRID_PRESENTER_IMPL.create(grid, column, options, record, complete))(row, element);
    };
  }
  DataGrid.prototype.loadPresenters = function () {
    // The part then starts the parts its columns need (the activity part, 36-grid-presenter-activity.js).
    return this.presenterLoad ||= loadPart(GRID_PRESENTERS).then(() => { this.version++; this.scheduleRender(); return GRID_PRESENTER_IMPL.ready(this); });
  };
