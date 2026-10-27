using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

public sealed partial class CanopyQueryableProvider<T> : ICanopyPivotProvider {
    /// <inheritdoc />
    public async ValueTask<CanopyPivotResult> PivotAsync(CanopyPivotRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        var definition = request.Definition;
        var levels = definition.Rows.Concat(definition.Columns).Select(level => new CanopySummaryLevel(Schema.GetColumn(level.Column), level.Descending, bucket: level.Bucket)).ToList();
        // Distinct aggregate inputs remain grouping dimensions. Prefix/Other totals union their keys rather than summing distinct counts.
        var distinctPositions = new int[request.Aggregates.Count];
        for (var index = 0; index < distinctPositions.Length; index++) {
            distinctPositions[index] = -1;
            if (request.Aggregates[index].Operation != CanopyGridAggregateOperation.DistinctCount) continue;
            distinctPositions[index] = levels.FindIndex(level => level.Bucket == null && level.Column.Id == request.Aggregates[index].Column.Id);
            if (distinctPositions[index] >= 0) continue;
            distinctPositions[index] = levels.Count; levels.Add(new CanopySummaryLevel(request.Aggregates[index].Column, false));
        }
        var source = _source(); var translator = Translator(source);
        var groups = await translator.GroupsAsync(translator.Apply(source, request.Query), levels.Select(level => level.Column.Id).ToArray(), request.Aggregates,
            100001, Executor, cancellationToken, levels, pivot: true).ConfigureAwait(false);
        if (groups.Count > 100000) throw CanopyRequestException.Limit("The pivot has more than 100,000 grouped contributions. Narrow its query or axes.");
        var contributions = new List<CanopyPivotContribution>(groups.Count);
        foreach (var group in groups) {
            cancellationToken.ThrowIfCancellationRequested();
            contributions.Add(new CanopyPivotContribution {
                Rows = group.KeyValues.Take(definition.Rows.Count).Select(CanopyPivot.Normalize).ToArray(),
                Columns = group.KeyValues.Skip(definition.Rows.Count).Take(definition.Columns.Count).Select(CanopyPivot.Normalize).ToArray(),
                Count = group.Count, Counts = group.Counts, Values = group.Values,
                Distinct = distinctPositions.Select(position => position < 0 ? null : CanopyPivot.Normalize(group.KeyValues[position])).ToArray()
            });
        }
        cancellationToken.ThrowIfCancellationRequested();
        return CanopyPivot.FromContributions(Schema.ProtocolView, definition, contributions);
    }
}
