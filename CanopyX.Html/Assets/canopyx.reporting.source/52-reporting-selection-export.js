  // ---------- selected-query exports capture criteria/exclusions independently of UI changes ----------
  const SELECTION_EXPORT_PREPARE = DataGrid.prototype.prepareExport, SELECTION_EXPORT_ROWS = DataGrid.prototype.exportRows,
    SELECTION_EXPORT_TEXT = DataGrid.prototype.exportText;
  DataGrid.prototype.prepareExport = function (options) {
    if (options?.scope !== "selected" || !this.querySelection) return SELECTION_EXPORT_PREPARE.call(this, options);
    const selection = this.getSelectionDescriptor(), exported = SELECTION_EXPORT_PREPARE.call(this, { ...options, scope: "filtered" });
    const request = gridFreeze({ ...exported.request, scope: "selected", query: selection.query,
      revision: selection.revision, matched: selection.matched, selection: [], querySelection: selection });
    const signal = options.signal;
    return Object.freeze({ request, rows: () => this.exportRows(request, signal) });
  };
  DataGrid.prototype.exportRows = async function* (request, signal) {
    if (!request.querySelection) { yield* SELECTION_EXPORT_ROWS.call(this, request, signal); return; }
    const excluded = new Set(request.querySelection.excludedIds);
    for await (const row of SELECTION_EXPORT_ROWS.call(this, { ...request, scope: "filtered" }, signal))
      if (!excluded.delete(row.id)) yield row;
    if (excluded.size) throw new Error("CanopyX: excluded records are absent from the accepted query revision.");
  };
  DataGrid.prototype.exportText = async function (exported, maxRows = 50000, delimiter, signal) {
    const selection = exported.request.querySelection;
    if (selection && selection.matched !== null && Number.isInteger(maxRows) && maxRows >= 1 && maxRows <= 1000000 &&
        selection.matched - selection.excludedIds.length > maxRows)
      throw new Error("CanopyX: export exceeds the client row limit; use a host export hook.");
    return SELECTION_EXPORT_TEXT.call(this, exported, maxRows, delimiter, signal);
  };
