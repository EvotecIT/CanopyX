using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>
/// Holds any record provider's answer to the text bound (<see cref="CanopyRemoteLimits.MaxRecordTextLength"/>) with the
/// semantics of <see cref="RecordText.Clip(string, int)"/>: longer text ends with an ellipsis and fits the bound, never split
/// inside a surrogate pair. It shortens values, display text, tooltips, secondary and search text, badges, list items,
/// object fields, collection rows (and tree rows), timeline events and changes, at any depth. Identities (row and node
/// identities, link keys) and the record's row are never shortened. A cell whose raw text value is too long is replaced by
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

    private static void Entries(IDictionary<string, CanopyCell> cells, int maximum, ref long size) {
        List<KeyValuePair<string, CanopyCell>>? replaced = null;
        foreach (var pair in cells) {
            size += pair.Key.Length;
            if (pair.Value == null) continue;
            var cell = Cell(pair.Value, maximum, ref size);
            if (!ReferenceEquals(cell, pair.Value)) (replaced ??= new List<KeyValuePair<string, CanopyCell>>()).Add(new KeyValuePair<string, CanopyCell>(pair.Key, cell));
        }
        // Replaced after the walk: a dictionary may not change while it is enumerated.
        if (replaced != null) foreach (var pair in replaced) cells[pair.Key] = pair.Value;
    }

    private static CanopyCell Cell(CanopyCell cell, int maximum, ref long size) {
        cell.Text = Text(cell.Text, maximum, ref size);
        cell.SearchText = Text(cell.SearchText, maximum, ref size);
        cell.Title = Text(cell.Title, maximum, ref size);
        cell.Secondary = Text(cell.Secondary, maximum, ref size);
        if (cell.HasBadges) {
            var badges = cell.Badges;
            for (var i = 0; i < badges.Count; i++) {
                var badge = badges[i];
                if (badge == null) continue;
                badge.Title = Text(badge.Title, maximum, ref size);
                var text = Text(badge.Text, maximum, ref size)!;
                if (!ReferenceEquals(text, badge.Text)) badges[i] = new CanopyBadge(text, badge.Tone) { Title = badge.Title };
            }
        }
        if (cell.IsStructured) Structure(cell, maximum, ref size);
        if (!(cell.Value is string value)) return cell;
        var clipped = Text(value, maximum, ref size)!;
        return ReferenceEquals(clipped, value) ? cell : Copy(cell, clipped);
    }

    private static void Structure(CanopyCell cell, int maximum, ref long size) {
        var items = cell.Items;
        for (var i = 0; i < items.Count; i++) if (items[i] != null) items[i] = Cell(items[i], maximum, ref size);
        var fields = cell.Fields;
        for (var i = 0; i < fields.Count; i++) {
            var field = fields[i];
            if (field == null) continue;
            var name = Text(field.Name, maximum, ref size)!;
            var value = field.Value == null ? null : Cell(field.Value, maximum, ref size);
            if (!ReferenceEquals(name, field.Name) || !ReferenceEquals(value, field.Value)) fields[i] = new CanopyCellField(name, value) { Kind = field.Kind };
        }
        if (cell.Records != null) List(cell.Records, maximum, ref size);
        foreach (var item in cell.Events) {
            if (item == null) continue;
            item.Summary = Text(item.Summary, maximum, ref size)!;
            item.Actor = Text(item.Actor, maximum, ref size);
            item.Kind = Text(item.Kind, maximum, ref size);
            Changes(item.Changes, maximum, ref size);
        }
        Changes(cell.Changes, maximum, ref size);
    }

    private static void Changes(IList<CanopyFieldChange> changes, int maximum, ref long size) {
        for (var i = 0; i < changes.Count; i++) {
            var change = changes[i];
            if (change == null) continue;
            var name = Text(change.Name, maximum, ref size)!;
            var before = change.Before == null ? null : Cell(change.Before, maximum, ref size);
            var after = change.After == null ? null : Cell(change.After, maximum, ref size);
            if (!ReferenceEquals(name, change.Name) || !ReferenceEquals(before, change.Before) || !ReferenceEquals(after, change.After))
                changes[i] = new CanopyFieldChange(name, before, after) { Kind = change.Kind };
        }
    }

    private static void List(CanopyRecordList list, int maximum, ref long size) {
        foreach (var row in list.Rows) {
            if (row == null) continue;
            size += row.Id.Length;
            Entries(row.Cells, maximum, ref size);
            if (row.HasFields) Entries(row.Fields, maximum, ref size);
        }
        foreach (var root in list.Roots) Node(root, maximum, ref size, 0);
    }

    private static void Node(CanopyNode? node, int maximum, ref long size, int depth) {
        // Tree collections nest a bounded number of levels; deeper trees are refused when the answer is written.
        if (node == null || depth > 256) return;
        size += node.Id.Length;
        if (node.HasCells) Entries(node.Cells, maximum, ref size);
        if (node.HasInlineChildren) foreach (var child in node.Children) Node(child, maximum, ref size, depth + 1);
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
