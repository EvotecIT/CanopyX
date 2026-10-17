using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// How a formatting rule paints: a theme tone with an emphasis, an icon, a badge and a text cue, or one of a data bar, a
/// colour scale and threshold bands. <see cref="ClassName"/> and <see cref="Css"/> are the escape hatch for what tones do not cover.
/// </summary>
/// <remarks>
/// Formatting is never colour alone: a style that only colours gets its tone's icon (<see cref="CanopyFormatIcons.Automatic"/>)
/// unless it sets <see cref="CanopyFormatIcons.None"/>, and every formatted cell carries its rule's description for screen readers.
/// </remarks>
public sealed class CanopyFormatStyle {
    /// <summary>Gets or sets the tone: a built-in one or a host tone the theme defines. None leaves the colours.</summary>
    public CanopyTone Tone { get; set; }

    /// <summary>Gets or sets how the tone appears. Defaults to a fill.</summary>
    public CanopyFormatEmphasis Emphasis { get; set; }

    /// <summary>Gets or sets the icon: a <see cref="CanopyFormatIcons"/> name or up to four characters. Null is automatic.</summary>
    public string? Icon { get; set; }

    /// <summary>Gets or sets a badge's text (at most 64 characters), drawn after the value in the tone.</summary>
    public string? Badge { get; set; }

    /// <summary>Gets or sets a text cue (at most 64 characters), drawn after the value in quiet text.</summary>
    public string? Cue { get; set; }

    /// <summary>Gets or sets a data bar for the rule's column.</summary>
    public CanopyFormatDataBar? Bar { get; set; }

    /// <summary>Gets or sets a colour scale for the rule's column.</summary>
    public CanopyFormatColorScale? Scale { get; set; }

    /// <summary>Gets the threshold bands for the rule's column, 1 to 16, or none.</summary>
    public IList<CanopyFormatBand> Bands { get; } = new List<CanopyFormatBand>();

    /// <summary>Gets or sets extra CSS classes (escape hatch), at most 1,024 characters without control characters.</summary>
    public string? ClassName { get; set; }

    /// <summary>Gets plain CSS declarations by property (escape hatch): up to 16, without url(), expressions, imports or braces.</summary>
    public IDictionary<string, string> Css { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Returns a highlight in a tone.</summary>
    /// <param name="tone">The tone.</param>
    /// <param name="icon">An icon, or null for the tone's own.</param>
    /// <returns>The style.</returns>
    public static CanopyFormatStyle Highlight(CanopyTone tone, string? icon = null) => new CanopyFormatStyle { Tone = tone, Icon = icon };

    /// <summary>Returns a data bar.</summary>
    /// <param name="tone">The bar's tone.</param>
    /// <param name="minimum">The value of an empty bar, or null for automatic.</param>
    /// <param name="maximum">The value of a full bar, or null for automatic.</param>
    /// <returns>The style.</returns>
    public static CanopyFormatStyle DataBar(CanopyTone tone, double? minimum = null, double? maximum = null) =>
        new CanopyFormatStyle { Bar = new CanopyFormatDataBar { Tone = tone, Minimum = minimum, Maximum = maximum } };

    /// <summary>Returns a colour scale.</summary>
    /// <param name="scale">The scale.</param>
    /// <returns>The style.</returns>
    public static CanopyFormatStyle ColorScale(CanopyFormatColorScale scale) => new CanopyFormatStyle { Scale = scale ?? throw new ArgumentNullException(nameof(scale)) };

    /// <summary>Returns threshold bands.</summary>
    /// <param name="bands">The bands, rising.</param>
    /// <returns>The style.</returns>
    public static CanopyFormatStyle ThresholdBands(params CanopyFormatBand[] bands) {
        var style = new CanopyFormatStyle();
        foreach (var band in bands ?? throw new ArgumentNullException(nameof(bands))) style.Bands.Add(band ?? throw new ArgumentException("Bands cannot be null.", nameof(bands)));
        return style;
    }

    internal bool DrawsValue => Bar != null || Scale != null || Bands.Count > 0;

    internal static void ValidateText(string? value, int limit, string name) {
        if (value == null) return;
        if (value.Trim().Length == 0 || value.Length > limit) throw new ArgumentException("Formatting text has 1 to " + limit + " visible characters.", name);
        foreach (var unit in value) if (char.IsControl(unit)) throw new ArgumentException("Formatting text cannot contain control characters.", name);
    }

    internal void Validate(bool rowTarget, bool hasColumn) {
        if (!Enum.IsDefined(typeof(CanopyFormatEmphasis), Emphasis)) throw new ArgumentOutOfRangeException(nameof(Emphasis));
        CanopyFormatIcons.Validate(Icon);
        try { ValidateText(Badge, 64, nameof(Badge)); ValidateText(Cue, 64, nameof(Cue)); }
        catch (ArgumentException error) { throw new InvalidOperationException(error.Message, error); }
        if (ClassName != null) CanopyGridHighlightRule.ValidateClassName(ClassName);
        if (Css.Count > 16) throw new InvalidOperationException("A formatting style has at most 16 CSS declarations.");
        foreach (var entry in Css) {
            if (!IsCssName(entry.Key) || entry.Value == null || entry.Value.Length > 200 || UnsafeCss(entry.Value))
                throw new InvalidOperationException("Formatting CSS takes plain declarations without url(), image sources, expressions, imports, quotes, braces or semicolons.");
        }
        var visuals = (Bar != null ? 1 : 0) + (Scale != null ? 1 : 0) + (Bands.Count > 0 ? 1 : 0);
        if (visuals > 1) throw new InvalidOperationException("A rule draws one of a data bar, a colour scale or threshold bands.");
        if (visuals == 1 && (rowTarget || !hasColumn)) throw new InvalidOperationException("Bars, scales and bands read the rule's column and paint cells.");
        Bar?.Validate(); Scale?.Validate();
        if (Bands.Count > 16) throw new InvalidOperationException("Threshold bands are 1 to 16 bands.");
        for (var i = 0; i < Bands.Count; i++) {
            var band = Bands[i] ?? throw new InvalidOperationException("Threshold bands cannot contain a null band.");
            CanopyFormatIcons.Validate(band.Icon);
            if (!band.UpperBound.HasValue && i != Bands.Count - 1 || i > 0 && band.UpperBound.HasValue && Bands[i - 1].UpperBound >= band.UpperBound)
                throw new InvalidOperationException("Threshold bands rise, and only the last may be open.");
        }
        if (Tone.Name == null && (Icon == null || Icon == CanopyFormatIcons.None) && Badge == null && Cue == null && ClassName == null && Css.Count == 0 && visuals == 0)
            throw new InvalidOperationException("A formatting rule needs a style.");
    }

    private static bool IsCssName(string name) {
        if (string.IsNullOrEmpty(name) || name.Length > 66) return false;
        var start = name.StartsWith("--", StringComparison.Ordinal) ? 2 : name[0] == '-' ? 1 : 0;
        if (start >= name.Length || name[start] < 'a' || name[start] > 'z') return false;
        for (var i = start; i < name.Length; i++) { var ch = name[i]; if (!(ch >= 'a' && ch <= 'z' || ch >= '0' && ch <= '9' || ch == '-')) return false; }
        return true;
    }

    private static readonly System.Text.RegularExpressions.Regex UnsafeValue = new System.Text.RegularExpressions.Regex(@"url\s*\(|image-set|image\(|src\s*\(|expression|javascript:|@import|[;{}<>\\""'&]",
        System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

    private static bool UnsafeCss(string value) => UnsafeValue.IsMatch(value);

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().OptionalProperty("tone", Tone.Name);
        if (Emphasis != CanopyFormatEmphasis.Fill) writer.Property("emphasis", CanopyFormatNames.Wire(Emphasis));
        writer.OptionalProperty("icon", Icon).OptionalProperty("badge", Badge).OptionalProperty("cue", Cue);
        if (Bar != null) { writer.Name("bar"); Bar.WriteJson(writer); }
        if (Scale != null) { writer.Name("scale"); Scale.WriteJson(writer); }
        if (Bands.Count > 0) {
            writer.Name("bands").BeginArray();
            foreach (var band in Bands) band.WriteJson(writer);
            writer.EndArray();
        }
        writer.OptionalProperty("className", ClassName);
        if (Css.Count > 0) {
            writer.Name("css").BeginObject();
            foreach (var entry in Css) writer.Property(entry.Key, entry.Value);
            writer.EndObject();
        }
        writer.EndObject();
    }
}
