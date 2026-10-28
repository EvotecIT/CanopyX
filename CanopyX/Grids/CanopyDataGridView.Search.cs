namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets whether queries may opt into bounded regex quick search with <see cref="CanopyGridSearchMode.Regex"/>.
    /// Defaults to false; substring and word search retain their ordinary behavior. Hosts must implement or reject regex queries explicitly.</summary>
    public bool AllowRegexSearch { get; set; }
}
