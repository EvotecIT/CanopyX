using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Text;

namespace CanopyX.Rendering;

/// <summary>
/// Renders a view's tree as a plain indented outline table: no script, no classes, inline styles only. It is the
/// fallback for places that run no script or drop stylesheets: email clients, print, and Word.
/// </summary>
/// <remarks>
/// Rows follow the tree depth first in the order the host supplied. The first column is indented by level; the
/// others show each cell's display text, with tones as text colour and badges as small pills. Detail rows become a
/// nested table, a property list, or HTML payload preserved as text. When rows are left out, a note in the table's
/// last row says how many and can link to the full report. The colours come from
/// <see cref="CanopyStaticHtmlOptions.Theme"/>: light, dark, or the host's own.
/// </remarks>
public static class CanopyStaticHtml {
    private const int IndentPixels = 16;

    /// <summary>Renders the outline of the view's <see cref="CanopyView.Roots"/>.</summary>
    /// <param name="view">The view; its inline tree is rendered whatever its source is.</param>
    /// <param name="options">Row and depth limits, caption, overflow note, and theme.</param>
    /// <returns>The outline markup: one table, whose last row is a note when rows were left out.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule.</exception>
    public static string Render(CanopyView view, CanopyStaticHtmlOptions? options = null) {
        if (view == null) {
            throw new ArgumentNullException(nameof(view));
        }

        var o = options ?? new CanopyStaticHtmlOptions();
        CanopyViewValidator.Validate(view);
        var columns = view.Columns.Where((column, index) => index == 0 || !column.Hidden).ToList();
        var rows = CollectRows(view, o, out var total, out var hiddenBelow, out var unknown);
        var styles = new CanopyStaticStyles(o);
        var html = new StringBuilder(256 + rows.Count * 160);
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.Table).Append("\">");
        var caption = o.Caption ?? view.Label;
        if (caption.Length > 0) {
            html.Append("<caption style=\"").Append(styles.Caption).Append("\">").Append(Encode(caption)).Append("</caption>");
        }

        html.Append("<thead><tr>");
        foreach (var column in columns) {
            html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append(Align(column)).Append("\">").Append(Encode(column.Title)).Append("</th>");
        }

        html.Append("</tr></thead><tbody>");
        foreach (var (node, level) in rows) {
            if (node.Detail != null) {
                AppendDetail(html, node, level, columns.Count, styles);
            } else {
                AppendRow(html, node, level, columns, hiddenBelow.TryGetValue(node, out var hidden) ? hidden : 0, o, styles);
            }
        }

        html.Append("</tbody>");
        if (unknown || total > rows.Count) {
            var note = o.OverflowNote
                .Replace("{shown}", rows.Count.ToString("N0", o.Culture))
                .Replace("{total}", unknown ? "unknown" : total.ToString("N0", o.Culture));
            // The note is the last row of the table, so it sits on the theme's surface like the rows above it. It has
            // a row group of its own rather than a tfoot, which browsers repeat at the bottom of every printed page.
            html.Append("<tbody><tr><td colspan=\"").Append(columns.Count).Append("\" style=\"").Append(styles.Note).Append("\">").Append(Encode(note));
            if (IsSafeReportUrl(o.FullReportUrl)) {
                html.Append(" <a href=\"").Append(Encode(o.FullReportUrl!)).Append("\" style=\"").Append(styles.Link).Append("\">").Append(Encode(o.FullReportText)).Append("</a>");
            }

            html.Append("</td></tr></tbody>");
        }

        return html.Append("</table>").ToString();
    }

    /// <summary>
    /// Walks the tree depth first without recursion. Every node counts toward the total; rows past MaxRows, below
    /// MaxDepth, or under a collapsed node (with OnlyExpanded) are not shown, and the nodes cut below a shown row are
    /// recorded so the row can say so. Children a sidecar or remote source would load count by their declared number.
    /// </summary>
    private static List<(CanopyNode Node, int Level)> CollectRows(CanopyView view, CanopyStaticHtmlOptions options, out long total, out Dictionary<CanopyNode, long> hiddenBelow, out bool unknown) {
        var rows = new List<(CanopyNode, int)>();
        hiddenBelow = new Dictionary<CanopyNode, long>();
        unknown = false;
        var pending = new Stack<(CanopyNode Node, int Level, CanopyNode? VisibleAncestor)>();
        for (var index = view.Roots.Count - 1; index >= 0; index--) {
            pending.Push((view.Roots[index], 1, null));
        }

        total = 0;
        while (pending.Count > 0) {
            var (node, level, visibleAncestor) = pending.Pop();
            total++;
            var emitted = rows.Count < options.MaxRows;
            if (emitted) {
                rows.Add((node, level));
                visibleAncestor = node;
            } else {
                AddHidden(hiddenBelow, visibleAncestor, 1, false);
            }

            var children = node.ChildNodes;
            if (children.Count == 0 && node.HasChildren) {
                if (node.ChildCount > 0) {
                    total += node.ChildCount.Value;
                    AddHidden(hiddenBelow, visibleAncestor, node.ChildCount.Value, false);
                } else {
                    AddHidden(hiddenBelow, visibleAncestor, 0, true);
                    unknown = true;
                }
            } else if (level < options.MaxDepth && (!options.OnlyExpanded || node.Expanded)) {
                for (var index = children.Count - 1; index >= 0; index--) {
                    pending.Push((children[index], level + 1, visibleAncestor));
                }
            } else {
                var hidden = CountBelow(node, out var hiddenUnknown);
                unknown |= hiddenUnknown;
                total += hidden;
                AddHidden(hiddenBelow, visibleAncestor, hidden, hiddenUnknown);
            }

        }

        return rows;
    }

    private static void AddHidden(Dictionary<CanopyNode, long> hiddenBelow, CanopyNode? visibleAncestor, long count, bool unknown) {
        if (visibleAncestor == null) return;
        hiddenBelow.TryGetValue(visibleAncestor, out var current);
        if (unknown) hiddenBelow[visibleAncestor] = -1;
        else if (count > 0 && current >= 0) hiddenBelow[visibleAncestor] = current + count;
    }

    private static long CountBelow(CanopyNode node, out bool unknown) {
        long count = 0;
        unknown = false;
        var pending = new Stack<CanopyNode>();
        pending.Push(node);
        while (pending.Count > 0) {
            var current = pending.Pop();
            if (current.ChildNodes.Count == 0 && current.HasChildren && current.ChildCount > 0) {
                count += current.ChildCount.Value;
            }
            if (current.ChildNodes.Count == 0 && current.HasChildren && !current.ChildCount.HasValue) unknown = true;

            foreach (var child in current.ChildNodes) {
                count++;
                pending.Push(child);
            }
        }

        return count;
    }

    private static void AppendRow(StringBuilder html, CanopyNode node, int level, IList<CanopyColumn> columns, long hiddenBelow, CanopyStaticHtmlOptions options, CanopyStaticStyles styles) {
        html.Append("<tr>");
        for (var index = 0; index < columns.Count; index++) {
            var column = columns[index];
            CanopyCell? cell = null;
            var hasCell = node.HasCells && node.Cells.TryGetValue(column.Id, out cell);

            var style = styles.Cell + Align(column);
            if (index == 0) {
                style += "padding-left:" + ((level - 1) * IndentPixels + 8) + "px;" + (node.Group ? "font-weight:600;" : string.Empty);
            }

            style += styles.ToneColor(cell?.Tone ?? CanopyTone.None);

            html.Append("<td style=\"").Append(style).Append('"');
            if (!string.IsNullOrEmpty(cell?.Title)) {
                html.Append(" title=\"").Append(Encode(cell!.Title!)).Append('"');
            }

            html.Append('>').Append(Encode(index == 0 && !hasCell ? node.Label : cell?.DisplayText(column.Kind) ?? string.Empty));
            if (index == 0 && node.HasBadges) {
                AppendBadges(html, node.Badges, styles);
            }

            if (index == 0 && hiddenBelow != 0) {
                // -1 marks children a source would load without a declared count.
                var count = hiddenBelow > 0 ? hiddenBelow.ToString("N0", options.Culture) : "?";
                html.Append(" <span style=\"").Append(styles.Hidden).Append("\" title=\"").Append(Encode(options.HiddenRowsTitle.Replace("{count}", count))).Append("\">(+")
                    .Append(hiddenBelow > 0 ? Encode(count) : string.Empty).Append(")</span>");
            }

            if (cell != null && cell.HasBadges) {
                AppendBadges(html, cell.Badges, styles);
            }

            html.Append("</td>");
        }

        html.Append("</tr>");
    }

    private static void AppendBadges(StringBuilder html, IEnumerable<CanopyBadge> badges, CanopyStaticStyles styles) {
        foreach (var badge in badges) {
            html.Append("<span style=\"").Append(styles.Badge(badge.Tone)).Append('"');
            if (!string.IsNullOrEmpty(badge.Title)) {
                html.Append(" title=\"").Append(Encode(badge.Title!)).Append('"');
            }

            html.Append('>').Append(Encode(badge.Text)).Append("</span>");
        }
    }

    private static void AppendDetail(StringBuilder html, CanopyNode node, int level, int columnCount, CanopyStaticStyles styles) {
        html.Append("<tr><td colspan=\"").Append(columnCount).Append("\" style=\"").Append(styles.Detail)
            .Append("padding-left:").Append((level - 1) * IndentPixels + 8).Append("px;\">");
        switch (node.Detail) {
            case CanopyTableDetail table:
                html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.InnerTable).Append("\">");
                if (!string.IsNullOrEmpty(table.Caption)) {
                    html.Append("<caption style=\"").Append(styles.DetailCaption).Append("\">").Append(Encode(table.Caption!)).Append("</caption>");
                }

                html.Append("<thead><tr>");
                var shares = table.ColumnWidths.Count == table.Columns.Count ? table.ColumnWidths : null;
                long total = 0;
                foreach (var share in shares ?? Array.Empty<int>()) {
                    total += share;
                }

                for (var column = 0; column < table.Columns.Count; column++) {
                    html.Append("<th scope=\"col\" style=\"").Append(styles.InnerHeader);
                    if (shares != null) {
                        html.Append("width:").Append((shares[column] * 100.0 / total).ToString("0.##", CultureInfo.InvariantCulture)).Append("%;");
                    }

                    html.Append("\">").Append(Encode(table.Columns[column])).Append("</th>");
                }

                html.Append("</tr></thead><tbody>");
                foreach (var row in table.Rows) {
                    html.Append("<tr>");
                    foreach (var cell in row) {
                        AppendInnerCell(html, cell, styles);
                    }

                    html.Append("</tr>");
                }

                html.Append("</tbody></table>");
                break;
            case CanopyPropertiesDetail properties:
                html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.InnerTable).Append("\"><tbody>");
                foreach (var item in properties.Items) {
                    html.Append("<tr><th scope=\"row\" style=\"").Append(styles.PropertyName).Append("\">")
                        .Append(Encode(item.Name)).Append("</th>");
                    AppendInnerCell(html, item.Value, styles);
                    html.Append("</tr>");
                }

                html.Append("</tbody></table>");
                break;
            case CanopyHtmlDetail markup:
                // Arbitrary host HTML can contain scripts, handlers, active URLs, or embedded frames. The fallback
                // has no HTML parser dependency and preserves this payload as text to keep its script-free contract.
                html.Append(Encode(markup.Html));
                break;
        }

        html.Append("</td></tr>");
    }

    private static void AppendInnerCell(StringBuilder html, CanopyCell? cell, CanopyStaticStyles styles) {
        html.Append("<td style=\"").Append(styles.InnerCell).Append(styles.ToneColor(cell?.Tone ?? CanopyTone.None)).Append('"');
        if (!string.IsNullOrEmpty(cell?.Title)) {
            html.Append(" title=\"").Append(Encode(cell!.Title!)).Append('"');
        }
        html.Append('>').Append(Encode(cell?.DisplayText(CanopyColumnKind.Text) ?? string.Empty));
        if (cell != null && cell.HasBadges) {
            AppendBadges(html, cell.Badges, styles);
        }
        html.Append("</td>");
    }

    private static string Align(CanopyColumn column) => column.Kind == CanopyColumnKind.Number ? "text-align:right;" : string.Empty;

    private static bool IsSafeReportUrl(string? url) {
        if (string.IsNullOrEmpty(url)) return false;
        foreach (var ch in url!) if (ch <= ' ' || ch == '\\') return false;
        var colon = url.IndexOf(':');
        var boundary = url.IndexOfAny(new[] { '/', '?', '#' });
        if (colon < 0 || (boundary >= 0 && boundary < colon)) return true;
        var scheme = url.Substring(0, colon);
        return scheme.Equals("https", StringComparison.OrdinalIgnoreCase)
            || scheme.Equals("http", StringComparison.OrdinalIgnoreCase)
            || scheme.Equals("mailto", StringComparison.OrdinalIgnoreCase);
    }

    private static string Encode(string value) => WebUtility.HtmlEncode(value);
}
