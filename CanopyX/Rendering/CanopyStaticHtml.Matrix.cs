using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>The most cells the static matrix draws as a table; a larger matrix lists the cells that need attention instead.</summary>
    public const int MaxStaticMatrixCells = 2500;

    private static readonly Dictionary<CanopyMatrixSymbol, string> MatrixGlyphs = new Dictionary<CanopyMatrixSymbol, string> {
        [CanopyMatrixSymbol.Check] = "✓", [CanopyMatrixSymbol.Cross] = "✕", [CanopyMatrixSymbol.Warning] = "!", [CanopyMatrixSymbol.Info] = "i",
        [CanopyMatrixSymbol.Dot] = "•", [CanopyMatrixSymbol.Dash] = "–", [CanopyMatrixSymbol.Question] = "?", [CanopyMatrixSymbol.Clock] = "◷",
        [CanopyMatrixSymbol.Pause] = "‖"
    };

    /// <summary>
    /// Renders a matrix fallback for email, print and Office as a script-free table with inline styles: the states as symbols
    /// with their labels as tooltips, row totals and a legend. A matrix of more than <see cref="MaxStaticMatrixCells"/> cells is
    /// listed instead as the cells that need attention (row, column, state, value), up to <see cref="CanopyStaticHtmlOptions.MaxRows"/>.
    /// </summary>
    /// <param name="matrix">The matrix.</param>
    /// <param name="options">Caption (the matrix label by default), row limit, theme, culture and link to the full report.</param>
    /// <returns>The fallback table.</returns>
    /// <remarks>Rows and columns keep their declared order; the browser's sorts, filters and groups are not applied.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="matrix"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The matrix is not valid.</exception>
    public static string RenderMatrix(CanopyMatrix matrix, CanopyStaticHtmlOptions? options = null) {
        if (matrix == null) throw new ArgumentNullException(nameof(matrix));
        matrix.Validate();
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var labels = matrix.Labels ?? new CanopyLabels();
        var rows = matrix.Rows.Items;
        var columns = matrix.Square ? matrix.Rows.Items : matrix.Columns.Items;
        var columnIndex = CanopyMatrixValidator.Index(matrix.Square ? matrix.Rows : matrix.Columns);
        var rowIndex = CanopyMatrixValidator.Index(matrix.Rows);
        var states = matrix.States.ToDictionary(state => state.Id, StringComparer.Ordinal);
        var counted = new HashSet<string>(matrix.TotalStates.Count > 0 ? matrix.TotalStates : matrix.States.Where(state => state.Attention).Select(state => state.Id), StringComparer.Ordinal);
        var cells = new Dictionary<long, CanopyMatrixCell>(matrix.Cells.Count);
        foreach (var cell in matrix.Cells) cells[(long)rowIndex[cell.Row] * columns.Count + columnIndex[cell.Column]] = cell;
        bool Self(int r, int c) => matrix.Square && matrix.Diagonal == CanopyMatrixDiagonal.Self && r == c;
        var html = new StringBuilder(512 + Math.Min(cells.Count, MaxStaticMatrixCells) * 48);
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.Table).Append("\">");
        var caption = settings.Caption ?? matrix.Label;
        if (caption.Length != 0) html.Append("<caption style=\"").Append(styles.Caption).Append("\">").Append(Encode(caption)).Append("</caption>");
        if ((long)rows.Count * columns.Count <= MaxStaticMatrixCells) {
            html.Append("<thead><tr><th scope=\"col\" style=\"").Append(styles.Header).Append("\">").Append(Encode(matrix.Rows.Title ?? labels.MatrixRows)).Append("</th>");
            foreach (var column in columns) html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append("text-align:center;\">").Append(Encode(column.Label)).Append("</th>");
            if (matrix.RowTotals) html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append("text-align:right;\">").Append(Encode(labels.MatrixTotal)).Append("</th>");
            html.Append("</tr></thead><tbody>");
            var shown = Math.Min(rows.Count, settings.MaxRows);
            for (var r = 0; r < shown; r++) {
                html.Append("<tr><th scope=\"row\" style=\"").Append(styles.Cell).Append("text-align:left;font-weight:600;\">").Append(Encode(rows[r].Label)).Append("</th>");
                var total = 0;
                for (var c = 0; c < columns.Count; c++) {
                    html.Append("<td style=\"").Append(styles.Cell).Append("text-align:center;");
                    if (Self(r, c) || !cells.TryGetValue((long)r * columns.Count + c, out var cell)) { html.Append("\"></td>"); continue; }
                    var state = states[cell.State];
                    if (counted.Contains(state.Id)) total++;
                    html.Append(styles.ToneColor(state.Tone)).Append(state.Attention ? "font-weight:700;" : string.Empty).Append("\" title=\"").Append(Encode(state.Label)).Append("\">");
                    html.Append(Encode(Glyph(state) + Shown(cell, settings))).Append("</td>");
                }
                if (matrix.RowTotals) html.Append("<td style=\"").Append(styles.Cell).Append("text-align:right;font-weight:600;\">").Append(total.ToString(settings.Culture)).Append("</td>");
                html.Append("</tr>");
            }
            html.Append("</tbody>");
            if (shown < rows.Count) { html.Append("<tbody>"); AppendOverflow(html, shown, rows.Count, columns.Count + 2, settings, styles, labels); html.Append("</tbody>"); }
        } else {
            html.Append("<thead><tr>");
            foreach (var title in new[] { matrix.Rows.Title ?? labels.MatrixRows, matrix.Columns.Title ?? labels.MatrixColumns, labels.MatrixState, labels.MatrixValue })
                html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append("\">").Append(Encode(title)).Append("</th>");
            html.Append("</tr></thead><tbody>");
            var attention = matrix.Cells.Where(cell => states[cell.State].Attention && !Self(rowIndex[cell.Row], columnIndex[cell.Column]))
                .OrderBy(cell => rowIndex[cell.Row]).ThenBy(cell => columnIndex[cell.Column]).ToList();
            var shown = Math.Min(attention.Count, settings.MaxRows);
            foreach (var cell in attention.Take(shown)) {
                var state = states[cell.State];
                html.Append("<tr><td style=\"").Append(styles.Cell).Append("\">").Append(Encode(rows[rowIndex[cell.Row]].Label)).Append("</td><td style=\"").Append(styles.Cell).Append("\">")
                    .Append(Encode(columns[columnIndex[cell.Column]].Label)).Append("</td><td style=\"").Append(styles.Cell).Append(styles.ToneColor(state.Tone)).Append("font-weight:700;\">")
                    .Append(Encode(Glyph(state) + " " + state.Label)).Append("</td><td style=\"").Append(styles.Cell).Append("\">").Append(Encode(Shown(cell, settings).Trim())).Append("</td></tr>");
            }
            html.Append("</tbody>");
            if (shown < attention.Count) { html.Append("<tbody>"); AppendOverflow(html, shown, attention.Count, 4, settings, styles, labels); html.Append("</tbody>"); }
        }

        if (matrix.Legend) {
            var span = (long)rows.Count * columns.Count <= MaxStaticMatrixCells ? columns.Count + 1 + (matrix.RowTotals ? 1 : 0) : 4;
            html.Append("<tbody><tr><td colspan=\"").Append(span).Append("\" style=\"").Append(styles.Note).Append("\">");
            var first = true;
            foreach (var state in matrix.States) {
                if (!first) html.Append(" · ");
                first = false;
                html.Append("<span style=\"").Append(styles.ToneColor(state.Tone)).Append("\">").Append(Encode(Glyph(state))).Append("</span> ").Append(Encode(state.Label));
            }

            html.Append("</td></tr></tbody>");
        }

        return html.Append("</table>").ToString();
    }

    private static string Glyph(CanopyMatrixState state) => MatrixGlyphs.TryGetValue(state.Symbol, out var glyph) ? glyph : string.Empty;

    private static string Shown(CanopyMatrixCell cell, CanopyStaticHtmlOptions settings) =>
        cell.Text != null ? " " + cell.Text : cell.Value.HasValue ? " " + cell.Value.Value.ToString("0.###", settings.Culture) : string.Empty;
}
