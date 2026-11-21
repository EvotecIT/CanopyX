using System;
using System.Linq;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    // A grid over a shared dataset reads rows other views read too: it carries none, and it never changes them.
    private void ValidateDatasetView() {
        if (Rows.Count != 0) throw new InvalidOperationException("A grid that reads a shared dataset carries no rows of its own.");
        if (Source.Kind != CanopyGridSourceKind.Inline) return;
        if (CalculatedColumnsEditable || Columns.Any(column => column.Calculation != null))
            throw new InvalidOperationException("A grid that reads a shared dataset cannot have calculated columns, which would write into the shared rows.");
        if (Columns.Any(column => column.Editable))
            throw new InvalidOperationException("A grid that reads a shared dataset cannot edit cells; change the rows through the dataset.");
    }
}
