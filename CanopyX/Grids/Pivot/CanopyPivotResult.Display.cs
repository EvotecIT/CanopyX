using System;
using System.Linq;

namespace CanopyX;

public sealed partial class CanopyPivotResult {
    /// <summary>Projects a raw pivot aggregate as a numeric display/export value and number format.</summary>
    /// <param name="row">The row prefix identity.</param>
    /// <param name="column">The column prefix identity.</param>
    /// <param name="aggregate">A value identity declared by the pivot.</param>
    /// <param name="mode">An override, or null to use the aggregate's declared display mode.</param>
    /// <returns>The transformed numeric value. Ordered modes run over sibling rows in accepted order, before presentation collapse.</returns>
    public CanopyAggregateDisplayValue Display(string row, string column, string aggregate, CanopyShowAs? mode = null) {
        if (!_definition.Values.Contains(aggregate)) throw new ArgumentException("Unknown pivot aggregate.", nameof(aggregate));
        var descriptor = _view.Reporting!.Aggregates.First(value => value.Id == aggregate);
        var selected = mode ?? descriptor.ShowAs;
        var node = Rows.FirstOrDefault(value => value.Key == row) ?? throw new ArgumentException("Unknown pivot row.", nameof(row));
        var siblings = Rows.Where(value => value.Parent == node.Parent).ToArray();
        var values = siblings.Select(value => GetCell(value.Key, column).Aggregates[aggregate]).ToArray();
        var rowTotals = siblings.Select(value => GetCell(value.Key, "c").Aggregates[aggregate]).ToArray();
        var columnTotal = GetCell("r", column).Aggregates[aggregate];
        var transformed = CanopyAggregateDisplay.Evaluate(values, selected, GetCell("r", "c").Aggregates[aggregate],
            GetCell(node.Parent ?? "r", column).Aggregates[aggregate], rowTotals, siblings.Select(_ => columnTotal).ToArray());
        return new CanopyAggregateDisplayValue(transformed[Array.FindIndex(siblings, sibling => sibling.Key == row)], selected);
    }
}
