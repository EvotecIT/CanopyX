using System;
using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets whether readers can author calculated columns in an inline grid. Defaults to false.</summary>
    /// <remarks>This controls the expression editor, not authored calculated columns. Hosted grids cannot enable it.</remarks>
    public bool CalculatedColumnsEditable { get; set; }

    private void ValidateCalculations() {
        if (CalculatedColumnsEditable && Source.Kind != CanopyGridSourceKind.Inline)
            throw new InvalidOperationException("The calculated-column editor requires an inline source.");
        _ = new CanopyCalculationSet(Columns);
    }

    /// <summary>Materializes inline expressions without changing the caller's rows; hosted values are already authoritative.</summary>
    internal IEnumerable<CanopyGridRow> CalculateRows(IEnumerable<CanopyGridRow> rows) {
        if (Source.Kind != CanopyGridSourceKind.Inline) return rows;
        var calculations = new CanopyCalculationSet(Columns);
        return calculations.IsEmpty ? rows : calculations.Apply(rows, Labels);
    }
}
