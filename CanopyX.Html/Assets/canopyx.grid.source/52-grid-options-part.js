  const GRID_OPTIONS_PART = definePart(DataGrid, "grid-options", "grid footer and query extensions", () => ({
    DataGrid, GRID_OPTIONS, GRID_OPTION_GRIDS, h, setText, fill, gridQuery, gridQueryRows, gridCompare, gridKeyCompare, gridSortScalar,
    gridMatches, gridMatchesGroup, gridResultShape, GRID_REPORTING, gridScalar, gridFreeze, gridOperationActive, numberText, isCellObject, cellValue,
    requireIdentifier, validStructuralCount, PROTOCOL
  }));
  const OPTIONS_REQUEST = DataGrid.prototype.requestPage;
  DataGrid.prototype.requestPage = async function(query, signal) {
    if (!gridOptionsUsed(this.view, this.plugins)) return OPTIONS_REQUEST.call(this, query, signal);
    await loadPart(GRID_OPTIONS_PART);
    gridOperationActive(this, signal);
    GRID_OPTIONS.attach(this);
    const page = await OPTIONS_REQUEST.call(this, query, signal);
    return GRID_OPTIONS.page(this, query, signal, page);
  };
