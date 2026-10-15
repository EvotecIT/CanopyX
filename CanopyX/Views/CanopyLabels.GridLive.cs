namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the prompt shown when rows kept their places while their sort keys changed. Default "Order changed".</summary>
    public string GridLiveOrderChanged { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the prompt's button that moves rows to their sorted places. Default "Re-sort".</summary>
    public string GridLiveResort { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the prompt shown when a cursor grid's source has newer data. Default "New data".</summary>
    public string GridLiveNewData { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the prompt's button that reads a cursor grid's first page again. Default "Refresh".</summary>
    public string GridLiveRefresh { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the explanation of the order prompt, its tooltip and what a screen reader hears. Default "Rows keep their places while data changes. Re-sort to move them where the sort puts them.".</summary>
    public string GridLiveOrderHint { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears when rows are added or removed, including <c>{added}</c>, <c>{updated}</c> and <c>{removed}</c>. Default "Rows changed: {added} added, {updated} updated, {removed} removed".</summary>
    public string GridLiveChanged { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears after re-sorting. Default "Rows moved to their sorted places.".</summary>
    public string GridLiveSorted { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears when the record open in the drawer is removed. Default "This record was removed.".</summary>
    public string GridLiveRecordRemoved { get => Get(); set => Set(value); }
}
