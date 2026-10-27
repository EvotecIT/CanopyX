  // ---------- export format registry ----------
  // A format provider turns a prepared export capture into a file: { id, label, extension, mime?, showInMenu?, write(capture, context) },
  // where write returns a Blob (or bytes) or a promise of one. Formats register for the page (CanopyX.registerExportFormat)
  // or per grid (the exportFormats option, ids of registered formats or provider objects); a view can declare the ids
  // of the registered formats it offers. Every runtime keeps the registry, so a host registers its writers before or after
  // the tree tools part or the export part installs; captures and writers run in those parts.
  const EXPORT_FORMATS = new Map(), EXPORT_IMPL = {}, exportFormatId = id => typeof id === "string" && /^[a-z][a-z\d-]{0,31}$/.test(id);
  const exportFormatIds = list => Array.isArray(list) && new Set(list).size === list.length && list.every(exportFormatId);
  const OFFICE_EXPORT_PART = { name: "office-export", label: "Office export writers", parts: {}, context: () => ({ EXPORT_IMPL }) };
  const officeExportWrite = (capture, context) => loadPart(OFFICE_EXPORT_PART).then(() => EXPORT_IMPL.office(capture, context));
  function officeExportFormats(grid) {
    return [{ id: "xlsx", label: grid.labels.gridDownloadXlsx, extension: "xlsx", values: "raw",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", write: officeExportWrite },
    { id: "pdf", label: grid.labels.gridDownloadPdf, extension: "pdf", values: "raw", mime: "application/pdf", write: officeExportWrite }];
  }
  function exportFormat(format) {
    if (!format || !exportFormatId(format.id) || format.id === "csv" ||
        typeof format.label !== "string" || !format.label.trim() || typeof format.extension !== "string" || !/^[a-z\d]{1,16}$/i.test(format.extension) ||
        format.mime !== undefined && typeof format.mime !== "string" ||
        format.values !== undefined && !["raw", "display"].includes(format.values) ||
        format.showInMenu !== undefined && typeof format.showInMenu !== "boolean" || typeof format.write !== "function")
      throw new Error("CanopyX: invalid export format.");
    return Object.freeze({ id: format.id, label: format.label, extension: format.extension, mime: format.mime || "application/octet-stream",
      showInMenu: format.showInMenu !== false, values: format.values, write: format.write });
  }
  /** Registers a format for every grid on the page that does not choose its own; returns a disposer for this registration. */
  function registerExportFormat(format) {
    format = exportFormat(format); EXPORT_FORMATS.set(format.id, format);
    return () => EXPORT_FORMATS.get(format.id) === format && EXPORT_FORMATS.delete(format.id);
  }
  // Resolve once before a capture is taken. A format's writer and its captured fields then travel together, including
  // while a lazy export part loads. The host option wins, then declared ids, then registered and per-grid plugin formats.
  EXPORT_IMPL.formatsOf = function (grid) {
    const list = grid.opts.exportFormats ?? grid.view.exportFormats, known = new Map(EXPORT_FORMATS);
    if (list !== undefined) for (const format of officeExportFormats(grid)) if (!known.has(format.id)) known.set(format.id, exportFormat(format));
    for (const format of grid.plugins.filter(item => (grid.opts.plugins || []).some(local => local.name === item.name))
      .flatMap(item => item.exportFormats || [])) known.set(format.id, exportFormat(format));
    if (list === undefined) return [...known.values()];
    const formats = Array.isArray(list) ? list.map(item => typeof item === "string" ? known.get(item) : exportFormat(item)).filter(Boolean) : null;
    if (!formats || new Set(formats.map(format => format.id)).size !== formats.length) throw new Error("CanopyX: invalid exportFormats.");
    return formats;
  };
  // Writers and host export hooks run under this safety timeout, separately from each source request's deadline.
  function exportTimeout(grid, options) {
    const timeout = options?.timeoutMs ?? grid.opts.exportTimeoutMs ?? 600000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647) throw new Error("CanopyX: invalid export timeout.");
    return timeout;
  }
