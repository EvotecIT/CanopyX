namespace CanopyX.Html;

/// <summary>
/// The colour theme of a view.
/// </summary>
public enum CanopyTheme {
    /// <summary>Follows the reader's system preference (<c>prefers-color-scheme</c>).</summary>
    Auto = 0,

    /// <summary>Always light.</summary>
    Light,

    /// <summary>Always dark.</summary>
    Dark
}
