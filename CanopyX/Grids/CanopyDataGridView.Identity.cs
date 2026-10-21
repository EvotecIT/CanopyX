using System;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets the lifetime of row identities. Ordinals identify records only within this dataset snapshot.</summary>
    /// <remarks>Ordinal rows keep their source positions when sorted or filtered. Saved selections and keyed live updates require stable keys.</remarks>
    public CanopyGridRowIdentity RowIdentity { get; set; }

    private void ValidateRowIdentity() {
        if (Selection == CanopySelectionMode.None && Reporting?.SelectionControls == true)
            throw new InvalidOperationException("Selection controls require an enabled row selection mode.");
        if (RowIdentity != CanopyGridRowIdentity.StableKey && RowIdentity != CanopyGridRowIdentity.Ordinal)
            throw new ArgumentOutOfRangeException(nameof(RowIdentity), RowIdentity, "Unknown row identity mode.");
        if (RowIdentity == CanopyGridRowIdentity.Ordinal && Live != null)
            throw new InvalidOperationException("Ordinal row identity is snapshot-local; keyed live updates require stable row keys.");
        if (RowIdentity == CanopyGridRowIdentity.Ordinal && Record?.DeepLink == true)
            throw new InvalidOperationException("Ordinal row identity is snapshot-local; record deep links require stable row keys.");
    }
}
