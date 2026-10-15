  // ---------- explicit client export scope ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridExport: "Export", gridFilteredResults: "Filtered results", gridSelectedRows: "Selected rows",
    gridAllResults: "All results", gridVisibleRows: "Visible rows", gridAllRows: "All rows", gridDownloadCsv: "Download CSV", gridCopy: "Copy", gridDetails: "Record details",
    gridExportProgress: "{completed} of {total} records", gridExportReading: "{completed} records",
    gridExportCancelled: "Export cancelled", gridCancelExport: "Cancel export"
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
    // Record details is a more-menu entry, kept when the Export menu is switched off.
    buildExportControls() {
      this.toolbar.appendChild(Object.assign(gridButton(this.labels.gridDetails, () => {
        try {
          const row = this.focused || [...this.rowCache.values()].find(item => this.selected.has(item.key));
          if (!row || row.status) throw new Error("CanopyX: focus a record for details.");
          this.openDetails(row.key).catch(error => this.emit("error", { error }));
        } catch (error) { this.emit("error", { error }); }
      }), { className: "cx-button cx-grid-details" }));
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
