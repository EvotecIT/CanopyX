  // ---------- tree tools: the Export menu ----------
  // The flat grid's Export menu with tree scopes: the visible rows, the selected nodes, or all rows. CSV indents the tree
  // column by level; format providers receive each row's level and id path.
  Object.assign(TreeGrid.prototype, TREE_EXPORT, {
    renderGridExport: exportMenu,
    exportText(...args) { return EXPORT_IMPL.exportText.apply(this, args); }
  });
