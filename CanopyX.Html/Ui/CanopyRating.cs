using System;
using System.Globalization;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds a star rating input, and read-only rating text (docs/ui-rating.md).</summary>
/// <remarks>The input is a native radio group, so it submits with a plain form, takes the arrow keys and reads well without the
/// runtime. This builder emits no assets or executable code.</remarks>
public sealed class CanopyRating {
    /// <summary>Creates a rating with a page-unique identity, a form field name and a plain text label.</summary>
    public CanopyRating(string id, string name, string label, CanopyRatingOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Name = UiHtml.Text(name, nameof(name));
        Label = UiHtml.Text(label, nameof(label));
        Options = options ?? new CanopyRatingOptions();
    }

    /// <summary>Gets the root DOM identity.</summary>
    public string Id { get; }
    /// <summary>Gets the form field name the chosen value submits under.</summary>
    public string Name { get; }
    /// <summary>Gets the visible label.</summary>
    public string Label { get; }
    /// <summary>Gets the typed options.</summary>
    public CanopyRatingOptions Options { get; }

    /// <summary>Renders the radio group with encoded text.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The number of steps or the starting value is out of range.</exception>
    public string ToHtmlFragment() {
        Steps(Options.Max);
        if (Options.Value != null && (Options.Value < 1 || Options.Value > Options.Max)) throw new ArgumentOutOfRangeException(nameof(Options.Value), "The value is 1 to the number of steps.");
        var labels = Options.Labels ?? new CanopyLabels();
        var html = new StringBuilder("<fieldset");
        UiHtml.Attribute(html, "id", Id);
        html.Append(" class=\"cx-rating\" data-cx-rating data-cx-part=\"rating\"");
        UiHtml.Attribute(html, "data-cx-variant", Options.Variant);
        UiHtml.Attribute(html, "data-max", UiHtml.Number(Options.Max));
        if (!Options.Clearable || Options.Required) UiHtml.Attribute(html, "data-clearable", "false");
        if (Options.Disabled) html.Append(" disabled");
        html.Append("><legend>").Append(UiHtml.Encode(Label)).Append("</legend><span class=\"cx-rating-options\">");
        for (var step = 1; step <= Options.Max; step++) {
            html.Append("<label class=\"cx-rating-option\"><input type=\"radio\"");
            UiHtml.Attribute(html, "name", Name);
            UiHtml.Attribute(html, "value", UiHtml.Number(step));
            if (step == Options.Value) html.Append(" checked");
            if (step == 1 && Options.Required) html.Append(" required");
            html.Append("><span class=\"cx-rating-text\">").Append(UiHtml.Encode(Words(labels, step, Options.Max))).Append("</span></label>");
        }
        return html.Append("</span></fieldset>").ToString();
    }

    /// <summary>Renders a read-only rating, for a report or a card: filled and empty stars with the value in words for screen readers.</summary>
    /// <param name="value">The rating, 0 to <paramref name="max"/>; fractions show to the nearest whole star and read exactly.</param>
    /// <param name="max">The number of steps, 2 to 10.</param>
    /// <param name="labels">The labels whose <c>RatingValue</c> says the value. Null uses English.</param>
    /// <remarks>The stars are the characters ★ and ☆, so the markup reads correctly with no stylesheet, in email and in print.</remarks>
    public static string Display(double value, int max = 5, CanopyLabels? labels = null) {
        Steps(max);
        if (double.IsNaN(value) || value < 0 || value > max) throw new ArgumentOutOfRangeException(nameof(value), "The value is 0 to the number of steps.");
        var filled = (int)Math.Round(value, MidpointRounding.AwayFromZero);
        var html = new StringBuilder("<span class=\"cx-rating-display\" role=\"img\"");
        UiHtml.Attribute(html, "aria-label", Words(labels ?? new CanopyLabels(), value, max));
        html.Append("><span class=\"cx-rating-on\" aria-hidden=\"true\">").Append('★', filled).Append("</span>");
        html.Append("<span class=\"cx-rating-off\" aria-hidden=\"true\">").Append('☆', max - filled).Append("</span></span>");
        return html.ToString();
    }

    private static string Words(CanopyLabels labels, double value, int max) =>
        labels.RatingValue.Replace("{value}", value.ToString("0.##", CultureInfo.InvariantCulture)).Replace("{max}", max.ToString(CultureInfo.InvariantCulture));

    private static void Steps(int max) {
        if (max < 2 || max > 10) throw new ArgumentOutOfRangeException(nameof(max), "A rating has 2 to 10 steps.");
    }
}
