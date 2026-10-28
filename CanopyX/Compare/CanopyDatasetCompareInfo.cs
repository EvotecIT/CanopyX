using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Optional grid metadata for a complete keyed dataset comparison.</summary>
public sealed class CanopyDatasetCompareInfo {
    /// <summary>Creates comparison metadata, copying the column counts.</summary>
    /// <param name="statusColumn">Declared text column containing lowercase row-status tokens.</param>
    /// <param name="counts">Counts across the complete comparison.</param>
    /// <param name="columns">Changed matched-cell counts by column ID. Added and removed rows do not increment these counts.</param>
    /// <param name="onlyChanges">Whether the initial comparison display hides unchanged rows.</param>
    public CanopyDatasetCompareInfo(string statusColumn, CanopyDatasetCompareCounts counts,
        IReadOnlyDictionary<string, int> columns, bool onlyChanges = false) {
        CanopyIdentifiers.Require(statusColumn, nameof(statusColumn));
        StatusColumn = statusColumn;
        Counts = counts ?? throw new ArgumentNullException(nameof(counts));
        if (columns == null) throw new ArgumentNullException(nameof(columns));
        var copy = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var entry in columns) {
            CanopyIdentifiers.Require(entry.Key, nameof(columns));
            if (entry.Value < 0 || entry.Value > counts.Changed) throw new ArgumentOutOfRangeException(nameof(columns), "A column count cannot exceed changed matched rows.");
            copy.Add(entry.Key, entry.Value);
        }
        Columns = new ReadOnlyDictionary<string, int>(copy);
        OnlyChanges = onlyChanges;
    }

    /// <summary>Gets the dedicated row-status column ID.</summary>
    public string StatusColumn { get; }
    /// <summary>Gets complete, unfiltered row counts.</summary>
    public CanopyDatasetCompareCounts Counts { get; }
    /// <summary>Gets changed matched-cell counts by column ID.</summary>
    public IReadOnlyDictionary<string, int> Columns { get; }
    /// <summary>Gets whether the initial display hides unchanged rows.</summary>
    public bool OnlyChanges { get; }

    internal void Validate(CanopyDataGridView view) {
        CanopyColumn? status = null;
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var column in view.Columns) {
            ids.Add(column.Id);
            if (column.Id == StatusColumn) status = column;
        }
        if (status == null || status.Kind != CanopyColumnKind.Text || !status.Filterable || status.Editable)
            throw new InvalidOperationException("A comparison requires a declared, filterable, read-only text status column.");
        if (view.RowIdentity != CanopyGridRowIdentity.StableKey)
            throw new InvalidOperationException("Dataset comparisons require stable row keys across both versions.");
        foreach (var column in Columns.Keys) if (column == StatusColumn || !ids.Contains(column))
            throw new InvalidOperationException("Comparison counts require declared data columns distinct from the status column.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("statusColumn", StatusColumn).Name("counts");
        Counts.WriteJson(writer);
        writer.Name("columns").BeginObject();
        foreach (var entry in Columns) writer.Property(entry.Key, entry.Value);
        writer.EndObject().Property("onlyChanges", OnlyChanges).EndObject();
    }
}
