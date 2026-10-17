namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the back button of a record opened from a link. Default "Back".</summary>
    public string RecordBack { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of the back button, with the previous record's <c>{record}</c>. Default "Back to {record}".</summary>
    public string RecordBackTo { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of the breadcrumb trail of records. Default "Record trail".</summary>
    public string RecordTrail { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement after a link opens <c>{record}</c>. Default "Showing {record}".</summary>
    public string RecordShowing { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of the record panel's tab list. Default "Record views".</summary>
    public string RecordTabs { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of the jump list of sections. Default "Jump to a section".</summary>
    public string RecordSections { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the heading of the section that keeps the fields no declared section lists. Default "Other fields".</summary>
    public string RecordOtherFields { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the switch that shows the <c>{count}</c> hidden empty fields. Default "Show empty fields ({count})".</summary>
    public string RecordShowEmpty { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the switch that hides empty fields again. Default "Hide empty fields".</summary>
    public string RecordHideEmpty { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of the record actions menu. Default "Record actions".</summary>
    public string RecordActions { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that copies the record's values. Default "Copy values".</summary>
    public string RecordCopyValues { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that copies the record as JSON. Default "Copy as JSON".</summary>
    public string RecordCopyJson { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that copies the record's address. Default "Copy link".</summary>
    public string RecordCopyLink { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement after a copy. Default "Copied to the clipboard".</summary>
    public string RecordCopied { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that prints the record alone. Default "Print record".</summary>
    public string RecordPrint { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that downloads the record as CSV. Default "Export CSV".</summary>
    public string RecordExportCsv { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that downloads the record as JSON. Default "Export JSON".</summary>
    public string RecordExportJson { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that filters the target grid to a collection's records. Default "Open all in grid".</summary>
    public string RecordOpenAll { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that loads a collection's next rows. Default "Load more".</summary>
    public string RecordLoadMore { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a collection's count, <c>{shown}</c> of <c>{total}</c> records. Default "{shown} of {total}".</summary>
    public string RecordCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a count of <c>{count}</c> items, the structured presenter's default count text. Default "{count} items".</summary>
    public string RecordItems { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the <c>{count}</c> items a summary leaves out. Default "+{count}".</summary>
    public string RecordMore { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that shows all <c>{count}</c> items of a list, timeline or collection. Default "Show all {count}".</summary>
    public string RecordShowAll { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that loads failed record details again. Default "Retry".</summary>
    public string RecordRetry { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message of record details that failed to load, with the <c>{error}</c>. Default "Could not load the record details: {error}".</summary>
    public string RecordLoadFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message of a link whose record <c>{id}</c> cannot be opened. Default "Record {id} is not available here.".</summary>
    public string RecordUnavailable { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the field column of exports and change tables. Default "Field".</summary>
    public string RecordField { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the value column of exports. Default "Value".</summary>
    public string RecordValue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the section column of exports. Default "Section".</summary>
    public string RecordSection { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the column of values before a change. Default "Before".</summary>
    public string RecordBefore { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the column of values after a change. Default "After".</summary>
    public string RecordAfter { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible mark of an item a change added. Default "Added".</summary>
    public string RecordAdded { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible mark of an item a change removed. Default "Removed".</summary>
    public string RecordRemoved { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the caption of a change table, <c>{count}</c> changed fields. Default "{count} changed fields".</summary>
    public string RecordChanged { get => Get(); set => Set(value); }
}
