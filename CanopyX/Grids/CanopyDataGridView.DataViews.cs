namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets the keyed comparison's summary and status-column binding. Null keeps the comparison part unloaded.</summary>
    public CanopyDatasetCompareInfo? Compare { get; set; }

    /// <summary>Gets or sets whether this view embeds the optional validated view-intent preview part.</summary>
    /// <remarks>The host supplies a view intent; CanopyX neither contacts nor selects a language model.</remarks>
    public bool ViewIntents { get; set; }
}
