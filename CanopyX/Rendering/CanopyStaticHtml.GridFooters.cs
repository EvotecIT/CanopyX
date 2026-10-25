using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    private static void AppendGridFooters(StringBuilder html, CanopyDataGridView view, CanopyColumn[] columns,
        IList<CanopyGridRow> rows, int? matched, int offset, IDictionary<string, IDictionary<string, double?>>? values,
        CanopyStaticStyles styles, CanopyStaticHtmlOptions settings) {
        if (view.Footers.Count == 0) return;
        html.Append("<tfoot>");
        foreach (var footer in view.Footers) {
            var pageScope = footer.Scope == CanopyGridFooterScope.Page && view.Presentation == CanopyGridPresentation.Paged;
            html.Append("<tr><th scope=\"row\" colspan=\"").Append(columns.Length).Append("\" style=\"").Append(styles.Header).Append("\">")
                .Append(Encode(footer.Label)).Append(pageScope ? " (Page)" : " (All matching)").Append("</th></tr><tr>");
            foreach (var column in columns) {
                html.Append("<td style=\"").Append(styles.Cell).Append(Align(column)).Append('"');
                if (column.ClassName != null) html.Append(" class=\"").Append(Encode(column.ClassName)).Append('"');
                html.Append('>');
                var separator = false;
                foreach (var aggregate in footer.Aggregates.Where(item => item.Column == column.Id)) {
                    if (separator) html.Append("<br>"); separator = true;
                    html.Append(Encode(aggregate.Label)).Append(": ");
                    double? value = null;
                    var available = values != null && values.TryGetValue(footer.Id, out var accepted) && accepted.TryGetValue(aggregate.Id, out value);
                    var complete = matched.HasValue && offset == 0 && rows.Count == matched.Value;
                    if (!available && aggregate.Operation != CanopyGridAggregateOperation.Custom && (pageScope || complete)) {
                        value = aggregate.Evaluate(rows.Select(row => row.Cells.TryGetValue(column.Id, out var cell) ? cell : null)); available = true;
                    }
                    var format = aggregate.Format ?? (aggregate.Counting ? CanopyGridNumberFormat.Fixed(0) : column.Format);
                    var text = !available ? "Unavailable" : !value.HasValue ? "—" : format?.Format(value.Value, settings.Culture) ?? value.Value.ToString("G", CultureInfo.InvariantCulture);
                    html.Append(Encode(text));
                }
                html.Append("</td>");
            }
            html.Append("</tr>");
        }
        html.Append("</tfoot>");
    }
}
