namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the aggregate display-mode menu label.</summary>
    public string GridShowAs { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the unchanged aggregate choice.</summary>
    public string GridShowAsValue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the percent-of-grand-total caption.</summary>
    public string GridShowAsPercentGrandTotal { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the percent-of-parent caption.</summary>
    public string GridShowAsPercentParent { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the pivot-column percentage caption.</summary>
    public string GridShowAsPercentColumn { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the pivot-row percentage caption.</summary>
    public string GridShowAsPercentRow { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the running-total caption.</summary>
    public string GridShowAsRunningTotal { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the competition-rank caption.</summary>
    public string GridShowAsRank { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the previous-value difference caption.</summary>
    public string GridShowAsDifference { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the previous-value percentage-change caption.</summary>
    public string GridShowAsPercentChange { get => Get(); set => Set(value); }
}
