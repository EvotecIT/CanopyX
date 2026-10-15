  // ---------- tree tools: the Export menu ----------
  // The flat grid's Export menu with tree scopes: the visible rows, the selected nodes, or all rows. CSV indents the tree
  // column by level; format providers receive each row's level and id path. The menu body, CSV and the format writers ship
  // in the export part (canopyx-export.js), which a tree loads on first use, as a flat grid does, and installs into this
  // part's own EXPORT_IMPL. Captures (45-tree-capture.js) are taken at once and run when the part is ready.
  const TREE_EXPORT_PART = definePart(TreeGrid, "export", "export part", () => ({ DataGrid: TreeGrid, EXPORT_IMPL, h, setText, gridButton, gridOption, fill, numberFormat,
    gridOperationActive, formatting, cellValue, cellText, isCellObject, exportTimeout, exportFormat, EXPORT_FORMATS }));
  function loadExportPart() { return loadPart(TREE_EXPORT_PART); }

  Object.assign(TreeGrid.prototype, TREE_EXPORT, {
    // Replaced by the export part's menu once it is installed; a failed load offers a retry.
    async renderGridExport(panel) {
      if (panel.firstChild) return;
      setText(panel, this.labels.loading);
      try { await loadExportPart(); if (!this.destroyed && panel.isConnected) { setText(panel, ""); this.renderGridExport(panel); this.controlFlyouts.forEach(item => item.position()); } }
      catch (error) {
        if (this.destroyed || !panel.isConnected) return;
        panel.replaceChildren(gridButton(fill(this.labels.loadError, { error: error.message }), () => { panel.replaceChildren(); this.renderGridExport(panel); }));
        this.emit("error", { error });
      }
    },
    exportText(...args) { return loadExportPart().then(() => EXPORT_IMPL.exportText.apply(this, args)); }
  });
