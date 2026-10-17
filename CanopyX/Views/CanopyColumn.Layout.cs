using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyColumn {
    private int? _responsivePriority;

    /// <summary>Gets or sets responsive retention priority. Zero and one are essential; 10000 and above are optional. Larger values hide first. Null uses the identity-column default.</summary>
    public int? ResponsivePriority {
        get => _responsivePriority;
        set => _responsivePriority = value < 0 ? throw new ArgumentOutOfRangeException(nameof(value)) : value;
    }

    /// <summary>Gets or sets whether responsive fitting retains this column at every viewport width. Explicit user hiding still applies.</summary>
    public bool AlwaysVisible { get; set; }

    /// <summary>
    /// Gets or sets the pinned edge. Null uses the identity-column default; None explicitly unpins it. In a tree view the tree
    /// column pins left or scrolls (None), and the other columns pin left (after the tree column) or right.
    /// </summary>
    public CanopyGridColumnPin? Pinned { get; set; }

    /// <summary>Gets or sets whether this column identifies a record. The first column is the default row header. Tree views always use their tree column.</summary>
    public bool RowHeader { get; set; }

    /// <summary>The <see cref="Tooltip"/> value that shows a cell's own full value while it is cut off.</summary>
    public const string AutoTooltip = "auto";

    /// <summary>
    /// Gets or sets the tooltip of this column's cells, shown on hover. <see cref="AutoTooltip"/> (<c>"auto"</c>) shows a cell's
    /// full value while it is cut off (an ellipsis); any other value names a declared column
    /// whose text the tooltip shows. Null shows none. A cell's own title
    /// (<see cref="CanopyCell.Title"/>) takes precedence, and the value <c>auto</c> always means the automatic tooltip.
    /// </summary>
    public string? Tooltip { get; set; }

    internal void ValidateLayout(IEnumerable<CanopyColumn> columns) {
        if (Pinned.HasValue && !Enum.IsDefined(typeof(CanopyGridColumnPin), Pinned.Value)) throw new InvalidOperationException("Unknown column pin.");
        if (Tooltip == null || Tooltip == AutoTooltip) return;
        foreach (var column in columns) if (column.Id == Tooltip) return;
        throw new InvalidOperationException("Column '" + Id + "' takes its tooltip from '" + Tooltip + "', which is not a declared column.");
    }

    private void WriteLayoutJson(CanopyJsonWriter writer, bool grid) {
        if (Sizing.IsFixed) writer.Property("fixed", true);
        if (Sizing.FlexWeight > 0) writer.Name("flex").Number(Sizing.FlexWeight);
        if (Sizing.Measure != CanopyColumnAutoSize.Content) writer.Property("autoSize", Sizing.Measure == CanopyColumnAutoSize.Header ? "header" : "none");
        if (_responsivePriority.HasValue) writer.Property("priority", _responsivePriority.Value);
        if (AlwaysVisible) writer.Property("alwaysVisible", true);
        if (Pinned.HasValue) {
            writer.Name("pinned");
            if (Pinned == CanopyGridColumnPin.None) writer.Null(); else writer.String(Pinned == CanopyGridColumnPin.Left ? "left" : "right");
        }
        if (grid && RowHeader) writer.Property("rowHeader", true);
        writer.OptionalProperty("tooltip", Tooltip);
    }
}
