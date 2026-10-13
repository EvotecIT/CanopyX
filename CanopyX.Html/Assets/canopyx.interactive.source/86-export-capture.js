  // ---------- export format providers and tree export captures ----------
  // A format provider turns a prepared export capture into a file: { id, label, extension, mime?, write(capture, context) },
  // where write returns a Blob (or bytes) or a promise of one. Formats register for the page (CanopyX.registerExportFormat)
  // or per grid (the exportFormats option, ids of registered formats or provider objects); a grid view can declare the ids
  // of the registered formats it offers. Captures happen synchronously; the writer runs in the export part, which grid
  // runtimes load on first use and the interactive tree runtime includes.
  const EXPORT_FORMATS = new Map(), EXPORT_IMPL = {}, exportFormatId = id => typeof id === "string" && /^[a-z][a-z\d-]{0,31}$/.test(id);
  const exportFormatIds = list => Array.isArray(list) && new Set(list).size === list.length && list.every(exportFormatId);
  function exportFormat(format) {
    if (!format || !exportFormatId(format.id) || format.id === "csv" ||
        typeof format.label !== "string" || !format.label.trim() || typeof format.extension !== "string" || !/^[a-z\d]{1,16}$/i.test(format.extension) ||
        format.mime !== undefined && typeof format.mime !== "string" || typeof format.write !== "function")
      throw new Error("CanopyX: invalid export format.");
    return Object.freeze({ id: format.id, label: format.label, extension: format.extension, mime: format.mime || "application/octet-stream", write: format.write });
  }
  /** Registers a format for every grid on the page that does not choose its own; returns a disposer for this registration. */
  function registerExportFormat(format) {
    format = exportFormat(format); EXPORT_FORMATS.set(format.id, format);
    return () => EXPORT_FORMATS.get(format.id) === format && EXPORT_FORMATS.delete(format.id);
  }
  // Writers and host export hooks run under this safety timeout, separately from each source request's deadline.
  function exportTimeout(grid, options) {
    const timeout = options?.timeoutMs ?? grid.opts.exportTimeoutMs ?? 600000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647) throw new Error("CanopyX: invalid export timeout.");
    return timeout;
  }
  const exportPartReady = () => typeof loadExportPart === "function" ? loadExportPart() : Promise.resolve();
  // The capture is taken now; the writer options are checked when the export part runs it.
  function exportAs(grid, format, options = {}) {
    const { onProgress, timeoutMs, download, ...capture } = options, prepared = grid.prepareExport(capture);
    return exportPartReady().then(() => EXPORT_IMPL.run(grid, format, options, prepared));
  }

  TreeGrid = class extends TreeGrid {
    interactionApi() {
      return Object.assign(super.interactionApi(), { prepareExport: this.prepareExport.bind(this), exportAs: this.exportAs.bind(this) });
    }

    /** Captures the visible rows, or the loaded selected nodes in tree order, with their level and id path. */
    prepareExport(options = {}) {
      const { scope = "visible", values = "display", signal } = options;
      if (this.destroyed || !["visible", "selected"].includes(scope) || !["raw", "display"].includes(values) || signal !== undefined && !(signal instanceof AbortSignal))
        throw new Error("CanopyX: invalid tree export.");
      const ids = options.columns ?? this.visibleColumns().map(column => column.id);
      const columns = Array.isArray(ids) ? ids.map(id => this.columns.find(column => column.id === id)) : [];
      if (!columns.length || columns.some(column => !column) || new Set(ids).size !== ids.length) throw new Error("CanopyX: invalid export columns.");
      const picked = scope === "visible" ? this.rows.filter(w => !w.status) : [], walk = parent => this.modelChildren(parent).forEach(w => { if (this.selected.has(w)) picked.push(w); walk(w); });
      if (scope !== "visible") walk(this.root);
      const rows = picked.filter(w => !w.h.detail).map(w => ({ id: w.key, level: w.level, path: this.pathOf(w), node: { ...w.h } }));
      const request = Object.freeze({ kind: "tree", scope, presentation: "text", values, revision: this.datasetRevision, recordCount: rows.length,
        columns: Object.freeze(columns.map(({ id, title, kind }) => Object.freeze({ id, title, kind }))), locale: this.lang, timeZone: this.local ? "local" : "utc" }), grid = this;
      return Object.freeze({ request, rows: async function* (more) {
        const linked = AbortSignal.any([grid.lifetime.signal, signal, more?.signal].filter(Boolean));
        await exportPartReady(); yield* EXPORT_IMPL.treeRows(grid, request, rows, linked);
      } });
    }

    exportAs(format, options) { return exportAs(this, format, options); }
  };