using System;
using System.Collections.Generic;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets the column groups drawn as header rows above the columns. Empty draws one header row.</summary>
    /// <remarks>
    /// Groups load the grid's <c>column-groups</c> part. Each group's columns must be adjacent in <see cref="Columns"/>; the
    /// script-free fallback and print draw the same header rows with spanning cells.
    /// </remarks>
    public IList<CanopyColumnGroup> ColumnGroups { get; } = new List<CanopyColumnGroup>();

    private void ValidateColumnGroups() {
        if (ColumnGroups.Count == 0) return;
        if (ColumnGroups.Count > 1000) throw new InvalidOperationException("A grid supports at most 1000 column groups.");
        var columns = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
        foreach (var column in Columns) columns[column.Id] = column;
        var groupIds = new HashSet<string>(StringComparer.Ordinal);
        var grouped = new HashSet<string>(StringComparer.Ordinal);
        foreach (var group in ColumnGroups) {
            if (group == null) throw new InvalidOperationException("Column groups cannot be null.");
            group.Validate(columns, groupIds, grouped, 1);
        }
        var order = Columns.Select(column => column.Id).ToList();
        foreach (var group in AllColumnGroups(ColumnGroups)) {
            var positions = group.Leaves().Select(id => order.IndexOf(id)).OrderBy(index => index).ToList();
            if (positions[positions.Count - 1] - positions[0] != positions.Count - 1)
                throw new InvalidOperationException("The columns of column group " + group.Id + " must be adjacent in the column order.");
        }
        foreach (var group in ColumnGroups) {
            // A top-level group scrolls or pins as a whole: its columns' own pins agree with the group's, and with each other.
            CanopyGridColumnPin? shared = group.Pinned;
            foreach (var id in group.Leaves()) {
                var pin = columns[id].Pinned;
                if (!pin.HasValue) continue;
                if (shared.HasValue && pin.Value != shared.Value)
                    throw new InvalidOperationException("The columns of column group " + group.Id + " must share one pin; column " + id + " has another.");
                shared = pin;
            }
        }
    }

    /// <summary>Every group, nested groups included, parents before children.</summary>
    internal static IEnumerable<CanopyColumnGroup> AllColumnGroups(IEnumerable<CanopyColumnGroup> groups) {
        foreach (var group in groups) {
            yield return group;
            foreach (var nested in AllColumnGroups(group.Groups)) yield return nested;
        }
    }

    /// <summary>The groups above a column, from its top-level group down to its own; empty outside every group.</summary>
    internal IReadOnlyList<CanopyColumnGroup> ColumnGroupPath(string columnId) {
        var path = new List<CanopyColumnGroup>();
        bool Find(IEnumerable<CanopyColumnGroup> groups) {
            foreach (var group in groups) {
                path.Add(group);
                if (group.Columns.Contains(columnId) || Find(group.Groups)) return true;
                path.RemoveAt(path.Count - 1);
            }
            return false;
        }
        Find(ColumnGroups);
        return path;
    }

    private void WriteColumnGroupsJson(CanopyJsonWriter writer) {
        if (ColumnGroups.Count == 0) return;
        writer.Name("columnGroups").BeginArray();
        foreach (var group in ColumnGroups) group.WriteJson(writer);
        writer.EndArray();
    }
}
