  // ---------- scoped delivery with progress and an explicit cancellation action ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridExportProgress: "{completed} of {total} records", gridExportReading: "{completed} records",
    gridExportCancelled: "Export cancelled", gridCancelExport: "Cancel export"
  }));
  const DELIVERY_CONTROLS = DataGrid.prototype.buildExportControls;
  DataGrid.prototype.buildExportControls = function () {
    DELIVERY_CONTROLS.call(this);
    if (!this.view.reporting) return;
    const panel = this.toolbar.querySelector(".cx-grid-export .cx-grid-panel");
    panel.replaceChildren();
    const scope = h("select"); scope.setAttribute("aria-label", this.labels.gridExport);
    for (const [value, label] of [["filtered", "gridFilteredResults"], ["selected", "gridSelectedRows"], ["all", "gridAllResults"]])
      scope.appendChild(gridOption(value, this.labels[label]));
    const status = h("p", "cx-grid-delivery-status"); status.setAttribute("role", "status");
    const meter = h("progress"); meter.setAttribute("aria-label", this.labels.gridExport); meter.hidden = true;
    let operation = null;
    const cancel = gridButton(this.labels.gridCancelExport, () => operation?.abort()); cancel.hidden = true;
    const progress = value => {
      if (this.destroyed || !operation || operation.signal.aborted) return;
      setText(status, fill(value.total === null ? this.labels.gridExportReading : this.labels.gridExportProgress,
        { completed: numberFormat(this.lang).format(value.completed), total: value.total === null ? "" : numberFormat(this.lang).format(value.total) }));
      if (value.total === null) meter.removeAttribute("value");
      else { meter.max = Math.max(1, value.total); meter.value = value.completed; }
    };
    const run = action => {
      if (operation) return;
      const controller = operation = new AbortController();
      scope.disabled = true; buttons.forEach(button => button.disabled = true);
      cancel.hidden = false; meter.hidden = false; meter.removeAttribute("value"); setText(status, this.labels.loading);
      const options = { scope: scope.value, signal: controller.signal, onProgress: progress };
      Promise.resolve().then(() => action(options)).then(() => { if (!this.destroyed) setText(status, ""); }, error => {
        if (!this.destroyed) setText(status, error.name === "AbortError" ? this.labels.gridExportCancelled : error.message);
        if (error.name !== "AbortError") this.emit("error", { error });
      }).finally(() => {
        if (operation === controller) operation = null;
        if (!this.destroyed) {
          const returnFocus = document.activeElement === cancel;
          scope.disabled = false; buttons.forEach(button => button.disabled = false); cancel.hidden = true; meter.hidden = true;
          if (returnFocus) scope.focus();
        }
      });
    };
    const csv = gridButton(this.labels.gridDownloadCsv, () => run(async options => {
      const exported = this.prepareExport(options), fileName = exported.request.fileName;
      const text = await this.exportText(exported, 50000, ",", options.signal); gridOperationActive(this, options.signal);
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      try {
        const link = h("a"); link.href = url; link.download = fileName + ".csv";
        document.body.appendChild(link); link.click(); link.remove();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }));
    const copy = gridButton(this.labels.gridCopy, () => run(options => this.copy(options))), buttons = [csv, copy];
    if (typeof this.opts.onPrint === "function") buttons.push(gridButton(this.labels.gridPrint, () => run(options => this.print(options))));
    panel.append(scope, ...buttons, cancel, meter, status);
  };
