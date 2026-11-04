  // ---------- captured delivery metadata and bounded read-only host snapshots ----------
  const DELIVERY_PREPARE = DataGrid.prototype.prepareExport, DELIVERY_TEXT = DataGrid.prototype.exportText,
    DELIVERY_API = GRID_REPORTING.api, DELIVERY_CALLBACKS = new WeakMap(), DELIVERY_PRINT = DataGrid.prototype.print;
  function reportingExportTotal(request) {
    return request.recordCount;
  }
  function reportingFileName(value) {
    if (typeof value !== "string" || !value || value.length > 100 || value !== value.trim() ||
        /[\\/:*?"<>|\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(value) ||
        /^\.|[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))
      throw new Error("CanopyX: export file name must be a safe basename of at most 100 characters.");
    requireIdentifier(value, "export file name"); return value;
  }
  function reportingExportProgress(grid, request, callback, signal) {
    const total = reportingExportTotal(request); let completed = 0, phase = "reading";
    const order = { reading: 0, generating: 1, ready: 2 };
    return (next, count = completed) => {
      if (grid.destroyed || signal?.aborted) return;
      if (!Object.hasOwn(order, next) || order[next] < order[phase] || !Number.isSafeInteger(count) || count < completed ||
          total !== null && count > total) throw new Error("CanopyX: invalid export progress.");
      completed = count; phase = next;
      callback?.(Object.freeze({ phase, completed, total })); return completed;
    };
  }
  async function reportingExportSnapshot(grid, exported, maxRows, signal, progress) {
    await loadExportPart();
    return EXPORT_IMPL.snapshot(grid, exported, maxRows, signal, progress);
  }
  GRID_REPORTING.api = (api, grid) => {
    DELIVERY_API?.(api, grid);
    api.materializeExport = grid.materializeExport.bind(grid);
    api.print = grid.print.bind(grid);
  };
  Object.assign(DataGrid.prototype, {
    prepareExport(options) {
      if (options?.onProgress !== undefined && typeof options.onProgress !== "function") throw new Error("CanopyX: export progress needs a callback.");
      const ordinary = options?.pivot === true ? null : DELIVERY_PREPARE.call(this, options);
      let locale = this.lang;
      if (options.locale !== undefined) {
        if (typeof options.locale !== "string" || options.locale.length > 128)
          throw new Error("CanopyX: export locale must be supported by this browser.");
        try {
          locale = Intl.getCanonicalLocales(options.locale)[0];
          if (!Intl.NumberFormat.supportedLocalesOf(locale).length) throw new Error();
        } catch { throw new Error("CanopyX: export locale must be supported by this browser."); }
      }
      if (options.timeZone !== undefined && !["utc", "local"].includes(options.timeZone)) throw new Error("CanopyX: export time zone is utc or local.");
      const pivot = options.pivot === true ? GRID_REPORTING.preparePivotExport?.(this, {
        ...options, locale, timeZone: options.timeZone || (this.local ? "local" : "utc")
      }) : null;
      if (options.pivot === true && !pivot) throw new Error("CanopyX: pivot table capture requires an active pivot producer.");
      const exported = pivot || ordinary;
      const fileName = reportingFileName(options.fileName ?? ("canopyx-" + this.view.id.replace(/[^a-z0-9_-]/gi, "_")).slice(0, 100));
      const request = gridFreeze({ ...exported.request, locale, fileName, timeZone: options.timeZone || exported.request.timeZone,
        formatRules: pivot ? exported.request.formatRules || [] : this.getFormatRules(), generatedAt: new Date().toISOString(),
        columns: pivot ? exported.request.columns : exported.request.columns.map(column => GRID_REPORTING.exportColumn(this, this.columns.find(item => item.id === column.id))) }), grid = this,
        signal = options.signal, callback = options.onProgress;
      if (!pivot) GRID_REPORTING.captureExport(this, request);
      const result = Object.freeze({ request, rows: async function* (options) {
        const enumerationSignal = gridExportSignal(signal, options);
        const progress = reportingExportProgress(grid, request, callback, enumerationSignal); let count = 0;
        progress("reading", 0);
        for await (const row of grid.exportRows(request, enumerationSignal)) { yield row; if (++count % 100 === 0) progress("reading", count); }
        progress("generating", count);
      } });
      DELIVERY_CALLBACKS.set(result, callback); return result;
    },
    async exportText(exported, maxRows, delimiter, signal) {
      let count = 0;
      const rows = async function* () { for await (const row of exported.rows()) { count++; yield row; } };
      const text = await DELIVERY_TEXT.call(this, { request: exported.request, rows }, maxRows, delimiter, signal);
      reportingExportProgress(this, exported.request, DELIVERY_CALLBACKS.get(exported), signal)("ready", count); return text;
    },
    materializeExport(options) {
      const exported = this.prepareExport(options), maxRows = options.maxRows ?? 1000, callback = DELIVERY_CALLBACKS.get(exported);
      return this.runGridHook(async signal => {
        const progress = reportingExportProgress(this, exported.request, callback, signal);
        const result = await reportingExportSnapshot(this, exported, maxRows, signal, progress);
        progress("ready", result.rows.length); return result;
      }, options.signal);
    },
    print(options) {
      if (typeof this.opts.onPrint !== "function") return DELIVERY_PRINT.call(this, options);
      const exported = this.prepareExport(options), maxRows = options.maxRows ?? 1000, callback = DELIVERY_CALLBACKS.get(exported),
        layout = this.layoutMode === "cards" ? "stacked" : "table";
      return this.runGridHook(async signal => {
        const progress = reportingExportProgress(this, exported.request, callback, signal);
        const snapshot = await reportingExportSnapshot(this, exported, maxRows, signal, progress);
        // Print never scrolls: a grid in the card layout asks for stacked records, every other layout for a table.
        await this.opts.onPrint({ snapshot, signal, layout }); gridOperationActive(this, signal); progress("ready", snapshot.rows.length);
      }, options.signal);
    },
    exportToHost(format, options) {
      const exported = this.prepareExport(options), { request } = exported, callback = DELIVERY_CALLBACKS.get(exported);
      if (typeof format !== "string" || !format.trim() || typeof this.opts.onExport !== "function") throw new Error("CanopyX: host export needs a format and an onExport hook.");
      return this.runGridHook(async signal => {
        const progress = reportingExportProgress(this, request, callback, signal); progress("reading", 0);
        let completed = 0;
        await this.opts.onExport({ format, request, capture: exported, signal, reportProgress: (phase, count) => { completed = progress(phase, count); } });
        gridOperationActive(this, signal); progress("ready", reportingExportTotal(request) ?? completed);
      }, options.signal, exportTimeout(this, options));
    }
  });
