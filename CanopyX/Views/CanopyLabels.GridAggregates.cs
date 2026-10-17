namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the text of a count aggregate cell, with the formatted <c>{value}</c>.</summary>
    public string GridAggregateCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text of a sum aggregate cell, with the formatted <c>{value}</c>.</summary>
    public string GridAggregateSum { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text of an average aggregate cell, with the formatted <c>{value}</c>.</summary>
    public string GridAggregateAverage { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text of a minimum aggregate cell, with the formatted <c>{value}</c>.</summary>
    public string GridAggregateMinimum { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text of a maximum aggregate cell, with the formatted <c>{value}</c>.</summary>
    public string GridAggregateMaximum { get => Get(); set => Set(value); }
}
