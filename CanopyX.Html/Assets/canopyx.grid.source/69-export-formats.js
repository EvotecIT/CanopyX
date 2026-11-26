  // Built-in descriptors and capture format selection are needed only by export-capable views.
  // Writers and host export hooks run under this safety timeout, separately from each source request's deadline.
  function exportTimeout(grid, options) {
    const timeout = options?.timeoutMs ?? grid.opts.exportTimeoutMs ?? 600000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647) throw new Error("CanopyX: invalid export timeout.");
    return timeout;
  }
  const OFFICE_EXPORT_PART = { name: "office-export", label: "Office export writers", parts: {}, context: () => ({ EXPORT_IMPL }) };
  const officeExportWrite = (capture, context) => loadPart(OFFICE_EXPORT_PART).then(() => EXPORT_IMPL.office(capture, context));
  // CSV files come from OfficeIMO's CSV writer in the lazy csv-export part. The format is built in: "csv" is not a registrable id.
  const CSV_EXPORT_PART = { name: "csv-export", label: "CSV export writer", parts: {}, context: () => ({ EXPORT_IMPL }) };
  EXPORT_IMPL.csvFormat = grid => Object.freeze({ id: "csv", label: grid.labels.gridDownloadCsv, extension: "csv", mime: "text/csv;charset=utf-8", showInMenu: false,
    write: (capture, context) => loadPart(CSV_EXPORT_PART).then(() => EXPORT_IMPL.csv(capture, context, grid.columns[0]?.id)) });
  // A paged PDF of many thousand rows runs into the writer's page limit part way through. Above this many records the PDF
  // writer refuses at once and points to the workbook, which streams any size. A source without a count stops at the limit.
  const PDF_ROW_LIMIT = 20000;
  function pdfRowLimit(grid, capture) {
    const refuse = () => new Error(fill(grid.labels.gridExportPdfTooLarge, { limit: numberFormat(grid.lang).format(PDF_ROW_LIMIT) }));
    if (capture.request.recordCount !== null && capture.request.recordCount > PDF_ROW_LIMIT) throw refuse();
    return Object.freeze({ request: capture.request, rows: async function* (options) {
      let count = 0;
      for await (const row of capture.rows(options)) { if (++count > PDF_ROW_LIMIT) throw refuse(); yield row; }
    } });
  }
  function officeExportFormats(grid) {
    return [{ id: "xlsx", label: grid.labels.gridDownloadXlsx, extension: "xlsx", values: "raw",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", write: officeExportWrite },
    { id: "pdf", label: grid.labels.gridDownloadPdf, extension: "pdf", values: "raw", mime: "application/pdf",
      write: (capture, context) => officeExportWrite(pdfRowLimit(grid, capture), context) }];
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
