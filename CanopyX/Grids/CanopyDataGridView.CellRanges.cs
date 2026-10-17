using System;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets cell-range selection. Null, the default, leaves it off.</summary>
    public CanopyGridRangeSelection? RangeSelection { get; set; }

    /// <summary>Gets how cell ranges are copied and how pasted text is taken. It applies while <see cref="RangeSelection"/> is on.</summary>
    public CanopyGridClipboard Clipboard { get; } = new CanopyGridClipboard();

    private void ValidateCellRanges() {
        if (!Enum.IsDefined(typeof(CanopyGridClipboardValues), Clipboard.CopyValues))
            throw new ArgumentOutOfRangeException(nameof(Clipboard), Clipboard.CopyValues, "Unknown clipboard values.");
    }

    private void WriteCellRangesJson(CanopyJsonWriter writer) {
        if (RangeSelection != null) { writer.Name("rangeSelection"); RangeSelection.WriteJson(writer); }
        if (!Clipboard.IsDefault) { writer.Name("clipboard"); Clipboard.WriteJson(writer); }
    }
}
