using System;

namespace CanopyX;

/// <summary>Checks the raw value contract shared by grid rows and query operands.</summary>
internal static class CanopyGridValues {
    internal static void Validate(object? value, CanopyColumn column) {
        if (value == null) return;
        var numeric = value is long || value is decimal || value is double real && !double.IsNaN(real) && !double.IsInfinity(real);
        if (column.Kind == CanopyColumnKind.Number && !numeric) throw new InvalidOperationException("Grid column '" + column.Id + "' requires finite numeric values.");
        if (column.Kind == CanopyColumnKind.DateTime && !(value is DateTime)) throw new InvalidOperationException("Grid column '" + column.Id + "' requires UTC date values.");
        if (column.Kind == CanopyColumnKind.Text && !(value is string) && !(value is bool)) throw new InvalidOperationException("Grid column '" + column.Id + "' requires text or boolean values.");
    }
}
