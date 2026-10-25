using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>Renders an accepted complete-query summary, including calendar/range labels and nested group totals, without scripts.</summary>
    /// <param name="view">The owning reporting-grid definition.</param>
    /// <param name="summary">A complete-query summary whose revision, ranges and values are validated before rendering.</param>
    /// <param name="options">Theme, culture, caption and maximum visible group rows.</param>
    /// <returns>An inline-styled summary table suitable for print, email and document hosts.</returns>
    public static string RenderGridSummary(CanopyDataGridView view, CanopyGridSummary summary, CanopyStaticHtmlOptions? options = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (summary == null) throw new ArgumentNullException(nameof(summary));
        var display = CanopyAggregateDisplay.FromSummary(view, summary);
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var aggregates = view.Reporting!.Aggregates;
        var levels = view.Reporting.Grouping is CanopyGridGrouping fixedGroup ?
            new List<CanopyGridGroupLevel> { new CanopyGridGroupLevel(fixedGroup.Column, fixedGroup.Descending) } : summary.Query.Levels(view);
        var html = new StringBuilder();
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.Table).Append("\">");
        var caption = settings.Caption ?? view.Label;
        if (caption.Length > 0) html.Append("<caption style=\"").Append(styles.Caption).Append("\">").Append(Encode(caption)).Append("</caption>");
        html.Append("<thead><tr><th scope=\"col\" style=\"").Append(styles.Header).Append("\">").Append(Encode(view.Label)).Append("</th>");
        foreach (var aggregate in aggregates) {
            html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append("\">").Append(Encode(aggregate.Label));
            if (aggregate.ShowAs != CanopyShowAs.Value) html.Append("<br><span style=\"").Append(styles.Hidden).Append("\">").Append(Encode(CanopyAggregateDisplay.Caption(aggregate.ShowAs, view.Labels))).Append("</span>");
            html.Append("</th>");
        }
        html.Append("</tr></thead><tbody>");
        void Values(IReadOnlyDictionary<string, CanopyAggregateDisplayValue> values) {
            foreach (var aggregate in aggregates) {
                var shownValue = values[aggregate.Id]; var value = shownValue.Value;
                var format = aggregate.Format ?? (aggregate.Counting ? CanopyGridNumberFormat.Fixed(0) : view.GetColumn(aggregate.Column).Format);
                var text = !value.HasValue ? string.Empty : CanopyAggregateDisplay.IsPercentage(shownValue.Mode) ? value.Value.ToString("P2", settings.Culture) : shownValue.Mode == CanopyShowAs.Rank ? value.Value.ToString("0", settings.Culture) : format?.Format(value.Value, settings.Culture) ?? value.Value.ToString("G", settings.Culture);
                html.Append("<td style=\"").Append(styles.Cell).Append("text-align:right;\">").Append(Encode(text)).Append("</td>");
            }
        }
        var shown = 0;
        void Groups(IList<CanopyGridGroup> groups, int depth) {
            foreach (var group in groups) {
                if (shown >= settings.MaxRows) return;
                var level = levels[depth];
                var text = group.Value?.Value == null ? view.Labels.GridGroupMissing : level.Bucket != null ?
                    level.Bucket.Label(CanopyNumericValues.ToDouble(group.Value.Value), settings.Culture) : group.Value.DisplayText(view.GetColumn(level.Column), view.Labels);
                html.Append("<tr><th scope=\"row\" style=\"").Append(styles.Cell).Append("text-align:left;padding-left:").Append(8 + depth * 16).Append("px;\">")
                    .Append(Encode(view.GetColumn(level.Column).Title)).Append(": ").Append(Encode(text)).Append(" (").Append(group.Count.ToString(settings.Culture)).Append(")</th>");
                Values(display.Groups[group.Key]); html.Append("</tr>"); shown++;
                Groups(group.Groups, depth + 1);
            }
        }
        Groups(summary.Groups, 0);
        int Count(IList<CanopyGridGroup> groups) => groups.Sum(group => 1 + Count(group.Groups));
        var totalGroups = Count(summary.Groups);
        if (shown < totalGroups) AppendOverflow(html, shown, totalGroups, aggregates.Count + 1, settings, styles, view.Labels);
        html.Append("</tbody><tfoot><tr><th scope=\"row\" style=\"").Append(styles.Header).Append("\">").Append(Encode(view.Labels.GridSummary)).Append("</th>");
        Values(display.Totals);
        return html.Append("</tr></tfoot></table>").ToString();
    }
}
