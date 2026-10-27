using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;

namespace CanopyX.Data;

public sealed partial class CanopyInMemoryProvider<T> {
    private CanopyCalculationSet? _calculations;
    private readonly Dictionary<string, Func<T, object?>> _calculationInputs = new Dictionary<string, Func<T, object?>>(StringComparer.Ordinal);

    private void InitializeCalculations(IReadOnlyDictionary<string, Func<T, object?>> accessors) {
        var columns = Schema.ProtocolView.Columns;
        if (!columns.Any(column => column.Calculation != null)) return;
        _calculations = new CanopyCalculationSet(columns);
        var required = new HashSet<string>(StringComparer.Ordinal);
        void Require(string id) {
            if (!required.Add(id)) return;
            var column = Schema.ProtocolView.GetColumn(id);
            if (column.Calculation != null) foreach (var dependency in column.Calculation.Dependencies) Require(dependency);
            else {
                if (!accessors.TryGetValue(id, out var accessor) || accessor == null)
                    throw new ArgumentException("Column '" + id + "' needs a value accessor for in-memory calculations.", nameof(accessors));
                _calculationInputs.Add(id, accessor);
            }
        }
        foreach (var column in Schema.Columns) Require(column.Id);
    }

    /// <summary>Reads base cells, calculates on their raw values, then projects normalized query values by schema ordinal.</summary>
    private Record LoadCalculated(T item, CancellationToken cancellationToken) {
        var input = new CanopyGridRow("calculation-input");
        foreach (var pair in _calculationInputs) {
            cancellationToken.ThrowIfCancellationRequested();
            var value = pair.Value(item);
            cancellationToken.ThrowIfCancellationRequested();
            input.Cells[pair.Key] = (value as CanopyCell ?? CanopyDataValues.ToCell(value))!;
        }
        var calculated = _calculations!.Apply(input, Schema.ProtocolView.Labels);
        cancellationToken.ThrowIfCancellationRequested();
        var cells = new CanopyCell?[Schema.Columns.Count];
        var raw = new object?[Schema.Columns.Count];
        foreach (var column in Schema.Columns) {
            cancellationToken.ThrowIfCancellationRequested();
            calculated.Cells.TryGetValue(column.Id, out var cell);
            cells[column.Ordinal] = cell;
            raw[column.Ordinal] = CanopyDataValues.Normalize(cell?.Value);
        }
        var id = _id(item);
        cancellationToken.ThrowIfCancellationRequested();
        return new Record(id, raw, cells);
    }
}
