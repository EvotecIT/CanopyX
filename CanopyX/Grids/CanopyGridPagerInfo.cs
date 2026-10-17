namespace CanopyX;

/// <summary>Chooses the result text a paged grid's pager shows.</summary>
public enum CanopyGridPagerInfo {
    /// <summary>The compact visible range, for example "1–25 of 300 rows" (<see cref="CanopyLabels.GridPageRange"/>).</summary>
    Range,
    /// <summary>
    /// A sentence, for example "Showing 1 to 25 of 300 rows" (<see cref="CanopyLabels.GridPageInfo"/>), which adds the unfiltered
    /// total while a search or filter narrows the rows (<see cref="CanopyLabels.GridPageInfoFiltered"/>).
    /// </summary>
    Sentence,
    /// <summary>No result text.</summary>
    None
}
