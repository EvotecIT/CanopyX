namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets a group heading, including <c>{column}</c>, <c>{value}</c> and full group <c>{count}</c>.</summary>
    public string GridGroupHeading { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the missing grouping-value label.</summary>
    public string GridGroupMissing { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the expand-group control label.</summary>
    public string GridGroupExpand { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the collapse-group control label.</summary>
    public string GridGroupCollapse { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the complete-query summary region label.</summary>
    public string GridSummary { get => Get(); set => Set(value); }
}
