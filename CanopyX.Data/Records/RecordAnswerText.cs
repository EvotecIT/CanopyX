using System;
using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>
/// Holds any record provider's answer to the text bound (<see cref="CanopyRemoteLimits.MaxRecordTextLength"/>) with the
/// semantics of <see cref="RecordText.Clip(string, int)"/>: longer text ends with an ellipsis and fits the bound, never split
/// inside a surrogate pair. It shortens values, display text, tooltips, secondary and search text, badges, list items,
/// object fields, collection rows (and tree rows), nested detail display values, timeline events and changes, at any depth.
/// Identities (row and node identities, link keys), trusted HTML and the record's row are never shortened. A cell whose raw text value is too long is replaced by
/// a copy with the shortened value, since a cell's value is fixed when it is created.
/// </summary>
internal static class RecordAnswerText {
    /// <summary>Clips every text of the answer's fields and drawer values in place.</summary>
    /// <param name="record">The provider's answer.</param>
    /// <param name="maximum">The text bound in UTF-16 code units, at least 16.</param>
    /// <returns>A lower bound of the answer's UTF-8 size: the code units of the clipped text it writes. Every code unit writes
    /// at least one byte, so an answer whose bound already exceeds the byte limit can be refused before it is serialized.</returns>
    internal static long Clip(CanopyGridRecord record, int maximum) {
        long size = 0;
        Entries(record.Fields, maximum, ref size);
        Entries(record.Cells, maximum, ref size);
        return size;
    }

    private static void Entries(IDictionary<string, CanopyCell> cells, int maximum, ref long size, int depth = 0) {
        List<KeyValuePair<string, CanopyCell>>? replaced = null;
        foreach (var pair in cells) {
            size += pair.Key.Length;
            if (pair.Value == null) continue;
            var cell = Cell(pair.Value, maximum, ref size, depth);
            if (!ReferenceEquals(cell, pair.Value)) (replaced ??= new List<KeyValuePair<string, CanopyCell>>()).Add(new KeyValuePair<string, CanopyCell>(pair.Key, cell));
        }
        // Replaced after the walk: a dictionary may not change while it is enumerated.
        if (replaced != null) foreach (var pair in replaced) cells[pair.Key] = pair.Value;
    }

    private static CanopyCell Cell(CanopyCell cell, int maximum, ref long size, int depth) {
        // Clipping runs before serialization validates the answer: stop malformed deep or cyclic cells at the same bound.
        if (depth > CanopyCell.MaxStructureDepth) throw new InvalidOperationException("Structured values nest at most " + CanopyCell.MaxStructureDepth + " levels.");
        cell.Text = Text(cell.Text, maximum, ref size);
        cell.SearchText = Text(cell.SearchText, maximum, ref size);
        cell.Title = Text(cell.Title, maximum, ref size);
        cell.Secondary = Text(cell.Secondary, maximum, ref size);
        if (cell.HasBadges) Badges(cell.Badges, maximum, ref size);
        var series = cell.Series;
        for (var i = 0; i < series.Count; i++) {
            var period = series[i];
            if (period == null) continue;
            var label = Text(period.Period, maximum, ref size)!;
            var state = Text(period.State, maximum, ref size);
            if (!ReferenceEquals(label, period.Period) || !ReferenceEquals(state, period.State))
                series[i] = new CanopyCellPeriod(label, period.Value, state, period.Tone);
        }
        if (cell.IsStructured) Structure(cell, maximum, ref size, depth);
        if (!(cell.Value is string value)) return cell;
        var clipped = Text(value, maximum, ref size)!;
        return ReferenceEquals(clipped, value) ? cell : Copy(cell, clipped);
    }

    private static void Badges(IList<CanopyBadge> badges, int maximum, ref long size) {
        for (var i = 0; i < badges.Count; i++) {
            var badge = badges[i];
            if (badge == null) continue;
            badge.Title = Text(badge.Title, maximum, ref size);
            var text = Text(badge.Text, maximum, ref size)!;
            if (!ReferenceEquals(text, badge.Text)) badges[i] = new CanopyBadge(text, badge.Tone) { Title = badge.Title };
        }
    }

    private static void Structure(CanopyCell cell, int maximum, ref long size, int depth) {
        var items = cell.Items;
        for (var i = 0; i < items.Count; i++) if (items[i] != null) items[i] = Cell(items[i], maximum, ref size, depth + 1);
        var fields = cell.Fields;
        for (var i = 0; i < fields.Count; i++) {
            var field = fields[i];
            if (field == null) continue;
            var name = Text(field.Name, maximum, ref size)!;
            var value = field.Value == null ? null : Cell(field.Value, maximum, ref size, depth + 1);
            if (!ReferenceEquals(name, field.Name) || !ReferenceEquals(value, field.Value)) fields[i] = new CanopyCellField(name, value) { Kind = field.Kind };
        }
        if (cell.Records != null) List(cell.Records, maximum, ref size, depth);
        foreach (var item in cell.Events) {
            if (item == null) continue;
            item.Summary = Text(item.Summary, maximum, ref size)!;
            item.Actor = Text(item.Actor, maximum, ref size);
            item.Kind = Text(item.Kind, maximum, ref size);
            Changes(item.Changes, maximum, ref size, depth);
        }
        Changes(cell.Changes, maximum, ref size, depth);
    }

    private static void Changes(IList<CanopyFieldChange> changes, int maximum, ref long size, int depth) {
        for (var i = 0; i < changes.Count; i++) {
            var change = changes[i];
            if (change == null) continue;
            var name = Text(change.Name, maximum, ref size)!;
            var before = change.Before == null ? null : Cell(change.Before, maximum, ref size, depth + 1);
            var after = change.After == null ? null : Cell(change.After, maximum, ref size, depth + 1);
            if (!ReferenceEquals(name, change.Name) || !ReferenceEquals(before, change.Before) || !ReferenceEquals(after, change.After))
                changes[i] = new CanopyFieldChange(name, before, after) { Kind = change.Kind };
        }
    }

    private static void List(CanopyRecordList list, int maximum, ref long size, int depth) {
        Rows(list.Rows, maximum, ref size, depth + 1);
        Nodes(list.Roots, maximum, ref size, depth + 1);
    }

    private static void Rows(IEnumerable<CanopyGridRow> rows, int maximum, ref long size, int cellDepth) {
        foreach (var row in rows) {
            if (row == null) continue;
            size += row.Id.Length;
            Entries(row.Cells, maximum, ref size, cellDepth);
            if (row.HasFields) Entries(row.Fields, maximum, ref size, cellDepth);
            Detail(row.Detail, maximum, ref size, cellDepth);
        }
    }

    private static void Nodes(IEnumerable<CanopyNode> roots, int maximum, ref long size, int cellDepth) {
        // Tree depth does not consume structured-cell depth. Walk every node without recursion, leaving duplicate/cyclic
        // trees to the canonical validator after clipping; repeated references must not keep this traversal running.
        var pending = new Stack<CanopyNode>(roots);
        var visited = new HashSet<CanopyNode>();
        while (pending.Count > 0) {
            var node = pending.Pop();
            if (node == null || !visited.Add(node)) continue;
            size += node.Id.Length;
            node.Label = Text(node.Label, maximum, ref size)!;
            if (node.HasBadges) Badges(node.Badges, maximum, ref size);
            if (node.HasCells) Entries(node.Cells, maximum, ref size, cellDepth);
            if (node.HasFields) Entries(node.Fields, maximum, ref size, cellDepth);
            Detail(node.Detail, maximum, ref size, cellDepth);
            if (node.HasInlineChildren) foreach (var child in node.Children) pending.Push(child);
        }
    }

    /// <summary>Clips ordinary nested detail display values at their row/node's cell depth. Markup stays trusted and whole.</summary>
    private static void Detail(CanopyDetail? detail, int maximum, ref long size, int cellDepth) {
        if (detail == null) return;
        if (cellDepth > CanopyCell.MaxStructureDepth) throw new InvalidOperationException("Structured values nest at most " + CanopyCell.MaxStructureDepth + " levels.");
        switch (detail) {
            case CanopyPropertiesDetail properties:
                for (var i = 0; i < properties.Items.Count; i++) {
                    var property = properties.Items[i];
                    if (property == null) continue;
                    var name = Text(property.Name, maximum, ref size)!;
                    var value = Cell(property.Value, maximum, ref size, cellDepth);
                    if (!ReferenceEquals(name, property.Name) || !ReferenceEquals(value, property.Value)) properties.Items[i] = new CanopyProperty(name, value);
                }
                break;
            case CanopyTableDetail table:
                table.Caption = Text(table.Caption, maximum, ref size);
                for (var i = 0; i < table.Columns.Count; i++) table.Columns[i] = Text(table.Columns[i], maximum, ref size)!;
                for (var rowIndex = 0; rowIndex < table.Rows.Count; rowIndex++) {
                    var row = table.Rows[rowIndex];
                    if (row == null) continue;
                    List<CanopyCell>? replaced = null;
                    for (var i = 0; i < row.Count; i++) {
                        if (row[i] == null) continue;
                        var cell = Cell(row[i], maximum, ref size, cellDepth);
                        if (!ReferenceEquals(cell, row[i])) (replaced ??= new List<CanopyCell>(row))[i] = cell;
                    }
                    // Public table rows may be read-only. Replace only a row whose immutable raw cell value changed.
                    if (replaced != null) table.Rows[rowIndex] = replaced;
                }
                break;
            case CanopyGridRowsDetail grid:
                Rows(grid.Rows, maximum, ref size, cellDepth + 1);
                break;
            case CanopyTreeDetail tree:
                Nodes(tree.Roots, maximum, ref size, cellDepth + 1);
                break;
            case CanopyHtmlDetail html:
                size += html.Html.Length;
                break;
        }
    }

    private static string? Text(string? text, int maximum, ref long size) {
        var clipped = RecordText.Clip(text, maximum);
        size += clipped?.Length ?? 0;
        return clipped;
    }

    /// <summary>The cell with another raw value and everything else it carries.</summary>
    private static CanopyCell Copy(CanopyCell cell, string value) {
        var copy = new CanopyCell(value) {
            Text = cell.Text, SearchText = cell.SearchText, Title = cell.Title, Secondary = cell.Secondary, Tone = cell.Tone,
            SortKey = cell.SortKey, Records = cell.Records, Ref = cell.Ref
        };
        foreach (var period in cell.Series) copy.Series.Add(period);
        if (cell.HasBadges) foreach (var badge in cell.Badges) copy.Badges.Add(badge);
        if (cell.IsStructured) {
            foreach (var item in cell.Items) copy.Items.Add(item);
            foreach (var field in cell.Fields) copy.Fields.Add(field);
            foreach (var item in cell.Events) copy.Events.Add(item);
            foreach (var change in cell.Changes) copy.Changes.Add(change);
        }
        return copy;
    }
}
