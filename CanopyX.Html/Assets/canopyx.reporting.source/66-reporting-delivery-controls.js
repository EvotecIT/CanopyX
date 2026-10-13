  // ---------- host print action ----------
  // Print lives in the more menu and runs through the Export menu's scope, progress and cancellation controls (the export
  // part draws them). Without the Export menu, a print hook still runs from the more menu, for the filtered result.
  const DELIVERY_CONTROLS = DataGrid.prototype.buildExportControls;
  DataGrid.prototype.exportFromMenu = function (action) { return loadExportPart().then(() => EXPORT_IMPL.exportFromMenu.call(this, action)); };
  DataGrid.prototype.buildExportControls = function () {
    DELIVERY_CONTROLS.call(this);
    if (!this.view.reporting || typeof this.opts.onPrint !== "function") return;
    const print = this.printButton = gridButton(this.labels.gridPrint, () => Promise.resolve().then(() => this.exportControl ?
      this.exportFromMenu((options, onProgress) => this.print({ ...options, onProgress })) : this.print({ scope: "filtered" })).catch(error => this.emit("error", { error })));
    print.classList.add("cx-grid-print"); this.toolbar.appendChild(print);
  };
