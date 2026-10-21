using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>The most cells the static matrix draws as a table; a larger matrix lists the cells that need attention instead.</summary>
    public const int MaxStaticMatrixCells = 2500;

    /// <summary>The browser's order of group labels: folded text with digit runs compared as numbers.</summary>
    private static readonly CanopyGridOrdering MatrixGroupOrder = new CanopyGridOrdering(CanopyGridTextOrder.FoldedNatural);

    private static readonly Dictionary<CanopyMatrixSymbol, string> MatrixGlyphs = new Dictionary<CanopyMatrixSymbol, string> {
        [CanopyMatrixSymbol.Check] = "✓", [CanopyMatrixSymbol.Cross] = "✕", [CanopyMatrixSymbol.Warning] = "!", [CanopyMatrixSymbol.Info] = "i",
        [CanopyMatrixSymbol.Dot] = "•", [CanopyMatrixSymbol.Dash] = "–", [CanopyMatrixSymbol.Question] = "?", [CanopyMatrixSymbol.Clock] = "◷",
        [CanopyMatrixSymbol.Pause] = "‖"
    };

    /// <summary>
    /// Renders a matrix fallback for email, print and Office as a script-free table with inline styles. Each state is its symbol
    /// and its tone: a cell that needs attention is a print-safe tint of its tone with the symbol in bold, any other state the symbol
    /// in its tone's colour, so a state never relies on colour alone. A grouped axis keeps its groups: a heading row per row group
    /// (its label, its count in <see cref="CanopyMatrixAxis.GroupCount"/> or <see cref="CanopyLabels.MatrixGroupCount"/>, and its
    /// total) and a band above the column labels per column group. Row totals and a legend with each state's count follow. A matrix
    /// of more than <see cref="MaxStaticMatrixCells"/> cells is listed instead as the cells that need attention (row, column, state,
    /// value), up to <see cref="CanopyStaticHtmlOptions.MaxRows"/>.
    /// </summary>
    /// <param name="matrix">The matrix.</param>
    /// <param name="options">Caption (the matrix label by default), row limit, theme, culture and link to the full report.</param>
    /// <returns>The fallback table.</returns>
    /// <remarks>
    /// Items keep their declared order and groups follow their labels in natural order, as the browser shows them before the reader
    /// sorts; the browser's sorts, filters and collapsed groups are not applied.
    /// </remarks>
    /// <exception cref="ArgumentNullException"><paramref name="matrix"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The matrix is not valid.</exception>
    public static string RenderMatrix(CanopyMatrix matrix, CanopyStaticHtmlOptions? options = null) {
        if (matrix == null) throw new ArgumentNullException(nameof(matrix));
        matrix.Validate();
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var labels = matrix.Labels ?? new CanopyLabels();
        var rows = matrix.Rows.Items;
        var columnAxis = matrix.Square ? matrix.Rows : matrix.Columns;
        var columns = columnAxis.Items;
        var columnIndex = CanopyMatrixValidator.Index(columnAxis);
        var rowIndex = CanopyMatrixValidator.Index(matrix.Rows);
        var states = matrix.States.ToDictionary(state => state.Id, StringComparer.Ordinal);
        var counted = new HashSet<string>(matrix.TotalStates.Count > 0 ? matrix.TotalStates : matrix.States.Where(state => state.Attention).Select(state => state.Id), StringComparer.Ordinal);
        var cells = new Dictionary<long, CanopyMatrixCell>(matrix.Cells.Count);
        foreach (var cell in matrix.Cells) cells[(long)rowIndex[cell.Row] * columns.Count + columnIndex[cell.Column]] = cell;
        bool Self(int r, int c) => matrix.Square && matrix.Diagonal == CanopyMatrixDiagonal.Self && r == c;
        var html = new StringBuilder(512 + Math.Min(cells.Count, MaxStaticMatrixCells) * 64);
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.Table).Append(CanopyStaticStyles.PrintColors).Append("\">");
        var caption = settings.Caption ?? matrix.Label;
        if (caption.Length != 0) html.Append("<caption style=\"").Append(styles.Caption).Append("\">").Append(Encode(caption)).Append("</caption>");
        var table = (long)rows.Count * columns.Count <= MaxStaticMatrixCells;
        var span = table ? columns.Count + 1 + (matrix.RowTotals ? 1 : 0) : 4;
        if (table) {
            var columnGroups = MatrixGroups(columnAxis, settings.Culture);
            var order = columnGroups.SelectMany(group => group.Members).ToList();
            if (columnAxis.GroupBy != null) {
                html.Append("<thead><tr><th style=\"").Append(styles.Header).Append("\"></th>");
                foreach (var group in columnGroups)
                    html.Append("<th scope=\"colgroup\" colspan=\"").Append(group.Members.Count).Append("\" style=\"").Append(styles.Header).Append("text-align:center;\">").Append(Encode(group.Label)).Append("</th>");
                if (matrix.RowTotals) html.Append("<th style=\"").Append(styles.Header).Append("\"></th>");
                html.Append("</tr>");
            } else {
                html.Append("<thead>");
            }

            html.Append("<tr><th scope=\"col\" style=\"").Append(styles.Header).Append("\">").Append(Encode(matrix.Rows.Title ?? labels.MatrixRows)).Append("</th>");
            foreach (var c in order) html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append("text-align:center;\">").Append(Encode(columns[c].Label)).Append("</th>");
            if (matrix.RowTotals) html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append("text-align:right;\">").Append(Encode(labels.MatrixTotal)).Append("</th>");
            html.Append("</tr></thead><tbody>");
            int Total(int r) => order.Count(c => !Self(r, c) && cells.TryGetValue((long)r * columns.Count + c, out var cell) && counted.Contains(cell.State));
            var grouped = matrix.Rows.GroupBy != null;
            var shown = 0;
            foreach (var group in MatrixGroups(matrix.Rows, settings.Culture)) {
                if (shown >= settings.MaxRows) break;
                if (grouped) {
                    var count = CanopyPlural.Pick(matrix.Rows.GroupCount ?? labels.MatrixGroupCount, group.Members.Count, settings.Culture)
                        .Replace("{count}", group.Members.Count.ToString("N0", settings.Culture));
                    html.Append("<tr><th scope=\"rowgroup\" colspan=\"").Append(columns.Count + 1).Append("\" style=\"").Append(styles.GroupHeading).Append("\">").Append(Encode(group.Label))
                        .Append(" <span style=\"").Append(styles.MutedText).Append("\">· ").Append(Encode(count)).Append("</span></th>");
                    if (matrix.RowTotals) html.Append("<td style=\"").Append(styles.GroupHeading).Append("text-align:right;\">").Append(group.Members.Sum(Total).ToString(settings.Culture)).Append("</td>");
                    html.Append("</tr>");
                }

                foreach (var r in group.Members) {
                    if (shown >= settings.MaxRows) break;
                    shown++;
                    html.Append("<tr><th scope=\"row\" style=\"").Append(styles.Cell).Append("text-align:left;font-weight:600;").Append(grouped ? "padding-left:20px;" : string.Empty).Append("\">")
                        .Append(Encode(rows[r].Label)).Append("</th>");
                    foreach (var c in order) AppendMatrixCell(html, r, c, Self(r, c), cells.TryGetValue((long)r * columns.Count + c, out var cell) ? cell : null, states, styles, labels, settings);
                    if (matrix.RowTotals) html.Append("<td style=\"").Append(styles.Cell).Append("text-align:right;font-weight:600;\">").Append(Total(r).ToString(settings.Culture)).Append("</td>");
                    html.Append("</tr>");
                }
            }

            html.Append("</tbody>");
            if (shown < rows.Count) { html.Append("<tbody>"); AppendOverflow(html, shown, rows.Count, span, settings, styles, labels); html.Append("</tbody>"); }
        } else {
            html.Append("<thead><tr>");
            foreach (var title in new[] { matrix.Rows.Title ?? labels.MatrixRows, columnAxis.Title ?? labels.MatrixColumns, labels.MatrixState, labels.MatrixValue })
                html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append("\">").Append(Encode(title)).Append("</th>");
            html.Append("</tr></thead><tbody>");
            var attention = matrix.Cells.Where(cell => states[cell.State].Attention && !Self(rowIndex[cell.Row], columnIndex[cell.Column]))
                .OrderBy(cell => rowIndex[cell.Row]).ThenBy(cell => columnIndex[cell.Column]).ToList();
            var shown = Math.Min(attention.Count, settings.MaxRows);
            foreach (var cell in attention.Take(shown)) {
                var state = states[cell.State];
                html.Append("<tr><td style=\"").Append(styles.Cell).Append("\">").Append(Encode(rows[rowIndex[cell.Row]].Label)).Append("</td><td style=\"").Append(styles.Cell).Append("\">")
                    .Append(Encode(columns[columnIndex[cell.Column]].Label)).Append("</td><td style=\"").Append(styles.Cell).Append(styles.MatrixTone(state.Tone, true)).Append("\">")
                    .Append(Encode(Glyph(state) + " " + state.Label)).Append("</td><td style=\"").Append(styles.Cell).Append("\">").Append(Encode(Shown(cell, settings).Trim())).Append("</td></tr>");
            }

            html.Append("</tbody>");
            if (shown < attention.Count) { html.Append("<tbody>"); AppendOverflow(html, shown, attention.Count, 4, settings, styles, labels); html.Append("</tbody>"); }
        }

        if (matrix.Legend) AppendMatrixLegend(html, matrix, span, cells.Values, Self, rowIndex, columnIndex, styles, settings);
        return html.Append("</table>").ToString();
    }

    private static void AppendMatrixCell(StringBuilder html, int r, int c, bool self, CanopyMatrixCell? cell, Dictionary<string, CanopyMatrixState> states, CanopyStaticStyles styles,
        CanopyLabels labels, CanopyStaticHtmlOptions settings) {
        html.Append("<td style=\"").Append(styles.Cell).Append("text-align:center;white-space:nowrap;");
        if (self) { html.Append(styles.SelfCell).Append("\" title=\"").Append(Encode(labels.MatrixSelf)).Append("\"></td>"); return; }
        if (cell == null) { html.Append(styles.MutedText).Append("\" title=\"").Append(Encode(labels.MatrixNoData)).Append("\">·</td>"); return; }
        var state = states[cell.State];
        html.Append(styles.MatrixTone(state.Tone, state.Attention)).Append("\" title=\"").Append(Encode(state.Label)).Append("\">");
        html.Append(Encode(Glyph(state) + Shown(cell, settings))).Append("</td>");
    }

    private static void AppendMatrixLegend(StringBuilder html, CanopyMatrix matrix, int span, IEnumerable<CanopyMatrixCell> cells, Func<int, int, bool> self,
        Dictionary<string, int> rowIndex, Dictionary<string, int> columnIndex, CanopyStaticStyles styles, CanopyStaticHtmlOptions settings) {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var cell in cells) {
            if (self(rowIndex[cell.Row], columnIndex[cell.Column])) continue;
            counts[cell.State] = counts.TryGetValue(cell.State, out var count) ? count + 1 : 1;
        }

        html.Append("<tbody><tr><td colspan=\"").Append(span).Append("\" style=\"").Append(styles.Note).Append("\">");
        var first = true;
        foreach (var state in matrix.States) {
            if (!first) html.Append(" &#160;·&#160; ");
            first = false;
            html.Append("<span style=\"padding:0 4px;border-radius:3px;").Append(styles.MatrixTone(state.Tone, state.Attention)).Append("\">").Append(Encode(Glyph(state))).Append("</span> ")
                .Append(Encode(state.Label)).Append(' ').Append((counts.TryGetValue(state.Id, out var count) ? count : 0).ToString("N0", settings.Culture));
        }

        html.Append("</td></tr></tbody>");
    }

    /// <summary>An axis's items by group: one group without a label when the axis has no groups; otherwise each value's items in declared order, the groups in natural order of their labels.</summary>
    private static List<(string Label, List<int> Members)> MatrixGroups(CanopyMatrixAxis axis, CultureInfo culture) {
        if (axis.GroupBy == null) return new List<(string, List<int>)> { (string.Empty, Enumerable.Range(0, axis.Items.Count).ToList()) };
        var attribute = axis.Attributes.First(item => item.Id == axis.GroupBy);
        var groups = new Dictionary<string, (string Label, List<int> Members)>(StringComparer.Ordinal);
        for (var i = 0; i < axis.Items.Count; i++) {
            axis.Items[i].Values.TryGetValue(axis.GroupBy, out var value);
            var key = MatrixValueKey(value);
            if (!groups.TryGetValue(key, out var group)) groups[key] = group = (MatrixValueText(value, attribute, culture), new List<int>());
            group.Members.Add(i);
        }

        return groups.Values.OrderBy(group => group.Label, MatrixGroupOrder).ToList();
    }

    private static string MatrixValueKey(CanopyCell? value) => value?.Value == null ? string.Empty : value.Value switch {
        bool flag => flag ? "true" : "false",
        IFormattable number when !(value.Value is DateTime) => number.ToString(null, CultureInfo.InvariantCulture),
        DateTime moment => moment.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture),
        _ => value.Value.ToString() ?? string.Empty
    };

    private static string MatrixValueText(CanopyCell? value, CanopyMatrixAttribute attribute, CultureInfo culture) {
        if (value?.Text != null) return value.Text;
        if (value?.Value == null) return "—";
        if (value.Value is DateTime moment) return moment.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        if (attribute.Kind == CanopyColumnKind.Number && value.Value is IFormattable number) return number.ToString("0.###", culture);
        return value.Value is bool flag ? (flag ? "true" : "false") : value.Value.ToString() ?? "—";
    }

    private static string Glyph(CanopyMatrixState state) => MatrixGlyphs.TryGetValue(state.Symbol, out var glyph) ? glyph : string.Empty;

    private static string Shown(CanopyMatrixCell cell, CanopyStaticHtmlOptions settings) =>
        cell.Text != null ? " " + cell.Text : cell.Value.HasValue ? " " + cell.Value.Value.ToString("0.###", settings.Culture) : string.Empty;
}
