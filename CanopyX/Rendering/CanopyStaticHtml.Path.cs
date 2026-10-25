using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>Renders explicit chains through the grid fallback dispatcher. The row budget counts step occurrences,
    /// including repeated records. A supplied snapshot omits a whole chain if any of its records are absent.</summary>
    private static CanopyStaticHtmlResult RenderPathRows(CanopyDataGridView view, IList<CanopyGridRow> supplied,
        int matching, int offset, CanopyStaticHtmlOptions? options) {
        var path = view.Path!;
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var titleColumn = path.TitleColumn == null
            ? view.Columns.FirstOrDefault(column => column.RowHeader) ?? view.Columns.First(column => !column.Hidden)
            : view.GetColumn(path.TitleColumn);
        var rows = supplied.ToDictionary(row => row.Id, System.StringComparer.Ordinal);
        var total = path.Chains.Sum(chain => chain.Hops.Count);
        var captured = new List<IReadOnlyList<string>>();
        var html = new StringBuilder();
        html.Append("<div style=\"font-family:Segoe UI,Arial,sans-serif;color:").Append(settings.Theme.Text)
            .Append(";background:").Append(settings.Theme.Surface).Append(";overflow-wrap:anywhere;\">");
        var caption = settings.Caption ?? view.Label;
        if (caption.Length > 0) html.Append("<h2 style=\"font-size:18px;margin:0 0 12px;\">").Append(Encode(caption)).Append("</h2>");
        if (path.Chains.Count == 0) html.Append("<p>").Append(Encode(view.Labels.PathEmpty)).Append("</p>");
        foreach (var chain in path.Chains) {
            if (captured.Count >= settings.MaxRows) break;
            if (chain.Hops.Any(hop => !rows.ContainsKey(hop.Record))) continue;
            html.Append("<section style=\"margin:0 0 18px;\"><h3 style=\"font-size:15px;margin:0 0 8px;\">")
                .Append(Encode(chain.Label)).Append("</h3><ol style=\"margin:0;padding-left:28px;\">");
            for (var index = 0; index < chain.Hops.Count && captured.Count < settings.MaxRows; index++) {
                var hop = chain.Hops[index];
                var row = rows[hop.Record];
                row.Cells.TryGetValue(titleColumn.Id, out var cell);
                var text = new StringBuilder();
                html.Append("<li style=\"padding:8px 10px;margin:0 0 8px;border:1px solid ")
                    .Append(settings.Theme.Line).Append(";break-inside:avoid;\">");
                html.Append("<div style=\"font-size:12px;margin-bottom:4px;\">");
                AppendVisibleText(html, view.Labels.PathStep.Replace("{number}", (index + 1).ToString(settings.Culture))
                    .Replace("{total}", chain.Hops.Count.ToString(settings.Culture)), text);
                if (index == 0) { html.Append(" · "); AppendVisibleText(html, view.Labels.PathSource, text, true); }
                if (index == chain.Hops.Count - 1) { html.Append(" · "); AppendVisibleText(html, view.Labels.PathTarget, text, true); }
                html.Append("</div><strong>");
                var title = GridPresenterText(view, row, titleColumn, cell);
                AppendVisibleText(html, title.Length > 0 ? title : row.Id, text, true);
                html.Append("</strong>");
                if (cell != null && cell.HasBadges) AppendBadges(html, cell.Badges, styles, text);
                if (hop.Label != null) {
                    html.Append("<div style=\"margin-top:4px;\">");
                    AppendVisibleText(html, hop.Label, text, true);
                    html.Append("</div>");
                }
                foreach (var flag in hop.Flags) {
                    var label = flag == CanopyPathFlag.Cycle ? view.Labels.PathCycle
                        : flag == CanopyPathFlag.Foreign ? view.Labels.PathForeign : view.Labels.PathDisabled;
                    var tone = flag == CanopyPathFlag.Cycle ? CanopyTone.Warning
                        : flag == CanopyPathFlag.Foreign ? CanopyTone.Info : CanopyTone.Muted;
                    AppendBadges(html, new[] { new CanopyBadge(label, tone) }, styles, text);
                }
                AppendBadges(html, hop.Badges, styles, text);
                html.Append("</li>");
                captured.Add(new List<string> { text.ToString() }.AsReadOnly());
            }
            html.Append("</ol></section>");
        }
        var complete = captured.Count == total && offset == 0 && matching == supplied.Count;
        if (!complete) {
            html.Append("<p style=\"margin:12px 0 0;\">");
            var noteSettings = new CanopyStaticHtmlOptions {
                OverflowNote = settings.OverflowNote ?? view.Labels.PathPartial, Culture = settings.Culture,
                FullReportUrl = settings.FullReportUrl, FullReportText = settings.FullReportText
            };
            AppendOverflowContent(html, captured.Count, total, noteSettings, styles, view.Labels);
            html.Append("</p>");
        }
        return new CanopyStaticHtmlResult(html.Append("</div>").ToString(), captured.AsReadOnly(), total, false, complete);
    }
}
