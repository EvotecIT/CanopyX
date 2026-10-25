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
    const menu = this.opts.exportMenu ?? {};
    if (!menu || typeof menu !== "object" || Array.isArray(menu) ||
        Object.keys(menu).some(key => !["csv", "copy", "print", "values"].includes(key)) ||
        ["csv", "copy", "print"].some(key => menu[key] !== undefined && typeof menu[key] !== "boolean") ||
        menu.values !== undefined && !["raw", "display"].includes(menu.values))
      throw new Error("CanopyX: exportMenu supports csv/copy/print booleans and raw/display values.");
    scope.setAttribute("aria-label", labels.gridExport);
    for (const [value, label] of this.exportScopes || [["filtered", "gridFilteredResults"], ["selected", "gridSelectedRows"], ["all", "gridAllResults"]])
      scope.appendChild(gridOption(value, labels[label]));
    panel.classList.add("cx-export-panel");
    const count = h("p", "cx-export-count"), list = h("div", "cx-export-formats"), actions = h("div", "cx-export-actions");
    count.setAttribute("role", "status");
    const updateCount = () => {
      try {
        const request = this.prepareExport({ scope: scope.value }).request;
        setText(count, scope.selectedOptions[0].textContent + " · " + (request.recordCount === null ? labels.gridUnknownCount :
          numberFormat(this.lang).format(request.recordCount) + " " + labels.gridRows));
      } catch { setText(count, scope.selectedOptions[0].textContent); }
    };
    scope.addEventListener("change", updateCount);
    const decorate = (button, title, hint, icon) => {
      button.classList.add("cx-export-choice"); button.setAttribute("aria-label", title);
      const symbol = h("span", "cx-export-icon"); symbol.setAttribute("aria-hidden", "true"); setText(symbol, icon);
      const content = h("span", "cx-export-choice-text"), name = h("span", "cx-export-choice-title"); setText(name, title); content.append(name);
      if (hint) { const note = h("span", "cx-export-hint"); setText(note, hint); content.append(note); }
      button.replaceChildren(symbol, content); return button;
    };
    const status = h("p", "cx-grid-delivery-status"); status.setAttribute("role", "status");
    const meter = h("progress"); meter.setAttribute("aria-label", labels.gridExport); meter.hidden = true;
    let operation = null, formats = [];
    panel.cxExportBusy = () => operation !== null;
    const cancel = gridButton(labels.gridCancelExport, () => operation?.abort()); cancel.hidden = true;
    const progress = value => {
      if (this.destroyed || !operation || operation.signal.aborted) return;
      setText(status, fill(value.total === null ? labels.gridExportReading : labels.gridExportProgress,
        { completed: numberFormat(this.lang).format(value.completed), total: value.total === null ? "" : numberFormat(this.lang).format(value.total) }));
      if (value.total === null) meter.removeAttribute("value");
      else { meter.max = Math.max(1, value.total); meter.value = value.completed; }
    };
    const canExport = () => this.view.type !== "grid" || this.defaultExportColumns().length > 0;
    const busy = state => {
      scope.disabled = state; cancel.hidden = meter.hidden = !state;
      for (const button of [csv, ...formats, copy, print, this.printButton]) if (button) button.disabled = state || !canExport();
    };
    // Ordinary grids take no progress option; the reporting runtime reports CSV and copy progress through it.
    const traced = (options, onProgress) => reporting ? { ...options, onProgress } : options;
    panel.cxRun = action => {
      if (operation) return;
      const controller = operation = new AbortController();
      busy(true); meter.removeAttribute("value"); setText(status, labels.loading);
      Promise.resolve().then(() => action({ scope: scope.value, signal: controller.signal, ...(menu.values ? { values: menu.values } : {}) }, progress)).then(() => { if (!this.destroyed) setText(status, ""); }, error => {
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
    decorate(csv, labels.gridDownloadCsv, labels.gridExportCsvHint, "CSV");
    const copy = this.copy ? decorate(gridButton(labels.gridCopy, () => panel.cxRun((options, onProgress) => this.copy(traced(options, onProgress)))),
      labels.gridExportCopy, null, "⧉") : h("span");
    const print = typeof this.print === "function" ? gridButton(labels.gridPrint, () => panel.cxRun((options, onProgress) =>
      this.print({ ...options, onProgress }))) : h("span");
    decorate(print, labels.gridPrint, null, "▤"); print.hidden = true;
    csv.hidden = menu.csv === false; copy.hidden = !this.copy || menu.copy === false;
    panel.cxFormats = () => {
      if (operation) return;
      formats.forEach(button => button.remove());
      try {
        const available = EXPORT_IMPL.formatsOf(this);
        print.hidden = !(typeof this.print === "function" && (menu.print ?? available.some(format => format.id === "xlsx" || format.id === "pdf")));
        formats = available.filter(format => format.showInMenu).map(format => Object.assign(decorate(gridButton(format.label, () =>
          panel.cxRun((options, onProgress) => this.exportAs(format.id, { ...options, onProgress }))), format.label,
          format.id === "xlsx" ? labels.gridExportWorkbookHint : format.id === "pdf" ? labels.gridExportPdfHint : null,
          format.extension.toUpperCase()), { value: format.id }));
      } catch (error) { formats = []; this.emit("error", { error }); }
      list.replaceChildren(...formats, csv); actions.hidden = copy.hidden && print.hidden;
      updateCount();
      busy(false);
      if (!canExport()) setText(status, labels.gridNoExportColumns);
      else if (status.textContent === labels.gridNoExportColumns) setText(status, "");
    };
    actions.append(copy, print); panel.append(scope, count, meter, status, cancel, list, actions);
    panel.cxFormats();
  };
