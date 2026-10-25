  // ---------- explicit client export scope ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridExport: "Export", gridFilteredResults: "Filtered results", gridSelectedRows: "Selected rows",
    gridAllResults: "All results", gridVisibleRows: "Visible rows", gridAllRows: "All rows", gridDownloadCsv: "Download CSV", gridCopy: "Copy", gridDetails: "Record details",
    gridDownloadXlsx: "Download Excel", gridDownloadPdf: "Download PDF",
    gridExportProgress: "{completed} of {total} records", gridExportReading: "{completed} records",
    gridExportCancelled: "Export cancelled", gridCancelExport: "Cancel export", gridNoExportColumns: "No visible columns allow export."
  }));
  // The Export menu body, CSV, copy, the host export hook and format writers ship in the lazy export part. These methods
  // capture the export synchronously, so the accepted query, columns and selection are the ones at invocation, and finish
  // once the part is installed. They stay the same functions for the grid's lifetime, so reporting wrappers keep working.
  const GRID_EXPORT_PART=definePart(DataGrid,"export","export part",()=>({...FILTER_EDITOR.context(),EXPORT_IMPL,gridOperationActive,formatting,validateGridCursorPage,validateGridPage,gridFreeze,isCellObject,exportTimeout,exportFormat,EXPORT_FORMATS,gridExportField}));
  function loadExportPart(){return loadPart(GRID_EXPORT_PART);}
  for(const name of ["toCsv","copy","exportToHost"])DataGrid.prototype[name]=function(...args){
    const capture=this.prepareExport(args.at(-1));return loadExportPart().then(()=>EXPORT_IMPL[name].call(this,capture,...args));};
  for(const name of ["exportText","copyFocused"])DataGrid.prototype[name]=function(...args){return loadExportPart().then(()=>EXPORT_IMPL[name].apply(this,args));};
  Object.assign(DataGrid.prototype, {
    async *exportRows(...args){await loadExportPart();yield*EXPORT_IMPL.exportRows.apply(this,args);},
    exportAs(format,options){return exportAs(this,format,options);},
    exportFromMenu(action) { return loadExportPart().then(() => EXPORT_IMPL.exportFromMenu.call(this, action)); },
    syncPrintAvailability() {
      if (this.printButton) this.printButton.disabled = !!this.exportControl?.panel?.cxExportBusy?.() || !this.defaultExportColumns().length;
    },
    print(options) {
      const { onProgress, maxRows = 1000, timeoutMs, ...capture } = options || {};
      if (onProgress !== undefined && typeof onProgress !== "function") throw new Error("CanopyX: print progress needs a callback.");
      const layout = this.layoutMode === "cards" ? "stacked" : "table";
      const tokenColumns = new Set();
      let template = layout === "stacked" && this.view.cardTemplate ? JSON.parse(JSON.stringify(this.view.cardTemplate)) : null,
        projection = null, capturedOptions = capture;
      if (template && typeof this.opts.onPrint !== "function") {
        projection = capture.columns === undefined ? this.defaultExportColumns().map(column => column.id) :
          Array.isArray(capture.columns) ? capture.columns.slice() : null;
        if (projection?.length) {
          const columns = projection.slice();
          for (const [slot, text] of Object.entries(template)) {
            if (!projection.includes(slot)) { delete template[slot]; continue; }
            tokenColumns.add(slot);
            const inputs = [...text.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]);
            if (inputs.some(id => !this.columns.some(column => column.id === id && column.exportable !== false))) {
              template[slot] = null; continue;
            }
            for (const id of inputs) { tokenColumns.add(id); if (!columns.includes(id)) columns.push(id); }
          }
          capturedOptions = { ...capture, columns };
        }
      }
      const exported = this.prepareExport(capturedOptions);
      if (projection) GRID_REPORTING.captureCardText?.(exported.request, tokenColumns);
      return this.runGridHook(async signal => {
        await loadExportPart();
        const progress = (phase, completed) => onProgress?.(Object.freeze({ phase, completed, total: exported.request.recordCount }));
        const snapshot = await EXPORT_IMPL.snapshot(this, exported, maxRows, signal, progress);
        if (typeof this.opts.onPrint === "function") await this.opts.onPrint({ snapshot, signal, layout });
        else await EXPORT_IMPL.printSnapshot(this, snapshot, signal, layout, template, projection);
        gridOperationActive(this, signal); progress("ready", snapshot.rows.length);
      }, capture.signal, exportTimeout(this, { timeoutMs }));
    },
    // Record details is a more-menu entry, kept when the Export menu is switched off.
    buildExportControls() {
      this.toolbar.appendChild(Object.assign(gridButton(this.labels.gridDetails, () => {
        try {
          const row = this.focused || [...this.rowCache.values()].find(item => this.selected.has(item.key));
          if (!row || row.status) throw new Error("CanopyX: focus a record for details.");
          this.openDetails(row.key).catch(error => this.emit("error", { error }));
        } catch (error) { this.emit("error", { error }); }
      }), { className: "cx-button cx-grid-details" }));
      const print = this.printButton = gridButton(this.labels.gridPrint, () => Promise.resolve().then(() => this.exportControl ?
        this.exportFromMenu((options, onProgress) => this.print({ ...options, onProgress })) : this.print({ scope: "filtered" }))
        .catch(error => this.emit("error", { error })));
      print.classList.add("cx-grid-print"); this.toolbar.appendChild(print);
      if (this.tools.export !== false) this.exportControl = this.controlPanel(this.labels.gridExport, "cx-grid-export", panel => this.renderGridExport(panel));
    },
    // Replaced by the export part's menu once it is installed.
    async renderGridExport(panel) {
      if (panel.firstChild) return;
      setText(panel, this.labels.loading);
      try { await loadExportPart(); if (!this.destroyed && panel.isConnected) { this.renderGridExport(panel); this.controlFlyouts.forEach(item => item.position()); } }
      catch (error) { if (!this.destroyed && panel.isConnected) { setText(panel, this.labels.gridLoadFailed); panel.appendChild(gridButton(this.labels.gridRetry, () => this.renderGridExport(panel, setText(panel, "")))); this.emit("error", { error }); } }
    }
  });
