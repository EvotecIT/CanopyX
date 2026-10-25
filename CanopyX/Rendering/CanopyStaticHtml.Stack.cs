using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>Renders host-ordered layers, reserving a row-budget slot for the winner when truncation would omit it.
    /// Counts describe layers, including repeated record references. Grid query windows do not remove stack context.</summary>
    internal static CanopyStaticHtmlResult RenderStackRows(CanopyDataGridView view, IList<CanopyGridRow> supplied, int? matching, int offset, CanopyStaticHtmlOptions? options) {
        var stack = view.Stack!;
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var titleColumn = stack.ResolveTitleColumn(view);
        var records = view.Rows.ToDictionary(row => row.Id);
        foreach (var row in supplied) records[row.Id] = row;
        var selected = Enumerable.Range(0, System.Math.Min(stack.Layers.Count, settings.MaxRows)).ToList();
        var winnerIndex = -1;
        for (var index = 0; index < stack.Layers.Count; index++) if (stack.Layers[index].Winner) winnerIndex = index;
        if (winnerIndex >= 0 && !selected.Contains(winnerIndex)) {
            selected[selected.Count - 1] = winnerIndex;
            selected.Sort();
        }
        var html = new StringBuilder();
        var captured = new List<IReadOnlyList<string>>();
        html.Append("<div style=\"").Append(styles.Table).Append("overflow-wrap:anywhere;\">");
        var caption = settings.Caption ?? view.Label;
        if (caption.Length > 0) html.Append("<h2 style=\"font-size:18px;margin:0 0 12px;\">").Append(Encode(caption)).Append("</h2>");
        if (winnerIndex < 0) html.Append("<p>").Append(Encode(view.Labels.StackEmpty)).Append("</p>");
        else {
            var winner = stack.Layers[winnerIndex];
            html.Append("<p style=\"margin:0 0 12px;\"><strong>").Append(Encode(view.Labels.StackWinner)).Append(": ")
                .Append(Encode(StackTitle(records[winner.Record], titleColumn, view.Labels))).Append("</strong><br>")
                .Append(Encode(winner.Reason)).Append("</p>");
            html.Append("<h3 style=\"font-size:14px;margin:12px 0 8px;\">").Append(Encode(view.Labels.StackOrder)).Append("</h3>");
            html.Append("<ol style=\"margin:0;padding-left:28px;\">");
            foreach (var index in selected) AppendStackLayer(html, view, stack.Layers[index], records[stack.Layers[index].Record], titleColumn, index, settings, styles, captured);
            html.Append("</ol>");
        }
        if (selected.Count < stack.Layers.Count) {
            var note = new CanopyStaticHtmlOptions {
                OverflowNote = settings.OverflowNote ?? view.Labels.StackTruncated, Culture = settings.Culture,
                FullReportUrl = settings.FullReportUrl, FullReportText = settings.FullReportText
            };
            html.Append("<p style=\"").Append(styles.Note).Append("\">");
            AppendOverflowContent(html, selected.Count, stack.Layers.Count, note, styles, view.Labels);
            html.Append("</p>");
        }
        return new CanopyStaticHtmlResult(html.Append("</div>").ToString(), captured.AsReadOnly(), stack.Layers.Count, false, selected.Count == stack.Layers.Count);
    }

    private static void AppendStackLayer(StringBuilder html, CanopyDataGridView view, CanopyStackLayer layer, CanopyGridRow row,
        CanopyColumn titleColumn, int index, CanopyStaticHtmlOptions settings, CanopyStaticStyles styles, List<IReadOnlyList<string>> captured) {
        var title = StackTitle(row, titleColumn, view.Labels);
        var order = (index + 1).ToString(settings.Culture);
        var states = new List<string>();
        var stateBadges = new List<CanopyBadge>();
        if (layer.Winner) { states.Add(view.Labels.StackWinner); stateBadges.Add(new CanopyBadge(view.Labels.StackWinner, CanopyTone.Success)); }
        if (layer.Enforced) { states.Add(view.Labels.StackEnforced); stateBadges.Add(new CanopyBadge(view.Labels.StackEnforced, CanopyTone.Info)); }
        if (layer.Filtered) { states.Add(view.Labels.StackFiltered); stateBadges.Add(new CanopyBadge(view.Labels.StackFiltered, CanopyTone.Neutral)); }
        html.Append("<li value=\"").Append(index + 1).Append("\" style=\"margin:0 0 10px;padding:8px;border:1px solid ")
            .Append(settings.Theme.Line).Append(";break-inside:avoid;\"><strong>").Append(Encode(title)).Append("</strong>");
        AppendBadges(html, stateBadges, styles);
        if (!string.IsNullOrEmpty(layer.Label)) html.Append("<div style=\"margin-top:4px;\">").Append(Encode(layer.Label!)).Append("</div>");
        html.Append("<p style=\"margin:6px 0;white-space:pre-wrap;\">").Append(Encode(layer.Reason)).Append("</p>");
        var badgeText = new StringBuilder();
        AppendBadges(html, layer.Badges, styles, badgeText);
        html.Append("</li>");
        captured.Add(new[] { order, title, layer.Label ?? string.Empty, layer.Reason, string.Join(" ", states), badgeText.ToString().Trim() });
    }

    private static string StackTitle(CanopyGridRow row, CanopyColumn column, CanopyLabels labels) {
        var text = row.Cells.TryGetValue(column.Id, out var cell) && cell != null ? cell.DisplayText(column, labels) : null;
        return string.IsNullOrEmpty(text) ? row.Id : text!;
    }
}
