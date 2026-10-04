namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the selection-control group name. Default "Selection".</summary>
    public string GridSelection { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the complete accepted-page selection command. Default "Select page".</summary>
    public string GridSelectPage { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accepted-query selection command. Default "Select all matching".</summary>
    public string GridSelectMatching { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the selection clearing command. Default "Clear selection".</summary>
    public string GridClearSelection { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the explicit selected-record summary, including <c>{count}</c>.</summary>
    public string GridSelectionCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the known matching-record selection summary, including <c>{count}</c> and <c>{excluded}</c>.</summary>
    public string GridSelectionQueryCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the unknown-count query selection summary, including <c>{excluded}</c>.</summary>
    public string GridSelectionQueryUnknown { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a record checkbox's accessible name, including <c>{id}</c>.</summary>
    public string GridSelectRecord { get => Get(); set => Set(value); }
}
