using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>Renders board cards through the shared static owner, retaining lane order and captured cell text.</summary>
    private static CanopyStaticHtmlResult RenderBoardRows(CanopyDataGridView view, IList<CanopyGridRow> supplied, int matching, int offset, CanopyStaticHtmlOptions? options) {
        var board = view.Board!;
        var captured = new List<IReadOnlyList<string>>();
        var settings = options ?? new CanopyStaticHtmlOptions();
        var rows = supplied.ToList();
        var lanes = board.GetLanes(view, rows);
        var visible = new HashSet<CanopyGridRow>(rows.Take(settings.MaxRows));
        var groups = board.SwimlaneColumn == null ? null : new CanopyBoard(board.SwimlaneColumn).GetLanes(view, rows);
        var projection = BoardCardView(view, board);
        var cardOptions = BoardCardOptions(settings);
        var html = new StringBuilder();
        var theme = settings.Theme;
        var style = "font-family:Segoe UI,Arial,sans-serif;color:" + theme.Text + ";background:" + theme.Surface + ";";
        html.Append("<div style=\"").Append(style).Append("\">");
        var caption = settings.Caption ?? view.Label;
        if (caption.Length > 0) html.Append("<h2 style=\"font-size:18px;margin:0 0 12px;\">").Append(BoardEncode(caption)).Append("</h2>");
        if (groups == null) AppendBoardLanes(html, view, rows, lanes, visible, projection, cardOptions, settings, captured);
        else foreach (var group in groups) {
            html.Append("<h3 style=\"font-size:16px;margin:16px 0 8px;\">").Append(BoardEncode(group.Label)).Append("</h3>");
            var groupRows = rows.Where(row => BoardMatches(group, row, board.SwimlaneColumn!)).ToList();
            AppendBoardLanes(html, view, groupRows, lanes, visible, projection, cardOptions, settings, captured, rows);
        }
        if (visible.Count < matching || offset > 0) {
            html.Append("<p style=\"margin:12px 0 0;\">");
            AppendOverflowContent(html, visible.Count, matching, settings, new CanopyStaticStyles(settings), view.Labels);
            html.Append("</p>");
        }
        if (rows.Count == 0 && lanes.Count == 0) html.Append("<p>").Append(BoardEncode(view.Labels.BoardEmpty)).Append("</p>");
        return new CanopyStaticHtmlResult(html.Append("</div>").ToString(), captured, matching, false, visible.Count >= matching && offset == 0);
    }

    private static void AppendBoardLanes(StringBuilder html, CanopyDataGridView view, IList<CanopyGridRow> rows,
        IReadOnlyList<CanopyBoardLane> lanes, HashSet<CanopyGridRow> visible, CanopyDataGridView projection,
        CanopyStaticHtmlOptions cardOptions, CanopyStaticHtmlOptions settings, List<IReadOnlyList<string>> captured, IList<CanopyGridRow>? allRows = null) {
        if (lanes.Count == 0) return;
        var board = view.Board!;
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;table-layout:fixed;border-collapse:collapse;\"><thead><tr>");
        foreach (var lane in lanes) {
            var count = rows.Count(row => BoardMatches(lane, row, board.Column));
            var total = (allRows ?? rows).Count(row => BoardMatches(lane, row, board.Column));
            html.Append("<th scope=\"col\" style=\"text-align:left;vertical-align:top;padding:8px;border:1px solid ")
                .Append(settings.Theme.Line).Append(";\">").Append(BoardEncode(lane.Label)).Append(" (").Append(count.ToString("N0", settings.Culture)).Append(')');
            if (lane.WipLimit.HasValue) {
                var wip = view.Labels.BoardWip.Replace("{count}", total.ToString("N0", settings.Culture))
                    .Replace("{limit}", lane.WipLimit.Value.ToString("N0", settings.Culture));
                html.Append("<div style=\"font-weight:normal;\">").Append(BoardEncode(wip)).Append("</div>");
                if (total >= lane.WipLimit.Value) {
                    var warning = view.Labels.BoardWipFull.Replace("{lane}", lane.Label).Replace("{limit}", lane.WipLimit.Value.ToString("N0", settings.Culture));
                    html.Append("<div style=\"color:").Append(settings.Theme.Warning).Append(";font-weight:normal;\">").Append(BoardEncode(warning)).Append("</div>");
                }
            }
            html.Append("</th>");
        }
        html.Append("</tr></thead><tbody><tr>");
        foreach (var lane in lanes) {
            html.Append("<td style=\"vertical-align:top;padding:8px;border:1px solid ").Append(settings.Theme.Line).Append(";\">");
            var records = rows.Where(row => visible.Contains(row) && BoardMatches(lane, row, board.Column)).ToList();
            foreach (var row in records) {
                projection.Rows.Clear();
                var record = new CanopyGridRow(row.Id) { Tone = row.Tone };
                foreach (var cell in row.Cells) record.Cells[cell.Key] = cell.Value;
                projection.Rows.Add(record);
                AppendBoardCard(html, projection, record, cardOptions, captured);
            }
            if (!rows.Any(row => BoardMatches(lane, row, board.Column))) html.Append(BoardEncode(view.Labels.BoardEmpty));
            html.Append("</td>");
        }
        html.Append("</tr></tbody></table>");
    }

    private static void AppendBoardCard(StringBuilder html, CanopyDataGridView projection, CanopyGridRow row, CanopyStaticHtmlOptions options, List<IReadOnlyList<string>> captured) {
        var rendered = CanopyStaticHtml.RenderGridWithResult(projection, options: options);
        captured.Add(rendered.Rows[0]);
        var columns = projection.Columns.Where(column => !column.Hidden).ToList();
        html.Append("<div style=\"margin:0 0 8px;padding:8px;border:1px solid ").Append(options.Theme.Line)
            .Append(";overflow-wrap:anywhere;\">");
        for (var index = 0; index < columns.Count; index++) {
            var title = index == 0;
            var column = columns[index];
            html.Append(title ? "<h4 style=\"margin:0 0 6px;font-size:14px;\">" : "<div style=\"margin:4px 0;\">");
            if (!title) html.Append("<span style=\"font-weight:600;\">").Append(BoardEncode(column.Title)).Append(": </span>");
            var text = BoardEncode(rendered.Rows[0][index]);
            var presenter = column.Presenter;
            row.Cells.TryGetValue(presenter?.HrefColumn ?? column.Id, out var linkCell);
            var url = linkCell?.Value as string;
            if (presenter?.Kind == CanopyGridPresenterKind.Link && IsSafeReportUrl(url)) {
                html.Append("<a href=\"").Append(BoardEncode(url!)).Append('"');
                if (presenter.NewWindow) html.Append(" target=\"_blank\" rel=\"noopener noreferrer\"");
                html.Append(" style=\"color:").Append(options.Theme.Accent).Append(";\">").Append(text).Append("</a>");
            } else html.Append(text);
            html.Append(title ? "</h4>" : "</div>");
        }
        html.Append("</div>");
    }

    private static bool BoardMatches(CanopyBoardLane lane, CanopyGridRow row, string column) {
        row.Cells.TryGetValue(column, out var cell);
        return lane.Matches(cell);
    }

    /// <summary>Projects card fields onto the existing grid renderer, retaining hidden presenter dependencies.</summary>
    private static CanopyDataGridView BoardCardView(CanopyDataGridView view, CanopyBoard board) {
        var title = board.TitleColumn == null ? view.Columns.FirstOrDefault(column => column.RowHeader) ?? view.Columns.First(column => !column.Hidden) : view.GetColumn(board.TitleColumn);
        var fields = new List<string>();
        if (title != null) fields.Add(title.Id);
        fields.AddRange(board.Fields.Count > 0 ? board.Fields : view.Columns.Where(column => !column.Hidden && column.Id != board.Column && column.Id != board.SwimlaneColumn).Select(column => column.Id));
        var ids = fields.Distinct(StringComparer.Ordinal).ToList();
        var result = new CanopyDataGridView(view.Id, view.Label) { Labels = view.Labels, TimeZone = view.TimeZone };
        foreach (var source in ids.Select(view.GetColumn).Concat(view.Columns.Where(column => !ids.Contains(column.Id)))) {
            var column = new CanopyColumn(source.Id, source.Title) {
                Kind = source.Kind, Format = source.Format, Presenter = source.Presenter, Wrap = true,
                Hidden = !ids.Contains(source.Id), RowHeader = title?.Id == source.Id
            };
            foreach (var item in source.ValueLabels) column.ValueLabels[item.Key] = item.Value;
            foreach (var item in source.ValueTones) column.ValueTones[item.Key] = item.Value;
            foreach (var item in source.NumericTones) column.NumericTones.Add(item);
            result.Columns.Add(column);
        }
        return result;
    }

    private static CanopyStaticHtmlOptions BoardCardOptions(CanopyStaticHtmlOptions settings) {
        var result = new CanopyStaticHtmlOptions { Caption = string.Empty, MaxRows = 1, Culture = settings.Culture, Theme = settings.Theme, UseThemeVariables = settings.UseThemeVariables };
        foreach (var color in settings.ToneColors) result.ToneColors[color.Key] = color.Value;
        return result;
    }

    private static string BoardEncode(string value) => WebUtility.HtmlEncode(value);
}
