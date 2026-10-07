namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the placeholder and name of the Columns menu search field. Default "Find a column…".</summary>
    public string GridFindColumn { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Columns menu action that shows every column. Default "Show all".</summary>
    public string GridShowAllColumns { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Columns menu action that restores declared order, visibility, widths and pins. Default "Reset columns".</summary>
    public string GridResetColumns { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of a Columns menu drag handle, including <c>{column}</c>.</summary>
    public string GridReorderColumn { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Columns menu note for a column pinned to the left edge. Default "Pinned left".</summary>
    public string GridPinnedLeft { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Columns menu note for a column pinned to the right edge. Default "Pinned right".</summary>
    public string GridPinnedRight { get => Get(); set => Set(value); }
}
