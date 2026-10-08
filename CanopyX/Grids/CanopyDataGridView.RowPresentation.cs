using System;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets what a plain row click does. A plain click never selects. Defaults to <see cref="CanopyGridRowAction.None"/>.</summary>
    public CanopyGridRowAction RowAction { get; set; }

    /// <summary>Gets or sets whether a grid whose rows all fit is exactly as tall as its chrome, header and rows. The host height
    /// remains the bound for longer results. Defaults to true; set false for a fixed-height panel.</summary>
    public bool AutoHeight { get; set; } = true;

    /// <summary>Gets or sets whether a row tone also draws a coloured bar at the row's start. Defaults to false, which leaves the
    /// coloured bar to the selected row and leaves colour to the cells that carry their own tone.</summary>
    public bool RowAccents { get; set; }

    private void ValidateRowPresentation() {
        if (!Enum.IsDefined(typeof(CanopyGridRowAction), RowAction)) throw new ArgumentOutOfRangeException(nameof(RowAction), RowAction, "Unknown row action.");
    }

    private void WriteRowPresentationJson(CanopyJsonWriter writer) {
        if (RowAction != CanopyGridRowAction.None) writer.Property("rowAction", RowAction == CanopyGridRowAction.Details ? "details" : "link");
        if (!AutoHeight) writer.Property("autoHeight", false);
        if (RowAccents) writer.Property("rowAccents", true);
    }
}
