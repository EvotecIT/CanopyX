using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Optional reporting capabilities carried by the reporting-grid runtime.</summary>
/// <remarks>Ordinary flat grids and trees do not include these optional presentation and query policies.</remarks>
public sealed class CanopyGridReporting {
    /// <summary>Gets immutable text ordering policies keyed by declared sortable text-column identities.</summary>
    public IDictionary<string, CanopyGridOrdering> Ordering { get; } = new Dictionary<string, CanopyGridOrdering>(StringComparer.Ordinal);

    internal void Validate(IList<CanopyColumn> columns) {
        foreach (var pair in Ordering) {
            CanopyColumn? declared = null;
            foreach (var column in columns) if (column.Id == pair.Key) declared = column;
            if (declared == null || declared.Kind != CanopyColumnKind.Text || !declared.Sortable || pair.Value == null)
                throw new InvalidOperationException("Reporting ordering must identify a sortable text column and a non-null policy.");
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (Ordering.Count != 0) {
            writer.Name("ordering").BeginObject();
            foreach (var pair in Ordering) { writer.Name(pair.Key); pair.Value.WriteJson(writer); }
            writer.EndObject();
        }
        writer.EndObject();
    }
}
