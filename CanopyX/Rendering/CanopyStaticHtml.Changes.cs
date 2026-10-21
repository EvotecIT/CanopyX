using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>
    /// Renders a text diff for email, print and Office as a script-free table with inline styles: one column of lines with both line
    /// numbers and a <c>+</c> or <c>−</c> sign (so no change relies on colour alone), removed and added lines on light tints, the
    /// words that changed inside a replaced line on a stronger tint (as <c>del</c> and <c>ins</c>), and unchanged regions folded
    /// into a line that counts them. A diff without lines shows its message. At most <see cref="CanopyStaticHtmlOptions.MaxRows"/> lines.
    /// </summary>
    /// <param name="diff">The diff.</param>
    /// <param name="options">Caption (the diff label by default), row limit, theme, culture and link to the full report.</param>
    /// <returns>The fallback table.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="diff"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The diff is not valid.</exception>
    public static string RenderDiff(CanopyTextDiff diff, CanopyStaticHtmlOptions? options = null) {
        if (diff == null) throw new ArgumentNullException(nameof(diff));
        diff.Validate();
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var labels = diff.Labels ?? new CanopyLabels();
        var html = new StringBuilder(1024);
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.Table).Append(CanopyStaticStyles.PrintColors).Append("min-width:320px;\">");
        var caption = settings.Caption ?? diff.Label;
        if (caption.Length != 0) html.Append("<caption style=\"").Append(styles.Caption).Append("\">").Append(Encode(caption)).Append("</caption>");
        AppendDiffBody(html, diff, styles, labels, settings, settings.MaxRows, out _);
        return html.Append("</table>").ToString();
    }

    /// <summary>A diff's rows inside an open table of four columns; returns how many lines it wrote.</summary>
    private static void AppendDiffBody(StringBuilder html, CanopyTextDiff diff, CanopyStaticStyles styles, CanopyLabels labels, CanopyStaticHtmlOptions settings, int maxRows, out int written) {
        written = 0;
        var path = diff.Path == null ? null : diff.PreviousPath != null && diff.PreviousPath != diff.Path ? diff.PreviousPath + " → " + diff.Path : diff.Path;
        var rows = diff.Content == CanopyDiffContent.Text ? CanopyDiffRows.Build(diff) : new List<CanopyDiffRows.Row>();
        int added = 0, removed = 0;
        foreach (var row in rows) { if (row.Gap == 0 && row.Kind == CanopyDiffLineKind.Added) added++; else if (row.Gap == 0 && row.Kind == CanopyDiffLineKind.Removed) removed++; }
        html.Append("<thead><tr><th colspan=\"4\" scope=\"col\" style=\"").Append(styles.Header).Append("white-space:normal;\">");
        if (path != null) html.Append("<span style=\"").Append(CanopyStaticStyles.Mono).Append("font-weight:600;\">").Append(Encode(path)).Append("</span> ");
        if (diff.Content == CanopyDiffContent.Text) {
            html.Append("<span style=\"").Append(styles.ToneText(CanopyTone.Success)).Append("\">+").Append(added.ToString("N0", settings.Culture)).Append("</span> <span style=\"")
                .Append(styles.ToneText(CanopyTone.Danger)).Append("\">−").Append(removed.ToString("N0", settings.Culture)).Append("</span>");
        }

        html.Append("</th></tr></thead><tbody>");
        var note = diff.Content switch {
            CanopyDiffContent.Binary => diff.Message ?? labels.ChangeBinary,
            CanopyDiffContent.Unavailable => diff.Message ?? labels.ChangeUnavailable,
            CanopyDiffContent.Identical => diff.Message ?? labels.ChangeIdentical,
            _ => rows.Count == 0 ? labels.ChangeIdentical : diff.Message
        };
        if (note != null) html.Append("<tr><td colspan=\"4\" style=\"").Append(styles.Note).Append("\">").Append(Encode(note)).Append("</td></tr>");
        foreach (var item in diff.Notes) html.Append("<tr><td colspan=\"4\" style=\"").Append(styles.Note).Append(styles.ToneText(item.Tone.Name == null ? CanopyTone.Info : item.Tone)).Append("\">").Append(Encode(item.Text)).Append("</td></tr>");
        if (diff.Truncated) html.Append("<tr><td colspan=\"4\" style=\"").Append(styles.Note).Append(styles.ToneText(CanopyTone.Warning)).Append("\">").Append(Encode(labels.ChangeTruncated)).Append("</td></tr>");
        var number = "padding:1px 6px;text-align:right;vertical-align:top;white-space:nowrap;font-size:11px;" + CanopyStaticStyles.Mono;
        var lines = 0;
        foreach (var row in rows) {
            if (row.Gap > 0) {
                var text = CanopyPlural.Pick(labels.ChangeHiddenLines, row.Gap, settings.Culture).Replace("{count}", row.Gap.ToString("N0", settings.Culture));
                html.Append("<tr><td colspan=\"4\" style=\"padding:2px 8px;font-size:12px;").Append(styles.DiffGap).Append("\">⋯ ").Append(Encode(text)).Append("</td></tr>");
                continue;
            }

            if (lines >= maxRows) { lines++; continue; }
            lines++;
            var sign = row.Kind == CanopyDiffLineKind.Added ? "+" : row.Kind == CanopyDiffLineKind.Removed ? "−" : " ";
            var gutter = number + styles.DiffGutter(row.Kind);
            html.Append("<tr><td style=\"").Append(gutter).Append("\">").Append(row.Before?.ToString(CultureInfo.InvariantCulture)).Append("</td><td style=\"").Append(gutter).Append("\">")
                .Append(row.After?.ToString(CultureInfo.InvariantCulture)).Append("</td><td style=\"").Append(gutter).Append("text-align:center;font-weight:700;\">").Append(sign)
                .Append("</td><td style=\"padding:1px 8px;white-space:pre-wrap;word-break:break-all;font-size:12px;").Append(CanopyStaticStyles.Mono).Append(styles.DiffLine(row.Kind)).Append("\">");
            AppendMarked(html, row, styles);
            html.Append("</td></tr>");
        }

        html.Append("</tbody>");
        if (lines > maxRows) { html.Append("<tbody>"); AppendOverflow(html, maxRows, lines, 4, settings, styles, labels); html.Append("</tbody>"); }
        written = Math.Min(lines, maxRows);
    }

    /// <summary>A line's text with its changed words in <c>del</c> or <c>ins</c>.</summary>
    private static void AppendMarked(StringBuilder html, CanopyDiffRows.Row row, CanopyStaticStyles styles) {
        if (row.Marks == null || row.Marks.Count == 0) { html.Append(Encode(row.Text)); return; }
        var tag = row.Kind == CanopyDiffLineKind.Removed ? "del" : "ins";
        var at = 0;
        foreach (var (start, end) in row.Marks) {
            html.Append(Encode(row.Text.Substring(at, start - at))).Append('<').Append(tag).Append(" style=\"").Append(styles.DiffMark(row.Kind)).Append("\">")
                .Append(Encode(row.Text.Substring(start, end - start))).Append("</").Append(tag).Append('>');
            at = end;
        }

        html.Append(Encode(row.Text.Substring(at)));
    }

    /// <summary>
    /// Renders a change list for email, print and Office as a script-free table with inline styles: a row per item with its change as a
    /// badge, its name and folder (or its earlier path), its size and short hash before and after, and its flags with their reasons.
    /// Grouped lists keep a heading row per folder, each folder a table body of its own. Items with diffs do not show them; render them
    /// with <see cref="RenderDiff"/>. At most <see cref="CanopyStaticHtmlOptions.MaxRows"/> items.
    /// </summary>
    /// <param name="list">The list.</param>
    /// <param name="options">Caption (the list label by default), row limit, theme, culture and link to the full report.</param>
    /// <returns>The fallback table.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="list"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The list is not valid.</exception>
    public static string RenderChanges(CanopyChangeList list, CanopyStaticHtmlOptions? options = null) {
        if (list == null) throw new ArgumentNullException(nameof(list));
        list.Validate();
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var labels = list.Labels ?? new CanopyLabels();
        var html = new StringBuilder(512 + list.Items.Count * 400);
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.Table).Append(CanopyStaticStyles.PrintColors).Append("\">");
        var caption = settings.Caption ?? list.Label;
        if (caption.Length != 0) html.Append("<caption style=\"").Append(styles.Caption).Append("\">").Append(Encode(caption)).Append("</caption>");
        html.Append("<thead><tr>");
        foreach (var title in new[] { string.Empty, list.Label, labels.ChangeSize, labels.ChangeHash, labels.ChangeFlags })
            html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append("\">").Append(Encode(title)).Append("</th>");
        html.Append("</tr></thead>");
        var shown = 0;
        foreach (var (folder, items) in CanopyChangeFormat.Folders(list)) {
            if (shown >= settings.MaxRows) break;
            html.Append("<tbody>");
            if (list.GroupByFolder) {
                var count = CanopyPlural.Pick(labels.ChangeFileCount, items.Count, settings.Culture).Replace("{count}", items.Count.ToString("N0", settings.Culture));
                html.Append("<tr><th scope=\"rowgroup\" colspan=\"5\" style=\"").Append(styles.GroupHeading).Append(CanopyStaticStyles.Mono).Append("\">").Append(Encode(folder.Length == 0 ? labels.ChangeRoot : folder))
                    .Append(" <span style=\"").Append(styles.MutedText).Append("font-family:inherit;\">· ").Append(Encode(count)).Append("</span></th></tr>");
            }

            foreach (var item in items) {
                if (shown >= settings.MaxRows) break;
                shown++;
                AppendChangeRow(html, item, list, styles, labels, settings);
            }

            html.Append("</tbody>");
        }

        if (shown < list.Items.Count) { html.Append("<tbody>"); AppendOverflow(html, shown, list.Items.Count, 5, settings, styles, labels); html.Append("</tbody>"); }
        return html.Append("</table>").ToString();
    }

    private static void AppendChangeRow(StringBuilder html, CanopyChangeItem item, CanopyChangeList list, CanopyStaticStyles styles, CanopyLabels labels, CanopyStaticHtmlOptions settings) {
        var cell = styles.Cell;
        html.Append("<tr><td style=\"").Append(cell).Append("white-space:nowrap;\"><span style=\"").Append(styles.Badge(CanopyChangeFormat.Tone(item.Kind))).Append("margin-left:0;\">")
            .Append(Encode(CanopyChangeFormat.Kind(item, labels))).Append("</span></td>");
        var (folder, name) = CanopyChangeFormat.Split(item.Path);
        html.Append("<th scope=\"row\" style=\"").Append(cell).Append("text-align:left;font-weight:600;").Append(CanopyStaticStyles.Mono).Append("\">").Append(Encode(list.GroupByFolder ? name : item.Path));
        if (item.PreviousPath != null) html.Append("<br><span style=\"").Append(styles.MutedText).Append("\">").Append(Encode(labels.ChangeFrom.Replace("{path}", item.PreviousPath))).Append("</span>");
        if (item.Secondary != null) html.Append("<br><span style=\"").Append(styles.MutedText).Append("font-family:inherit;\">").Append(Encode(item.Secondary)).Append("</span>");
        html.Append("</th><td style=\"").Append(cell).Append("white-space:nowrap;text-align:right;\">").Append(Encode(Pair(item.Before?.Size is long a ? CanopyChangeFormat.Size(a, settings.Culture) : null, item.After?.Size is long b ? CanopyChangeFormat.Size(b, settings.Culture) : null)))
            .Append("</td><td style=\"").Append(cell).Append("white-space:nowrap;").Append(CanopyStaticStyles.Mono).Append("\">")
            .Append(Encode(Pair(item.Before?.Hash is string h ? CanopyChangeFormat.Short(h, list.HashLength) : null, item.After?.Hash is string k ? CanopyChangeFormat.Short(k, list.HashLength) : null))).Append("</td><td style=\"").Append(cell).Append("\">");
        var first = true;
        foreach (var flag in item.Flags) {
            if (!first) html.Append("<br>");
            first = false;
            html.Append("<span style=\"").Append(styles.Badge(flag.Tone.Name == null ? CanopyTone.Warning : flag.Tone)).Append("margin-left:0;font-weight:600;\">⚑ ").Append(Encode(flag.Label)).Append("</span> ")
                .Append(Encode(flag.Reason));
        }

        html.Append("</td></tr>");
    }

    /// <summary>A value before and after: "a → b", or the one that exists.</summary>
    private static string Pair(string? left, string? right) => left == null ? right ?? string.Empty : right == null || left == right ? left : left + " → " + right;
}
