using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>A script-free task snapshot. The shared grid renderer routes plan definitions here.</summary>
    private static CanopyStaticHtmlResult RenderPlanRows(CanopyDataGridView view, IList<CanopyGridRow> supplied, int? matching, int offset, CanopyStaticHtmlOptions? options) {
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var plan = view.Plan!;
        var calendar = view.Calendar!;
        var inline = view.Source.Kind == CanopyGridSourceKind.Inline;
        var network = CanopyPlanAnalysis.Build(view, inline ? view.Rows : supplied, inline);
        var labels = view.Labels;
        var titleColumn = calendar.Title ?? view.Columns.FirstOrDefault(column => column.RowHeader)?.Id ?? view.Columns.First().Id;
        var resourceNames = PlanResourceNames(calendar.Resources!.View.Roots);
        var headers = new[] { view.GetColumn(titleColumn).Title, labels.CalendarResources, labels.PlanActual, labels.PlanBaselineLabel, labels.PlanCritical, labels.PlanDependencies };
        var html = new StringBuilder(1024);
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.Table).Append(CanopyStaticStyles.PrintColors).Append("\">");
        var caption = settings.Caption ?? view.Label;
        if (caption.Length > 0) html.Append("<caption style=\"").Append(styles.Caption).Append("\">").Append(Encode(caption)).Append("</caption>");
        html.Append("<thead><tr>");
        foreach (var heading in headers) html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append("\">").Append(Encode(heading)).Append("</th>");
        html.Append("</tr></thead><tbody>");
        var printed = new List<IReadOnlyList<string>>();
        var shown = 0;
        foreach (var row in supplied.Take(settings.MaxRows)) {
            shown++;
            network.Tasks.TryGetValue(row.Id, out var task);
            var title = PlanCellText(row, titleColumn);
            if (task?.Milestone == true) title = "◆ " + title + " (" + labels.PlanMilestone + ")";
            var resource = PlanCellText(row, calendar.Resource!);
            if (resourceNames.TryGetValue(resource, out var name)) resource = name;
            var baselineStart = CanopyPlanAnalysis.Instant(row, plan.BaselineStart);
            var baselineEnd = CanopyPlanAnalysis.Instant(row, plan.BaselineEnd);
            var baseline = baselineStart.HasValue && baselineEnd.HasValue && baselineEnd >= baselineStart ? PlanDate(baselineStart, settings.Culture) + " – " + PlanDate(baselineEnd, settings.Culture) : string.Empty;
            var dependencies = new List<string>();
            foreach (var edge in task?.Before ?? Enumerable.Empty<CanopyPlanAnalysis.Edge>()) {
                var predecessor = PlanCellText(edge.From.Row, titleColumn);
                dependencies.Add(edge.Conflict ? labels.PlanDependencyConflict.Replace("{task}", predecessor) : predecessor);
            }
            var values = new[] { title, resource, task == null ? string.Empty : PlanDate(task.Start, settings.Culture) + " – " + PlanDate(task.End, settings.Culture), baseline,
                !network.Complete ? labels.PlanIncomplete : plan.CriticalPath && task?.Critical == true ? labels.PlanCritical : string.Empty, string.Join("; ", dependencies) };
            printed.Add(values);
            html.Append("<tr>");
            foreach (var value in values) html.Append("<td style=\"").Append(styles.Cell).Append("\">").Append(Encode(value)).Append("</td>");
            html.Append("</tr>");
        }
        var total = matching ?? (long)offset + supplied.Count;
        var complete = matching.HasValue && offset == 0 && shown == matching.Value;
        if (!complete) AppendOverflow(html, shown, matching, 6, settings, styles, labels);
        return new CanopyStaticHtmlResult(html.Append("</tbody></table>").ToString(), printed.AsReadOnly(), total, !matching.HasValue, complete);
    }

    private static string PlanDate(DateTimeOffset? value, CultureInfo culture) => value?.UtcDateTime.ToString("yyyy-MM-dd HH:mm 'UTC'", culture) ?? string.Empty;

    private static string PlanCellText(CanopyGridRow row, string column) => row.Cells.TryGetValue(column, out var cell) && cell != null ? cell.Text ?? Convert.ToString(cell.Value, CultureInfo.InvariantCulture) ?? string.Empty : string.Empty;

    private static Dictionary<string, string> PlanResourceNames(IList<CanopyNode> roots) {
        var names = new Dictionary<string, string>(StringComparer.Ordinal);
        var stack = new Stack<CanopyNode>(roots);
        while (stack.Count > 0) {
            var node = stack.Pop(); names[node.Id] = node.Label;
            foreach (var child in node.Children) stack.Push(child);
        }
        return names;
    }
}
