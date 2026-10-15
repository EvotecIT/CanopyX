using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>A writer's answer to a commit batch: one result per row it handled, and the dataset revision after the commit.</summary>
/// <remarks>A row the result leaves out was not saved; the grid keeps its changes.</remarks>
public sealed class CanopyCommitResult {
    /// <summary>Creates a result.</summary>
    /// <param name="rows">The row results, each for a distinct row of the batch.</param>
    /// <param name="revision">The dataset revision after the commit, or null to let the endpoint read it from its data provider.</param>
    public CanopyCommitResult(IEnumerable<CanopyCommitRowResult> rows, string? revision = null) {
        Rows = new ReadOnlyCollection<CanopyCommitRowResult>(new List<CanopyCommitRowResult>(rows ?? throw new ArgumentNullException(nameof(rows))));
        Revision = revision;
    }

    /// <summary>Gets the row results.</summary>
    public IReadOnlyList<CanopyCommitRowResult> Rows { get; }

    /// <summary>Gets the dataset revision after the commit, or null.</summary>
    public string? Revision { get; }
}
