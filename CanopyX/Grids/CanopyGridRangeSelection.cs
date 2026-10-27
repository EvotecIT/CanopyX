using CanopyX.Json;

namespace CanopyX;

/// <summary>Cell-range selection on a flat grid: ranges by mouse, keyboard and touch, the cell menu and the clipboard keys.</summary>
/// <remarks>
/// Ranges load the grid's <c>cell-range</c> part. They are cells, not rows: row selection keeps its checkboxes and Space.
/// Readers drag over cells, Shift+click or press Shift with the arrow keys, add ranges with Ctrl or Cmd, and on touch screens
/// long-press a cell and drag. Copy writes tab-separated text with a typed table (see <see cref="CanopyDataGridView.Clipboard"/>).
/// </remarks>
public sealed class CanopyGridRangeSelection {
    /// <summary>Gets or sets whether readers make ranges by pointer, keyboard and touch. Defaults to true.</summary>
    /// <remarks>False keeps the part, the clipboard settings and the browser API (<c>setCellRanges</c>, <c>copyCellRanges</c>, <c>pasteCells</c>) without the input.</remarks>
    public bool Enabled { get; set; } = true;

    /// <summary>Gets or sets whether Ctrl or Cmd adds further ranges. Defaults to true.</summary>
    public bool MultipleRanges { get; set; } = true;

    /// <summary>Gets or sets whether a single range shows the fill handle, which drags down to repeat or continue its values. Defaults to false.</summary>
    /// <remarks>Numbers, ISO dates and numbered labels continue their step (one day or one unit for a single seed).
    /// Ctrl or Cmd held at drag release copies the seed values instead. Ctrl/Cmd+D also copies the range's first row.
    /// Filled values go through the paste event and the editing part, as pasted values do.</remarks>
    public bool FillHandle { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) {
        if (Enabled && MultipleRanges && !FillHandle) { writer.Boolean(true); return; }
        writer.BeginObject();
        if (!Enabled) writer.Property("enabled", false);
        if (!MultipleRanges) writer.Property("multiple", false);
        if (FillHandle) writer.Property("fillHandle", true);
        writer.EndObject();
    }
}
