using System;
using System.Collections.Generic;
using System.Globalization;

namespace CanopyX.Rendering;

/// <summary>
/// Options for <see cref="CanopyStaticHtml"/>.
/// </summary>
public sealed class CanopyStaticHtmlOptions {
    private int _maxRows = 1000;
    private int _maxDepth = int.MaxValue;
    private CultureInfo _culture = CultureInfo.InvariantCulture;
    private CanopyStaticTheme _theme = new CanopyStaticTheme();

    /// <summary>Gets or sets the most rows the outline shows; later rows are counted in the overflow note. Defaults to 1,000.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is below 1.</exception>
    public int MaxRows {
        get => _maxRows;
        set => _maxRows = value >= 1 ? value : throw new ArgumentOutOfRangeException(nameof(value), value, "Show at least one row.");
    }

    /// <summary>Gets or sets how many levels the outline shows, counting the top level as 1. Defaults to all levels.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is below 1.</exception>
    public int MaxDepth {
        get => _maxDepth;
        set => _maxDepth = value >= 1 ? value : throw new ArgumentOutOfRangeException(nameof(value), value, "Show at least one level.");
    }

    /// <summary>
    /// Gets or sets whether only the children of nodes marked <see cref="CanopyNode.Expanded"/> are shown, so the
    /// outline matches the tree's initial state. Defaults to false (every level up to <see cref="MaxDepth"/>).
    /// </summary>
    public bool OnlyExpanded { get; set; }

    /// <summary>Gets or sets the caption above the table. Defaults to the view label; an empty string shows none.</summary>
    public string? Caption { get; set; }

    /// <summary>
    /// Gets or sets the note shown when rows were left out, whether by <see cref="MaxRows"/>, <see cref="MaxDepth"/>,
    /// <see cref="OnlyExpanded"/>, or children a sidecar or remote source would load. <c>{shown}</c> is replaced by the
    /// rows shown and <c>{total}</c> by the rows in the tree. Defaults to "Showing {shown} of {total} rows.".
    /// </summary>
    public string OverflowNote { get; set; } = "Showing {shown} of {total} rows.";

    /// <summary>Gets or sets the culture that formats the counts in the note and the row markers. Defaults to the invariant culture.</summary>
    /// <exception cref="ArgumentNullException">The value is null.</exception>
    public CultureInfo Culture {
        get => _culture;
        set => _culture = value ?? throw new ArgumentNullException(nameof(value));
    }

    /// <summary>
    /// Gets or sets the tooltip of the "(+N)" marker on a row whose children are not shown. <c>{count}</c> is replaced
    /// by the number of hidden rows. Defaults to "{count} rows below are not shown".
    /// </summary>
    public string HiddenRowsTitle { get; set; } = "{count} rows below are not shown";

    /// <summary>
    /// Gets or sets the colours of the outline. Defaults to the light theme; assign
    /// <see cref="CanopyStaticTheme.Dark"/> for a dark document, or set the colours a host's design tokens resolve to.
    /// </summary>
    /// <exception cref="ArgumentNullException">The value is null.</exception>
    public CanopyStaticTheme Theme {
        get => _theme;
        set => _theme = value ?? throw new ArgumentNullException(nameof(value));
    }

    /// <summary>
    /// Gets or sets whether each colour is also written as the CSS custom property the browser runtime is themed
    /// with (<c>--cx-surface</c>, <c>--cx-text</c>, <c>--cx-accent</c>, <c>--cx-line</c>, <c>--cx-tone-&lt;name&gt;</c>,
    /// and <c>--cx-tone-&lt;name&gt;-bg</c>), after the literal from <see cref="Theme"/> and <see cref="ToneColors"/>.
    /// The outline then follows the theme of the page it is in, without script: inside an element with the class
    /// <c>cx-static</c> it takes the light or dark palette of <c>canopyx.css</c> by the element's
    /// <c>data-cx-theme</c> (<c>light</c>, <c>dark</c>, or <c>auto</c> for the reader's system preference), and a
    /// host that sets those properties from its design tokens for the grid sets them for the outline with the same
    /// rule. Where the properties are not defined, and in clients that do not know custom properties (email, Word),
    /// the literals apply. Colours in <see cref="ToneColors"/> are literals of one theme: a page that can turn dark
    /// defines <c>--cx-tone-&lt;name&gt;</c> for its own tones. Defaults to false, which writes literals only: the
    /// safest form for email.
    /// </summary>
    public bool UseThemeVariables { get; set; }

    /// <summary>
    /// Gets the text colours of the host's own tones (see <see cref="CanopyTone.Named"/>), each as a hex colour such
    /// as <c>#b3261e</c>, to go with <see cref="Theme"/>. A host tone without an entry keeps the normal text colour,
    /// unless <see cref="UseThemeVariables"/> is on and the page defines it. The colours of the tones CanopyX ships
    /// belong to the theme. Rendering rejects a colour that is not <c>#</c> followed by three or six hex digits,
    /// because the value goes into an inline style.
    /// </summary>
    public IDictionary<CanopyTone, string> ToneColors { get; } = new Dictionary<CanopyTone, string>();

    /// <summary>Gets or sets an address added to the overflow note. Relative URLs and HTTP, HTTPS, or mailto links are allowed; other schemes are omitted.</summary>
    public string? FullReportUrl { get; set; }

    /// <summary>Gets or sets the text of the link to <see cref="FullReportUrl"/>. Defaults to "Open the full report".</summary>
    public string FullReportText { get; set; } = "Open the full report";
}
