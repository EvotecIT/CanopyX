using System;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyColumn {
    private int? _minWidth, _maxWidth, _responsivePriority;
    private double _flex;

    /// <summary>Gets or sets how the flat-grid column gives way when the grid is narrow. Null uses the default:
    /// essential for the identity column (see <see cref="RowHeader"/>), normal for the others.</summary>
    /// <remarks>Comparable to DataTables Responsive priorities; see <see cref="ResponsivePriority"/> for the numeric form.</remarks>
    public CanopyColumnPriority? Priority { get; set; }

    /// <summary>Gets or sets a numeric priority in the style of DataTables' <c>responsivePriority</c>: 0 and 1 are essential,
    /// 10000 and above optional, values between normal. Larger values hide first among optional columns. Null uses <see cref="Priority"/>.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is negative.</exception>
    public int? ResponsivePriority {
        get => _responsivePriority;
        set => _responsivePriority = value < 0 ? throw new ArgumentOutOfRangeException(nameof(value)) : value;
    }

    /// <summary>Gets or sets the requested pinned edge. Null uses the default: the identity column pins left, the others scroll.
    /// <see cref="CanopyGridColumnPin.None"/> explicitly unpins the identity column. Users can pin and unpin from the header menu.</summary>
    public CanopyGridColumnPin? Pinned { get; set; }

    /// <summary>Gets or sets whether this column is the row header (identity column). Without one, the first column is.
    /// The identity column is essential, pinned left and first to receive spare width unless set otherwise.</summary>
    public bool RowHeader { get; set; }

    /// <summary>Gets or sets the narrowest width in CSS pixels (<c>minWidth</c> on the wire). Null keeps 40.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is below the 40-pixel <see cref="MinWidth"/> constant.</exception>
    public int? MinimumWidth {
        get => _minWidth;
        set => _minWidth = value < CanopyColumn.MinWidth ? throw new ArgumentOutOfRangeException(nameof(value)) : value;
    }

    /// <summary>Gets or sets the widest width in CSS pixels (<c>maxWidth</c> on the wire), also the cap for content measuring. Null leaves the column unbounded.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is below the 40-pixel <see cref="MinWidth"/> constant.</exception>
    public int? MaximumWidth {
        get => _maxWidth;
        set => _maxWidth = value < CanopyColumn.MinWidth ? throw new ArgumentOutOfRangeException(nameof(value)) : value;
    }

    /// <summary>Gets or sets whether <see cref="Width"/> is a hard width that neither grows nor shrinks with the layout. Requires an assigned width.</summary>
    public bool Fixed { get; set; }

    /// <summary>Gets or sets this column's share of spare width, from 0 to 100, as in AG Grid's <c>flex</c>. Flex columns receive
    /// spare width before the identity column. Zero leaves spare width to the default layout.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is not finite or is outside 0 to 100.</exception>
    public double Flex {
        get => _flex;
        set => _flex = double.IsNaN(value) || double.IsInfinity(value) || value < 0 || value > 100 ? throw new ArgumentOutOfRangeException(nameof(value)) : value;
    }

    /// <summary>Gets or sets what the column measures to find its content width.</summary>
    public CanopyColumnAutoSize AutoSize { get; set; }

    internal void ValidateLayout() {
        if (_minWidth.HasValue && _maxWidth.HasValue && _maxWidth < _minWidth) throw new InvalidOperationException("A column's maximum width cannot be below its minimum width.");
        if (Fixed && !HasExplicitWidth) throw new InvalidOperationException("A fixed column needs an assigned width.");
        if (Priority.HasValue && _responsivePriority.HasValue) throw new InvalidOperationException("Set either Priority or ResponsivePriority on a column, not both.");
        if (Priority.HasValue && !Enum.IsDefined(typeof(CanopyColumnPriority), Priority.Value) || Pinned.HasValue && !Enum.IsDefined(typeof(CanopyGridColumnPin), Pinned.Value) ||
            !Enum.IsDefined(typeof(CanopyColumnAutoSize), AutoSize)) throw new InvalidOperationException("Unknown column priority, pin or auto-size mode.");
    }

    private void WriteLayoutJson(CanopyJsonWriter writer) {
        writer.OptionalProperty("minWidth", _minWidth).OptionalProperty("maxWidth", _maxWidth);
        if (Fixed) writer.Property("fixed", true);
        if (_flex > 0) writer.Name("flex").Number(_flex);
        if (AutoSize != CanopyColumnAutoSize.Content) writer.Property("autoSize", AutoSize == CanopyColumnAutoSize.Header ? "header" : "none");
        if (_responsivePriority.HasValue) writer.Property("priority", _responsivePriority.Value);
        else if (Priority.HasValue) writer.Property("priority", Priority == CanopyColumnPriority.Essential ? "essential" : Priority == CanopyColumnPriority.Optional ? "optional" : "normal");
        if (Pinned.HasValue) {
            writer.Name("pinned");
            if (Pinned == CanopyGridColumnPin.None) writer.Null(); else writer.String(Pinned == CanopyGridColumnPin.Left ? "left" : "right");
        }
        if (RowHeader) writer.Property("rowHeader", true);
    }
}
