using System.Collections.Generic;

namespace CanopyX;

/// <summary>A stable identity, its two source rows and the cells that differ between them.</summary>
/// <remarks>Source rows are retained by reference. Do not mutate a source dataset while comparing or presenting the result.</remarks>
public sealed class CanopyComparedRow {
    internal CanopyComparedRow(CanopyGridRow? before, CanopyGridRow? after, CanopyDatasetRowStatus status, List<string> changedColumns) {
        Before = before; After = after; Status = status; ChangedColumns = changedColumns.AsReadOnly();
    }

    /// <summary>Gets the stable, case-sensitive dataset identity.</summary>
    public string Id => (After ?? Before!).Id;
    /// <summary>Gets the earlier row, or null for an added row.</summary>
    public CanopyGridRow? Before { get; }
    /// <summary>Gets the later row, or null for a removed row.</summary>
    public CanopyGridRow? After { get; }
    /// <summary>Gets the mutually exclusive row status.</summary>
    public CanopyDatasetRowStatus Status { get; }
    /// <summary>Gets differing cell IDs on matched rows, in comparison-column order. Added and removed rows have no matched-cell changes.</summary>
    public IReadOnlyList<string> ChangedColumns { get; }
}
