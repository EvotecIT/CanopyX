using System;
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

    /// <summary>Gets or sets the pinned edge. Null uses the identity-column default; None explicitly unpins it. Tree views pin only their tree column, to the left.</summary>
    public CanopyGridColumnPin? Pinned { get; set; }

    /// <summary>Gets or sets whether this column identifies a record. The first column is the default row header. Tree views always use their tree column.</summary>
    public bool RowHeader { get; set; }

    internal void ValidateLayout() {
        if (Pinned.HasValue && !Enum.IsDefined(typeof(CanopyGridColumnPin), Pinned.Value)) throw new InvalidOperationException("Unknown column pin.");
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
    }
}
