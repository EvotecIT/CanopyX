using System;
using System.Text;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Preserves raw CLR types during comparison and the existing structured change wire contract during projection.</summary>
internal static class CanopyCompareCells {
    internal static bool Equal(CanopyCell? before, CanopyCell? after) {
        if (ReferenceEquals(before, after)) return true;
        if (before == null || after == null) return false;
        if (before.Value?.GetType() != after.Value?.GetType() || !Equals(before.Value, after.Value)) return false;
        if (!before.IsStructured && !after.IsStructured) return true;
        var left = new CanopyJsonWriter(); before.WriteJson(left);
        var right = new CanopyJsonWriter(); after.WriteJson(right);
        if (!string.Equals(left.ToString(), right.ToString(), StringComparison.Ordinal)) return false;
        // Dates and their ISO strings, and distinct numeric types, can share identical JSON.
        var leftTypes = new StringBuilder(); Types(leftTypes, before);
        var rightTypes = new StringBuilder(); Types(rightTypes, after);
        return string.Equals(leftTypes.ToString(), rightTypes.ToString(), StringComparison.Ordinal);
    }

    private static void Types(StringBuilder text, CanopyCell? cell) {
        if (cell == null) { text.Append("missing;"); return; }
        text.Append(cell.Value?.GetType().FullName ?? "null").Append(';');
        if (!cell.IsStructured) return;
        foreach (var item in cell.Items) Types(text, item);
        foreach (var field in cell.Fields) Types(text, field.Value);
        foreach (var change in cell.Changes) { Types(text, change.Before); Types(text, change.After); }
        foreach (var entry in cell.Events) foreach (var change in entry.Changes) { Types(text, change.Before); Types(text, change.After); }
        if (cell.Records == null) return;
        foreach (var row in cell.Records.Rows) {
            foreach (var value in row.Cells.Values) Types(text, value);
            if (row.HasFields) foreach (var value in row.Fields.Values) Types(text, value);
        }
        foreach (var root in cell.Records.Roots) NodeTypes(text, root);
    }

    private static void NodeTypes(StringBuilder text, CanopyNode node) {
        if (node.HasCells) foreach (var value in node.Cells.Values) Types(text, value);
        foreach (var child in node.Children) NodeTypes(text, child);
    }

    internal static CanopyCell Scalar(CanopyCell? source) {
        var cell = source?.Value switch {
            string value => new CanopyCell(value), long value => new CanopyCell(value),
            double value => new CanopyCell(value), decimal value => new CanopyCell(value),
            bool value => new CanopyCell(value), DateTime value => new CanopyCell(value), _ => new CanopyCell()
        };
        if (source == null) return cell;
        cell.Text = source.Text; cell.Title = source.Title; cell.SearchText = source.SearchText;
        cell.Secondary = source.Secondary; cell.Tone = source.Tone; cell.SortKey = source.SortKey;
        if (source.HasBadges) foreach (var badge in source.Badges) cell.Badges.Add(badge);
        return cell;
    }

    /// <summary>A present empty cell must be an object on the wire so it is distinguishable from an absent side.</summary>
    internal static CanopyCell Present(CanopyCell? source) {
        if (source == null) return new CanopyCell { Text = string.Empty };
        if (source.Value != null || source.IsStructured || source.Text != null) return source;
        var copy = Scalar(source); copy.Text = string.Empty; return copy;
    }
}
