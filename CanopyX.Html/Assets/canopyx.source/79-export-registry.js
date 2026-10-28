  // ---------- export format registry ----------
  // A format provider turns a prepared export capture into a file: { id, label, extension, mime?, showInMenu?, write(capture, context) },
  // where write returns a Blob (or bytes) or a promise of one. Formats register for the page (CanopyX.registerExportFormat)
  // or per grid (the exportFormats option, ids of registered formats or provider objects); a view can declare the ids
  // of the registered formats it offers. Every runtime keeps the registry, so a host registers its writers before or after
  // the tree tools part or the export part installs; captures and writers run in those parts.
  const EXPORT_FORMATS = new Map(), EXPORT_IMPL = {}, exportFormatId = id => typeof id === "string" && /^[a-z][a-z\d-]{0,31}$/.test(id);
  const exportFormatIds = list => Array.isArray(list) && new Set(list).size === list.length && list.every(exportFormatId);
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
