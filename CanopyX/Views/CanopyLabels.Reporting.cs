namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the inclusive range operator label. Default "between (inclusive)".</summary>
    public string GridBetween { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the upper range operand label. Default "Upper value (UTC for dates)".</summary>
    public string GridRangeEnd { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the reversed-range error text.</summary>
    public string GridInvalidRange { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the suggested category control label. Default "Suggested category".</summary>
    public string GridSuggestedCategory { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the category placeholder. Default "Choose a category".</summary>
    public string GridChooseCategory { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the boolean choice label. Default "Boolean value".</summary>
    public string GridBooleanValue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the raw true-value choice text. Default "True".</summary>
    public string GridTrue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the raw false-value choice text. Default "False".</summary>
    public string GridFalse { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a header filter button's name, including <c>{column}</c>. Default "Filter {column}".</summary>
    public string GridHeaderFilter { get => Get(); set => Set(value); }

    /// <summary>Gets whether translated reporting controls require the optional reporting entry point.</summary>
    public bool RequiresReportingRuntime => _values.ContainsKey(nameof(GridBetween)) || _values.ContainsKey(nameof(GridRangeEnd)) ||
        _values.ContainsKey(nameof(GridInvalidRange)) || _values.ContainsKey(nameof(GridSuggestedCategory)) || _values.ContainsKey(nameof(GridChooseCategory)) ||
        _values.ContainsKey(nameof(GridBooleanValue)) || _values.ContainsKey(nameof(GridTrue)) || _values.ContainsKey(nameof(GridFalse)) || _values.ContainsKey(nameof(GridHeaderFilter));
}
