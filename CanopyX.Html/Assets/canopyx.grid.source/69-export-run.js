  // ---------- export runs shared by flat grids and trees ----------
  // A capture is taken at invocation; the writer runs once the export part is ready. Flat grids and trees load that part on
  // first use (loadExportPart, 72-grid-export-controls.js and 50-tree-export.js).
  function gridOperationActive(grid, signal) {
    if (grid.destroyed || signal?.aborted) throw new DOMException("Grid cancelled.", "AbortError");
  }
  const exportPartReady = () => typeof loadExportPart === "function" ? loadExportPart() : Promise.resolve();
  // The writer options are checked when the export part runs the capture.
  function exportAs(grid, format, options = {}) {
    const { onProgress, timeoutMs, download, ...capture } = options, prepared = grid.prepareExport(capture);
    return exportPartReady().then(() => EXPORT_IMPL.run(grid, format, options, prepared));
  }