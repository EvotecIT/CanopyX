using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>
    /// Gets the actions column: add actions with <c>RowActions.Add(new CanopyRowAction("run", "Run", CanopyRowActionIcon.Play))</c>.
    /// A grid with actions carries the row-actions part; the host carries them out in its <c>onRowAction</c> hook (docs/row-actions.md).
    /// </summary>
    public CanopyRowActions RowActions { get; } = new CanopyRowActions();

    private void ValidateRowActions() { if (!RowActions.IsEmpty) RowActions.Validate(Columns); }

    private void WriteRowActionsJson(CanopyJsonWriter writer) {
        if (!RowActions.IsEmpty) { writer.Name("rowActions"); RowActions.WriteJson(writer); }
    }
}
