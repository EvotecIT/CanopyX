namespace CanopyX;

/// <summary>
/// How the runtime formats, aligns, and sorts a column's values when a cell has no display text.
/// </summary>
public enum CanopyColumnKind {
    /// <summary>Text, left aligned, sorted with a natural (numeric-aware) comparison.</summary>
    Text = 0,

    /// <summary>Numbers, right aligned, formatted with thousands separators, sorted numerically.</summary>
    Number,

    /// <summary>
    /// Date and time values written as ISO 8601 UTC, shown as <c>yyyy-MM-dd HH:mm</c> in UTC or in the reader's
    /// time zone (see <see cref="CanopyTreeView.TimeZone"/>).
    /// </summary>
    DateTime
}
