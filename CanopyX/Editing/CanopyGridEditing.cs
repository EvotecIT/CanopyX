using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// How an editable flat grid behaves (<see cref="CanopyDataGridView.Editing"/>): read-only for now, cell or full-row editing,
/// the phone edit form and the edit bar. Columns opt in with <see cref="CanopyColumn.Editable"/>.
/// </summary>
/// <remarks>
/// CanopyX never writes data. Edits stay in the grid's change set until the host commits them: a browser host handles
/// <c>onRowCommit</c>, <c>editing.commit</c>, or a data source with a <c>commit</c> function that posts the <c>gridCommit</c>
/// document (see docs/editing.md and docs/data-protocol.md). JavaScript hosts can override these settings with the
/// <c>editing</c> option.
/// </remarks>
public sealed class CanopyGridEditing {
    /// <summary>Gets or sets whether the whole grid is read-only; the host can allow editing later with <c>setReadOnly(false)</c>.</summary>
    public bool ReadOnly { get; set; }

    /// <summary>Gets or sets whether readers edit one cell or a whole row at a time.</summary>
    public CanopyGridEditMode Mode { get; set; }

    /// <summary>Gets or sets when the record drawer becomes an edit form.</summary>
    public CanopyGridEditDrawer Drawer { get; set; }

    /// <summary>Gets or sets whether the toolbar shows the edit bar (the count of unsaved changes, Undo, Redo, Discard and Save) while there are changes.</summary>
    public bool EditBar { get; set; } = true;

    internal bool IsDefault => !ReadOnly && Mode == CanopyGridEditMode.Cell && Drawer == CanopyGridEditDrawer.Phone && EditBar;

    internal void Validate() {
        if (!Enum.IsDefined(typeof(CanopyGridEditMode), Mode)) throw new ArgumentOutOfRangeException(nameof(Mode), Mode, "Unknown edit mode.");
        if (!Enum.IsDefined(typeof(CanopyGridEditDrawer), Drawer)) throw new ArgumentOutOfRangeException(nameof(Drawer), Drawer, "Unknown edit drawer.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (ReadOnly) writer.Property("readOnly", true);
        if (Mode == CanopyGridEditMode.Row) writer.Property("mode", "row");
        if (Drawer != CanopyGridEditDrawer.Phone) writer.Property("drawer", Drawer == CanopyGridEditDrawer.Always ? "always" : "never");
        if (!EditBar) writer.Property("editBar", false);
        writer.EndObject();
    }
}