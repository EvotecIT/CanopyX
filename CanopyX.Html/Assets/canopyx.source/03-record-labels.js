  // ---------- record panel texts ----------
  // The record panel part (canopyx.record-panel.source) draws the rich record drawer of flat grids and trees. Its texts are
  // labels of every runtime, so a view or a host translates them like the core's own texts before the part loads.
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    recordBack: "Back", recordBackTo: "Back to {record}", recordTrail: "Record trail", recordShowing: "Showing {record}",
    recordTabs: "Record views", recordSections: "Jump to a section", recordOtherFields: "Other fields",
    recordShowEmpty: "Show empty fields ({count})", recordHideEmpty: "Hide empty fields", recordActions: "Record actions",
    recordCopyValues: "Copy values", recordCopyJson: "Copy as JSON", recordCopyLink: "Copy link", recordCopied: "Copied to the clipboard",
    recordPrint: "Print record", recordExportCsv: "Export CSV", recordExportJson: "Export JSON", recordOpenAll: "Open all in grid",
    recordLoadMore: "Load more", recordCount: "{shown} of {total}", recordItems: "{count} items", recordMore: "+{count}",
    recordShowAll: "Show all {count}", recordRetry: "Retry", recordLoadFailed: "Could not load the record details: {error}", recordUnavailable: "Record {id} is not available here.",
    recordField: "Field", recordValue: "Value", recordSection: "Section", recordBefore: "Before", recordAfter: "After",
    recordAdded: "Added", recordRemoved: "Removed", recordChanged: "{count} changed fields"
  }));
