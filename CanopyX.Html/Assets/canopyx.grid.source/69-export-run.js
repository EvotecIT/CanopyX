  // ---------- export runs shared by flat grids and trees ----------
  // A capture is taken at invocation; the writer runs once the export part is ready. Grid runtimes load that part on first
  // use (loadExportPart); the tree tools part includes the writers, so there it is ready at once.
  function gridOperationActive(grid, signal) {
    if (grid.destroyed || signal?.aborted) throw new DOMException("Grid cancelled.", "AbortError");
  }
  const exportPartReady = () => typeof loadExportPart === "function" ? loadExportPart() : Promise.resolve();
  // The writer options are checked when the export part runs the capture.
  function exportAs(grid, format, options = {}) {
    const { onProgress, timeoutMs, download, ...capture } = options, prepared = grid.prepareExport(capture);
    return exportPartReady().then(() => EXPORT_IMPL.run(grid, format, options, prepared));
  }