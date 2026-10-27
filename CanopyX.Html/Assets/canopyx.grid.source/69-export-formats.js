  // Built-in descriptors and capture format selection are needed only by export-capable views.
  const OFFICE_EXPORT_PART = { name: "office-export", label: "Office export writers", parts: {}, context: () => ({ EXPORT_IMPL }) };
  const officeExportWrite = (capture, context) => loadPart(OFFICE_EXPORT_PART).then(() => EXPORT_IMPL.office(capture, context));
  function officeExportFormats(grid) {
    return [{ id: "xlsx", label: grid.labels.gridDownloadXlsx, extension: "xlsx", values: "raw",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", write: officeExportWrite },
    { id: "pdf", label: grid.labels.gridDownloadPdf, extension: "pdf", values: "raw", mime: "application/pdf", write: officeExportWrite }];
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
