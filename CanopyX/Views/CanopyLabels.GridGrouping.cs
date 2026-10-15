namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the column menu entry that adds the column as the innermost grouping level.</summary>
    public string GridGroupBy { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the column menu entry and chip control that remove a column from the grouping levels.</summary>
    public string GridUngroup { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the hint an empty group-by bar shows.</summary>
    public string GridGroupDrop { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the group-by bar control that expands every group.</summary>
    public string GridExpandAll { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the group-by bar control that collapses every group.</summary>
    public string GridCollapseAll { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the chip control that expands the groups of one level, with the 1-based <c>{level}</c>.</summary>
    public string GridExpandLevel { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the chip control that collapses the groups of one level, with the 1-based <c>{level}</c>.</summary>
    public string GridCollapseLevel { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the keyboard hint of a grouping chip.</summary>
    public string GridGroupMove { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of a grouping level's group order choice.</summary>
    public string GridGroupSortBy { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the group order choice that orders groups by their value.</summary>
    public string GridGroupSortValue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of a group heading's selection checkbox, with the group's <c>{group}</c> value.</summary>
    public string GridSelectGroup { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text of a distinct-count aggregate cell, with the formatted <c>{value}</c>.</summary>
    public string GridAggregateDistinct { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of a record's collapsed detail row expander.</summary>
    public string GridShowDetail { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of a record's expanded detail row expander.</summary>
    public string GridHideDetail { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of a detail row's content, with the record's first column text as <c>{record}</c>.</summary>
    public string GridDetailOf { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message of a detail row whose content failed to load, with the <c>{error}</c>.</summary>
    public string GridDetailFailed { get => Get(); set => Set(value); }
}
