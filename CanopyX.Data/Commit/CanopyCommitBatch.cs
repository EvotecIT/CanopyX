using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>A validated <c>gridCommit</c> document: the changed rows a grid asks its writer to save, with the revision it read.</summary>
public sealed class CanopyCommitBatch {
    /// <summary>Creates a batch.</summary>
    /// <param name="schema">The column allow-list the batch was validated against.</param>
    /// <param name="revision">The dataset revision the grid read, or null when it had none.</param>
    /// <param name="rows">The changed rows, with distinct identities.</param>
    public CanopyCommitBatch(CanopyDataSchema schema, string? revision, IEnumerable<CanopyCommitRow> rows) {
        Schema = schema ?? throw new ArgumentNullException(nameof(schema));
        Revision = revision;
        var list = new List<CanopyCommitRow>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rows ?? throw new ArgumentNullException(nameof(rows))) {
            if (row == null || !ids.Add(row.Id)) throw new ArgumentException("Rows must be distinct and not null.", nameof(rows));
            list.Add(row);
        }
        Rows = new ReadOnlyCollection<CanopyCommitRow>(list);
    }

    /// <summary>Gets the column allow-list.</summary>
    public CanopyDataSchema Schema { get; }

    /// <summary>Gets the dataset revision the grid read, or null before it accepted one.</summary>
    public string? Revision { get; }

    /// <summary>Gets the changed rows, in the order the grid sent them.</summary>
    public IReadOnlyList<CanopyCommitRow> Rows { get; }
}
