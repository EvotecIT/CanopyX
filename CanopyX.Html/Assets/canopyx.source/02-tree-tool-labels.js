  // ---------- tree runtimes: the texts of the tree tools part's menus ----------
  // The Columns, Views, Export and more menus of a tree come from the tree tools part. Their texts are labels of the tree
  // runtimes, so a view or host translates them like the core's own texts and CanopyX.labels lists them. The grid runtimes
  // define the same names with the same English texts for their flat grids; Build/tree-only-parts.json leaves this part out
  // of them.
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridViews: "Views", gridViewName: "View name", gridSaveView: "Save view", gridRemoveView: "Remove view", gridResetView: "Reset view",
    gridChooseView: "Choose a saved view", gridApply: "Apply", gridFindColumn: "Find a column…", gridShowAllColumns: "Show all",
    gridResetColumns: "Reset columns", gridReorderColumn: "{column}: drag, or press Alt+Up or Alt+Down to move", gridPinnedLeft: "Pinned left",
    gridPinnedRight: "Pinned right", gridResponsiveHidden: "Hidden at this width", gridExport: "Export", gridVisibleRows: "Visible rows",
    gridSelectedRows: "Selected rows", gridAllRows: "All rows", gridDownloadCsv: "CSV", gridCopy: "Copy",
    gridRows: "rows", gridUnknownCount: "Result count unavailable",
    gridDownloadXlsx: "Excel workbook (.xlsx)", gridDownloadPdf: "PDF",
    gridExportWorkbookHint: "Formatted, with groups and totals", gridExportPdfHint: "Paged report with repeating headings",
    gridExportCsvHint: "Plain text values (.csv)", gridExportCopy: "Copy to clipboard",
    gridExportProgress: "{completed} of {total} records", gridExportReading: "{completed} records", gridExportCancelled: "Export cancelled",
    gridCancelExport: "Cancel export", gridMore: "More", gridPrint: "Print", gridDetails: "Record details", gridDetailsSection: "Details",
    gridPreviousRecord: "Previous record", gridNextRecord: "Next record", gridCloseRecord: "Close"
  }));
