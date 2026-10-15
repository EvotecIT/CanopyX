using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>The inline style a row's formatting adds to its <c>tr</c>: the row tint, then the escape-hatch CSS.</summary>
    private static string FormatRowStyle(CanopyFormatOutcome? outcome, CanopyStaticStyles styles) {
        if (!(outcome?.Row is CanopyFormatPaint row)) return string.Empty;
        var style = new StringBuilder(row.Tone.Name != null ? styles.FormatRow(row.Tone) : string.Empty);
        if (row.Css != null) foreach (var entry in row.Css) style.Append(entry.Key).Append(':').Append(entry.Value).Append(';');
        return style.ToString();
    }

    /// <summary>The inline style a cell's formatting adds: tone, scale or the row accent of the first cell, then the escape-hatch CSS.</summary>
    private static string FormatCellStyle(CanopyFormatPaint? paint, CanopyFormatPaint? row, bool first, CanopyStaticStyles styles) {
        var style = new StringBuilder();
        if (first && row != null && row.Tone.Name != null) style.Append(styles.FormatAccent(row.Tone));
        if (paint == null) return style.ToString();
        if (paint.ScaleFrom is CanopyTone from && paint.ScaleTo is CanopyTone to) style.Append(styles.FormatScale(from, to, paint.ScaleWeight));
        if (paint.Tone.Name != null && (!paint.Bar.HasValue && paint.ScaleFrom == null || paint.Emphasis == CanopyFormatEmphasis.Text))
            style.Append(styles.FormatTone(paint.Tone, paint.Emphasis ?? CanopyFormatEmphasis.Fill));
        if (paint.Css != null) foreach (var entry in paint.Css) style.Append(entry.Key).Append(':').Append(entry.Value).Append(';');
        return style.ToString();
    }

    /// <summary>What screen readers and tooltips get for a formatted cell: the descriptions of its rules.</summary>
    private static string? FormatTitle(string? own, CanopyFormatPaint? paint, CanopyFormatPaint? row, bool first) {
        var parts = new List<string>();
        if (!string.IsNullOrEmpty(own)) parts.Add(own!);
        if (first && row != null) parts.AddRange(row.Descriptions);
        if (paint != null) foreach (var description in paint.Descriptions) if (!parts.Contains(description)) parts.Add(description);
        return parts.Count == 0 ? null : string.Join(", ", parts);
    }

    /// <summary>The bar and the icon before a cell's text (for the first cell, the row's icon first).</summary>
    private static void AppendFormatBefore(StringBuilder html, CanopyFormatPaint? paint, CanopyFormatPaint? row, bool first, CanopyStaticStyles styles) {
        if (first && row?.Glyph != null) html.Append("<span style=\"").Append(styles.FormatIcon(row.Tone)).Append("\">").Append(Encode(row.Glyph)).Append("</span>");
        if (paint == null) return;
        if (paint.Bar.HasValue) html.Append(styles.FormatBar(paint.BarTone, paint.Bar.Value));
        if (paint.Glyph != null) html.Append("<span style=\"").Append(styles.FormatIcon(paint.Tone)).Append("\">").Append(Encode(paint.Glyph)).Append("</span>");
    }

    /// <summary>The badge and the text cue after a cell's text (for the first cell, the row's as well).</summary>
    private static void AppendFormatAfter(StringBuilder html, CanopyFormatPaint? paint, CanopyFormatPaint? row, bool first, CanopyStaticStyles styles) {
        foreach (var target in first ? new[] { row, paint } : new[] { paint }) {
            if (target == null) continue;
            if (target.Badge != null) html.Append("<span style=\"").Append(styles.Badge(target.Tone.Name == null ? CanopyTone.Neutral : target.Tone)).Append("\">").Append(Encode(target.Badge)).Append("</span>");
            if (target.Cue != null) html.Append("<span style=\"").Append(styles.FormatCue).Append("\">").Append(Encode(target.Cue)).Append("</span>");
        }
    }

    /// <summary>The classes a cell's formatting adds (escape hatch); a row rule's classes go on the row.</summary>
    private static string? FormatClasses(CanopyFormatPaint? paint) => paint?.ClassName;

    /// <summary>A legend row under the table: each enabled rule with a label, in its tone and with its icon; bands list each band.</summary>
    private static void AppendFormatLegend(StringBuilder html, CanopyDataGridView view, int columnCount, CanopyStaticStyles styles, CultureInfo culture) {
        if (view.Formatting?.Legend != true) return;
        var items = new List<string>();
        foreach (var rule in view.FormatRules) {
            if (!rule.Enabled || rule.Label == null) continue;
            if (rule.Style.Bands.Count > 0) {
                for (var i = 0; i < rule.Style.Bands.Count; i++) {
                    var band = rule.Style.Bands[i];
                    var name = band.Label ?? (band.UpperBound.HasValue ? view.Labels.FormatUpTo + " " + band.UpperBound.Value.ToString("#,##0.###", culture) :
                        view.Labels.FormatAbove + " " + (i > 0 ? rule.Style.Bands[i - 1].UpperBound ?? 0 : 0).ToString("#,##0.###", culture));
                    items.Add(LegendItem(styles, band.Tone, CanopyFormatIcons.Glyph(band.Icon ?? rule.Style.Icon, band.Tone), rule.Label + ": " + name));
                }
            } else {
                var tone = rule.Style.Bar?.Tone.Name != null ? rule.Style.Bar.Tone : rule.Style.Scale != null ? rule.Style.Scale.Stops[rule.Style.Scale.Stops.Count - 1].Tone : rule.Style.Tone;
                var glyph = rule.Style.DrawsValue ? "■" : CanopyFormatIcons.Glyph(rule.Style.Icon, rule.Style.Tone);
                items.Add(LegendItem(styles, tone, glyph, rule.Label));
            }
        }
        if (items.Count == 0) return;
        html.Append("<tbody><tr><td colspan=\"").Append(columnCount).Append("\" style=\"").Append(styles.Note).Append("\">")
            .Append(Encode(view.Labels.FormatLegend)).Append(": ").Append(string.Join(" &#183; ", items)).Append("</td></tr></tbody>");
    }

    private static string LegendItem(CanopyStaticStyles styles, CanopyTone tone, string? glyph, string text) =>
        (glyph == null ? string.Empty : "<span style=\"" + styles.FormatIcon(tone) + "\">" + Encode(glyph) + "</span>") + Encode(text);
}
