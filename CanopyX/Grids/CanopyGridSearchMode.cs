namespace CanopyX;

/// <summary>How flat-grid search text matches the declared searchable columns.</summary>
public enum CanopyGridSearchMode {
    /// <summary>The complete search text is a substring of at least one searchable cell.</summary>
    Substring = 0,
    /// <summary>Every word or quoted phrase matches a searchable cell; different words may match different columns.</summary>
    Words,
    /// <summary>A case-insensitive bounded pattern matches one searchable cell. Requires <see cref="CanopyDataGridView.AllowRegexSearch"/>.</summary>
    Regex
}
