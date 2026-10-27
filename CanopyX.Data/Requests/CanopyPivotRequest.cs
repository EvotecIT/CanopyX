using System;
using System.Collections.Generic;
using System.Linq;

namespace CanopyX.Data;

/// <summary>A validated pivot over the complete accepted query, independent of paging and row grouping.</summary>
public sealed class CanopyPivotRequest {
    private readonly CanopyGridPivot _definition;
    /// <summary>Creates a pivot request, enforcing the schema's opt-in and column allow-list.</summary>
    /// <param name="query">The accepted full query; its window and grouping do not limit pivot input.</param>
    /// <param name="definition">The row, column and value axes.</param>
    public CanopyPivotRequest(CanopyDataRequest query, CanopyGridPivot definition) {
        Query = query ?? throw new ArgumentNullException(nameof(query));
        if (definition == null) throw new ArgumentNullException(nameof(definition));
        if (!query.Schema.HasPivot) throw new CanopyRequestException(CanopyRequestError.Unsupported, "This view does not enable pivots.");
        _definition = definition.Copy();
        _definition.Validate(query.Schema.ProtocolView);
        foreach (var axis in _definition.Rows.Concat(_definition.Columns)) {
            var column = query.Schema.GetColumn(axis.Column);
            if (!column.Sortable || !column.Filterable) throw new CanopyRequestException(CanopyRequestError.ColumnNotFilterable, "Pivot axes need allowed sortable and filterable columns.");
        }
        Aggregates = Array.AsReadOnly(_definition.Values.Select(query.Schema.GetAggregate).ToArray());
    }
    /// <summary>Gets the complete accepted query.</summary>
    public CanopyDataRequest Query { get; }
    /// <summary>Gets a copy of the validated axis definition.</summary>
    public CanopyGridPivot Definition => _definition.Copy();
    /// <summary>Gets the selected declared aggregates in value-axis order.</summary>
    public IReadOnlyList<CanopySummaryAggregate> Aggregates { get; }
}
