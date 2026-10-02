namespace CanopyX;

/// <summary>
/// The time zone in which the browser runtime shows the values of <see cref="CanopyColumnKind.DateTime"/> columns.
/// </summary>
public enum CanopyTimeZone {
    /// <summary>UTC, shown as <c>yyyy-MM-dd HH:mm UTC</c>. The tooltip gives the reader's local time.</summary>
    Utc = 0,

    /// <summary>The reader's own time zone, shown as <c>yyyy-MM-dd HH:mm</c>. The tooltip gives the time in UTC.</summary>
    Local
}
