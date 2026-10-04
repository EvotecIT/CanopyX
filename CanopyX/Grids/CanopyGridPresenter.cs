using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An immutable presentation descriptor for a reporting-grid column.</summary>
/// <remarks>Presenters do not change search, sort or export values. Custom DOM renderers remain an explicit host option.</remarks>
public sealed class CanopyGridPresenter {
    private CanopyGridPresenter(CanopyGridPresenterKind kind, string? hrefColumn = null, bool newWindow = false,
        string? glyph = null, double maximum = 100, string? separator = null, int limit = 3) {
        Kind = kind; HrefColumn = hrefColumn; NewWindow = newWindow; Glyph = glyph;
        Maximum = maximum; Separator = separator; Limit = limit;
    }

    /// <summary>Gets the presentation.</summary>
    public CanopyGridPresenterKind Kind { get; }
    /// <summary>Gets the optional declared text column supplying a link destination; null uses this cell's raw value.</summary>
    public string? HrefColumn { get; }
    /// <summary>Gets whether a link opens a separate window with opener access disabled.</summary>
    public bool NewWindow { get; }
    /// <summary>Gets the decorative text glyph used by an icon presenter.</summary>
    public string? Glyph { get; }
    /// <summary>Gets the progress maximum. Only the visual indicator is clamped.</summary>
    public double Maximum { get; }
    /// <summary>Gets the literal list separator.</summary>
    public string? Separator { get; }
    /// <summary>Gets the number of list items shown before a complete-text control.</summary>
    public int Limit { get; }

    /// <summary>Creates a link presenter. Unsafe destinations are shown as plain text.</summary>
    /// <param name="hrefColumn">Optional declared text-column ID containing the destination.</param>
    /// <param name="newWindow">Whether to open another window with <c>noopener noreferrer</c>.</param>
    /// <returns>The immutable descriptor.</returns>
    /// <exception cref="ArgumentException">The supplied column ID is empty.</exception>
    public static CanopyGridPresenter Link(string? hrefColumn = null, bool newWindow = false) {
        if (hrefColumn != null) CanopyIdentifiers.Require(hrefColumn, nameof(hrefColumn));
        return new CanopyGridPresenter(CanopyGridPresenterKind.Link, hrefColumn, newWindow);
    }

    /// <summary>Creates a decorative text glyph beside the cell's display text.</summary>
    /// <param name="glyph">A nonblank glyph of at most 32 code units. No markup is interpreted.</param>
    /// <returns>The immutable descriptor.</returns>
    /// <exception cref="ArgumentException">The glyph is blank or exceeds 32 code units.</exception>
    public static CanopyGridPresenter Icon(string glyph) {
        if (string.IsNullOrWhiteSpace(glyph) || glyph.Length > 32) throw new ArgumentException("A glyph needs 1 to 32 nonblank code units.", nameof(glyph));
        return new CanopyGridPresenter(CanopyGridPresenterKind.Icon, glyph: glyph);
    }

    /// <summary>Creates a progress presenter for a numeric column.</summary>
    /// <param name="maximum">A finite positive maximum within the binary64 safe-integer magnitude.</param>
    /// <returns>The immutable descriptor.</returns>
    /// <exception cref="ArgumentOutOfRangeException">The maximum is not positive, finite or safely bounded.</exception>
    public static CanopyGridPresenter Progress(double maximum = 100) {
        if (double.IsNaN(maximum) || double.IsInfinity(maximum) || maximum <= 0 || maximum > 9007199254740991d)
            throw new ArgumentOutOfRangeException(nameof(maximum));
        return new CanopyGridPresenter(CanopyGridPresenterKind.Progress, maximum: maximum);
    }

    /// <summary>Creates translated boolean labels; missing and nonboolean values retain normal formatting.</summary>
    /// <returns>The immutable descriptor.</returns>
    public static CanopyGridPresenter Boolean() => new CanopyGridPresenter(CanopyGridPresenterKind.Boolean);

    /// <summary>Creates a bounded preview of delimiter-separated text and a complete-text dialog.</summary>
    /// <param name="separator">A nonempty literal separator of at most 16 code units.</param>
    /// <param name="limit">The number of visible items, from 1 to 16.</param>
    /// <returns>The immutable descriptor.</returns>
    /// <exception cref="ArgumentException">The separator is empty or too long.</exception>
    /// <exception cref="ArgumentOutOfRangeException">The limit is outside 1 to 16.</exception>
    public static CanopyGridPresenter List(string separator = ",", int limit = 3) {
        if (string.IsNullOrEmpty(separator) || separator.Length > 16) throw new ArgumentException("A separator needs 1 to 16 code units.", nameof(separator));
        if (limit < 1 || limit > 16) throw new ArgumentOutOfRangeException(nameof(limit));
        return new CanopyGridPresenter(CanopyGridPresenterKind.List, separator: separator, limit: limit);
    }

    /// <summary>Creates a plain-text expansion control without changing virtual row height.</summary>
    /// <returns>The immutable descriptor.</returns>
    public static CanopyGridPresenter LongText() => new CanopyGridPresenter(CanopyGridPresenterKind.LongText);

    internal string WireKind => Kind switch {
        CanopyGridPresenterKind.Link => "link", CanopyGridPresenterKind.Icon => "icon",
        CanopyGridPresenterKind.Progress => "progress", CanopyGridPresenterKind.Boolean => "boolean",
        CanopyGridPresenterKind.List => "list", _ => "longText"
    };

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("kind", WireKind);
        if (HrefColumn != null) writer.Property("hrefColumn", HrefColumn);
        if (NewWindow) writer.Property("newWindow", true);
        if (Glyph != null) writer.Property("glyph", Glyph);
        if (Kind == CanopyGridPresenterKind.Progress) writer.Name("maximum").Number(Maximum);
        if (Separator != null) writer.Property("separator", Separator).Property("limit", Limit);
        writer.EndObject();
    }
}
