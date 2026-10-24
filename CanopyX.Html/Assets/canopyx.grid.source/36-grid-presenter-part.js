  // The painter loads with declarative columns. Plain grids keep query and ordinary cell painting in the core.
  const GRID_PRESENTER_IMPL = {}, GRID_PRESENTERS = definePart(DataGrid, "presenters", "cell presenters", () => ({
    GRID_PRESENTER_IMPL, h, setText, fill, cellValue, cellText, isCellObject, gridNumericTone, gridValueTone,
    gridPresenterTone, gridPresenterLink, numberFormat, toneColors, toneOf, applyTone, gridIcon, badgeElement,
    GRID_HISTORY_KINDS, GRID_HISTORY_IMPL, RECORD_IMPL
  }));
  function gridCellRenderer(grid, column, options, record = false, complete = false) {
    let paint;
    return (row, element) => {
      if (!GRID_PRESENTER_IMPL.create) return false;
      return (paint ||= GRID_PRESENTER_IMPL.create(grid, column, options, record, complete))(row, element);
    };
  }
  DataGrid.prototype.loadPresenters = function () {
    return this.presenterLoad ||= loadPart(GRID_PRESENTERS).then(() => { this.version++; this.scheduleRender(); });
  };
