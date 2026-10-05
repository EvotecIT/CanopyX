  // ---------- explicit client export scope ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridExport: "Export", gridFilteredResults: "Filtered results", gridSelectedRows: "Selected rows",
    gridAllResults: "All results", gridDownloadCsv: "Download CSV", gridCopy: "Copy", gridDetails: "Record details"
  }));
  Object.assign(DataGrid.prototype, {
    buildExportControls() {
      const panel = this.controlPanel(this.labels.gridExport, "cx-grid-export").panel, scope = h("select");
      scope.setAttribute("aria-label", this.labels.gridExport);
      for (const [value, label] of [["filtered", "gridFilteredResults"], ["selected", "gridSelectedRows"], ["all", "gridAllResults"]]) {
        scope.appendChild(gridOption(value, this.labels[label]));
      }
      panel.appendChild(scope);
      const status = h("p", "cx-grid-control-error"); status.setAttribute("role", "status");
      const run = action => {
        buttons.forEach(button => button.disabled = true); setText(status, this.labels.loading);
        Promise.resolve().then(action).then(() => setText(status, ""), error => {
          setText(status, error.message); this.emit("error", { error: error });
        }).finally(() => { if (!this.destroyed) buttons.forEach(button => button.disabled = false); });
      };
      const csv = gridButton(this.labels.gridDownloadCsv, () => run(async () => {
        const text = await this.toCsv({ scope: scope.value }), url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
        try {
          if (this.destroyed) return;
          const link = h("a"); link.href = url; link.download = this.view.id.replace(/[^a-z0-9_-]/gi, "_") + ".csv";
          document.body.appendChild(link); link.click(); link.remove();
        } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
      }));
      const copy = gridButton(this.labels.gridCopy, () => run(() => this.copy({ scope: scope.value })));
      const buttons = [csv, copy]; panel.append(csv, copy, status);
      if (typeof this.opts.onDetails === "function") this.toolbar.appendChild(gridButton(this.labels.gridDetails, () => {
        try {
          const row = this.focused || [...this.rowCache.values()].find(item => this.selected.has(item.key));
          if (!row || row.status) throw new Error("CanopyX: focus a record for details.");
          this.openDetails(row.key).catch(error => this.emit("error", { error: error }));
        } catch (error) { this.emit("error", { error: error }); }
      }));
    }
  });
