  // ---------- export part: the Export menu ----------
  // One menu for ordinary and reporting grids and trees: the scope, built-in CSV, the format providers and copy (where the
  // view copies), with shared progress, cancellation and error status. A reporting print action in the more menu runs through
  // the same controls. The export part makes it DataGrid's renderGridExport, and TreeGrid's when a tree installs it.
  Object.assign(EXPORT_IMPL, {
    exportFromMenu(action) {
      const { details, panel } = this.exportControl;
      this.renderGridExport(panel); details.open = true;
      if (!this.phone && this.overflow) this.overflow.details.open = false;
      panel.cxRun(action);
    }
  });
  // Drawn on the first open; later opens refresh the format buttons, so formats registered after mounting appear.
  // A view lists its scopes as [value, label name] pairs in exportScopes; flat grids use filtered, selected and all.
  const exportMenu = function (panel) {
    if (panel.cxRun) return panel.cxFormats();
    panel.replaceChildren();
    const reporting = !!this.view.reporting, scope = h("select"), labels = this.labels;
    scope.setAttribute("aria-label", labels.gridExport);
    for (const [value, label] of this.exportScopes || [["filtered", "gridFilteredResults"], ["selected", "gridSelectedRows"], ["all", "gridAllResults"]])
      scope.appendChild(gridOption(value, labels[label]));
    const status = h("p", "cx-grid-delivery-status"); status.setAttribute("role", "status");
    const meter = h("progress"); meter.setAttribute("aria-label", labels.gridExport); meter.hidden = true;
    let operation = null, formats = [];
    const cancel = gridButton(labels.gridCancelExport, () => operation?.abort()); cancel.hidden = true;
    const progress = value => {
      if (this.destroyed || !operation || operation.signal.aborted) return;
      setText(status, fill(value.total === null ? labels.gridExportReading : labels.gridExportProgress,
        { completed: numberFormat(this.lang).format(value.completed), total: value.total === null ? "" : numberFormat(this.lang).format(value.total) }));
      if (value.total === null) meter.removeAttribute("value");
      else { meter.max = Math.max(1, value.total); meter.value = value.completed; }
    };
    const busy = state => {
      scope.disabled = state; cancel.hidden = meter.hidden = !state;
      for (const button of [csv, ...formats, copy, this.printButton]) if (button) button.disabled = state;
    };
    // Ordinary grids take no progress option; the reporting runtime reports CSV and copy progress through it.
    const traced = (options, onProgress) => reporting ? { ...options, onProgress } : options;
    panel.cxRun = action => {
      if (operation) return;
      const controller = operation = new AbortController();
      busy(true); meter.removeAttribute("value"); setText(status, labels.loading);
      Promise.resolve().then(() => action({ scope: scope.value, signal: controller.signal }, progress)).then(() => { if (!this.destroyed) setText(status, ""); }, error => {
        if (!this.destroyed) setText(status, error.name === "AbortError" ? labels.gridExportCancelled : error.message);
        if (error.name !== "AbortError") this.emit("error", { error });
      }).finally(() => {
        if (operation === controller) operation = null;
        if (!this.destroyed) {
          const returnFocus = document.activeElement === cancel;
          busy(false); if (returnFocus) scope.focus();
        }
      });
    };
    const csv = gridButton(labels.gridDownloadCsv, () => panel.cxRun(async (options, onProgress) => {
      const exported = this.prepareExport(traced(options, onProgress));
      const text = await this.exportText(exported, 50000, ",", options.signal); gridOperationActive(this, options.signal);
      saveExport(new Blob([text], { type: "text/csv;charset=utf-8" }), (exported.request.fileName || this.view.id.replace(/[^a-z0-9_-]/gi, "_")) + ".csv");
    }));
    const copy = this.copy ? gridButton(labels.gridCopy, () => panel.cxRun((options, onProgress) => this.copy(traced(options, onProgress)))) : h("span");
    panel.cxFormats = () => {
      if (operation) return;
      formats.forEach(button => button.remove());
      try {
        formats = exportFormatsOf(this).map(format => Object.assign(gridButton(format.label, () =>
          panel.cxRun((options, onProgress) => this.exportAs(format.id, { ...options, onProgress }))), { value: format.id }));
      } catch (error) { formats = []; this.emit("error", { error }); }
      copy.before(...formats);
    };
    panel.append(scope, csv, copy, cancel, meter, status);
    panel.cxFormats();
  };
