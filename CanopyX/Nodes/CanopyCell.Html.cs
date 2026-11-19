using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace CanopyX;

public sealed partial class CanopyCell {
    internal const int MaxHtmlLength = 65536;

    /// <summary>
    /// Gets or sets markup a flat grid shows in place of the cell's text: a small, sanitised subset of HTML for badges, emphasis,
    /// line breaks and links (see docs/data-protocol.md, "Rich cells"). The value and text still drive sorting, filtering,
    /// search, copy and exports, and the static outline shows the text.
    /// </summary>
    /// <remarks>
    /// The browser keeps only allowed elements, attributes and styles and builds them as elements; it never inserts the markup
    /// itself. Anything else, scripts and event handlers among them, is dropped. At most 65,536 code units.
    /// </remarks>
    public string? Html { get => _extras?.Html; set { if (value != null || _extras != null) Extras.Html = value; } }

    /// <summary>Creates a cell that shows sanitised markup and holds its plain text as the value.</summary>
    /// <param name="html">The markup; see <see cref="Html"/>.</param>
    /// <param name="text">The plain text for sorting, search and exports; by default the markup's text content.</param>
    /// <returns>The cell.</returns>
    public static CanopyCell FromHtml(string html, string? text = null) =>
        new CanopyCell(text ?? HtmlText(html ?? throw new System.ArgumentNullException(nameof(html)))) { Html = html };

    private static readonly Regex HiddenElements = new Regex(@"<(script|style|template|noscript|textarea|title)\b[\s\S]*?</\1\s*>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, System.TimeSpan.FromSeconds(1));
    private static readonly Regex Breaks = new Regex(@"<(?:br|/p|/div|/li)\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, System.TimeSpan.FromSeconds(1));
    private static readonly Regex Tags = new Regex(@"<!--[\s\S]*?-->|<[^>]*>", RegexOptions.CultureInvariant, System.TimeSpan.FromSeconds(1));

    /// <summary>The text a reader would see of the markup, for the value of an HTML cell: tags removed, entities decoded, spaces collapsed.</summary>
    internal static string HtmlText(string html) {
        var text = WebUtility.HtmlDecode(Tags.Replace(Breaks.Replace(HiddenElements.Replace(html, " "), " "), string.Empty));
        var builder = new StringBuilder(text.Length);
        var space = false;
        foreach (var character in text) {
            if (char.IsWhiteSpace(character)) { space = builder.Length > 0; continue; }
            if (space) { builder.Append(' '); space = false; }
            builder.Append(character);
        }
        return builder.ToString();
    }
}
