  const GRID_OPTIONS_PART = definePart(DataGrid, "grid-options", "grid footer and query extensions", () => ({
    DataGrid, validateGridPage, GRID_OPTIONS, GRID_OPTION_GRIDS, h, setText, fill, gridQuery, gridQueryRows, gridCompare, gridKeyCompare, gridSortScalar,
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

  // Source-backed ranges share the optional query extensions; ordinary views keep the core asset budget.
  DataGrid.prototype.selectRowRange = async function(start, end, options = {}) {
    this.selectionController?.abort();
    const controller = this.selectionController = new AbortController(), epoch = this.queryEpoch;
    try {
      await loadPart(GRID_OPTIONS_PART);
      if (controller.signal.aborted || epoch !== this.queryEpoch) throw new DOMException("Selection was superseded.", "AbortError");
      return await this.readSelectionRange(start, end, options, controller);
    } finally {
      controller.abort();
      if (this.selectionController === controller) this.selectionController = null;
    }
  };
