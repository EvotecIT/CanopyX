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

    /// <summary>Gets or sets the complete-text control name including <c>{column}</c>.</summary>
    public string GridExpandCell { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the complete-text dialog close label.</summary>
    public string GridCloseCell { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the column move control name, including <c>{column}</c>.</summary>
    public string GridMoveColumn { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the resize keyboard and bounded auto-fit help.</summary>
    public string GridResizeHelp { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the column move announcement, including <c>{column}</c> and <c>{position}</c>.</summary>
    public string GridColumnMoved { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a pin selector's accessible name, including <c>{column}</c>.</summary>
    public string GridPinColumn { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the unpinned, scrolling-region choice.</summary>
    public string GridPinNone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the left pinned-region choice.</summary>
    public string GridPinLeft { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the right pinned-region choice.</summary>
    public string GridPinRight { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the note for a user-visible column temporarily hidden by responsive layout.</summary>
    public string GridResponsiveHidden { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the heading for the optional grouped-condition editor.</summary>
    public string GridFilterGroupTitle { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the conjunction selector label.</summary>
    public string GridFilterMatch { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the all-conditions choice text.</summary>
    public string GridFilterAll { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the any-condition choice text.</summary>
    public string GridFilterAny { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the add-condition-group control label.</summary>
    public string GridAddFilterGroup { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the remove-condition-group control label.</summary>
    public string GridDeleteFilterGroup { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the facet section label, describing counts from applied filters.</summary>
    public string GridFacetValues { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the bounded facet-value search label.</summary>
    public string GridFacetSearch { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the current-column projection checkbox label.</summary>
    public string GridFacetIncludeCurrent { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the facet reload button label.</summary>
    public string GridFacetLoad { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the raw facet choice placeholder and accessible name.</summary>
    public string GridFacetChoose { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the count summary including <c>{count}</c>, <c>{shown}</c> and <c>{total}</c>.</summary>
    public string GridFacetCounts { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the stale or cancelled facet request message.</summary>
    public string GridFacetReload { get => Get(); set => Set(value); }

    /// <summary>Gets whether translated reporting controls require the optional reporting entry point.</summary>
    public bool RequiresReportingRuntime => _values.ContainsKey(nameof(GridBetween)) || _values.ContainsKey(nameof(GridRangeEnd)) ||
        _values.ContainsKey(nameof(GridInvalidRange)) || _values.ContainsKey(nameof(GridSuggestedCategory)) || _values.ContainsKey(nameof(GridChooseCategory)) ||
        _values.ContainsKey(nameof(GridBooleanValue)) || _values.ContainsKey(nameof(GridTrue)) || _values.ContainsKey(nameof(GridFalse)) || _values.ContainsKey(nameof(GridHeaderFilter)) ||
        _values.ContainsKey(nameof(GridExpandCell)) || _values.ContainsKey(nameof(GridCloseCell)) ||
        _values.ContainsKey(nameof(GridMoveColumn)) || _values.ContainsKey(nameof(GridResizeHelp)) || _values.ContainsKey(nameof(GridColumnMoved)) ||
        _values.ContainsKey(nameof(GridPinColumn)) || _values.ContainsKey(nameof(GridPinNone)) || _values.ContainsKey(nameof(GridPinLeft)) ||
        _values.ContainsKey(nameof(GridPinRight)) || _values.ContainsKey(nameof(GridResponsiveHidden)) ||
        _values.ContainsKey(nameof(GridFilterGroupTitle)) || _values.ContainsKey(nameof(GridFilterMatch)) ||
        _values.ContainsKey(nameof(GridFilterAll)) || _values.ContainsKey(nameof(GridFilterAny)) ||
        _values.ContainsKey(nameof(GridAddFilterGroup)) || _values.ContainsKey(nameof(GridDeleteFilterGroup)) ||
        _values.ContainsKey(nameof(GridFacetValues)) || _values.ContainsKey(nameof(GridFacetSearch)) || _values.ContainsKey(nameof(GridFacetIncludeCurrent)) ||
        _values.ContainsKey(nameof(GridFacetLoad)) || _values.ContainsKey(nameof(GridFacetChoose)) || _values.ContainsKey(nameof(GridFacetCounts)) || _values.ContainsKey(nameof(GridFacetReload)) ||
        _values.ContainsKey(nameof(GridRenameView)) || _values.ContainsKey(nameof(GridDefaultView)) || _values.ContainsKey(nameof(GridClearDefaultView)) ||
        _values.ContainsKey(nameof(GridDefaultViewName)) || _values.ContainsKey(nameof(GridNoDefaultView)) || _values.ContainsKey(nameof(GridDefaultViewOption)) ||
        _values.ContainsKey(nameof(GridSelection)) || _values.ContainsKey(nameof(GridSelectPage)) || _values.ContainsKey(nameof(GridSelectMatching)) ||
        _values.ContainsKey(nameof(GridClearSelection)) || _values.ContainsKey(nameof(GridSelectionCount)) ||
        _values.ContainsKey(nameof(GridSelectionQueryCount)) || _values.ContainsKey(nameof(GridSelectionQueryUnknown)) || _values.ContainsKey(nameof(GridSelectRecord)) ||
        _values.ContainsKey(nameof(GridGroupHeading)) || _values.ContainsKey(nameof(GridGroupMissing)) || _values.ContainsKey(nameof(GridGroupExpand)) ||
        _values.ContainsKey(nameof(GridGroupCollapse)) || _values.ContainsKey(nameof(GridSummary)) || _values.ContainsKey(nameof(GridGroupOrder));
}
