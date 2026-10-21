namespace CanopyX;

/// <summary>The cell type of a records field's column (<see cref="CanopyFlowRecordColumn.Kind"/>).</summary>
public enum CanopyFlowRecordColumnKind {
    /// <summary>Text. The default.</summary>
    Text,

    /// <summary>A finite number.</summary>
    Number,

    /// <summary>A date written <c>yyyy-MM-dd</c>.</summary>
    Date,

    /// <summary>A time of day written <c>HH:mm</c>.</summary>
    Time,

    /// <summary>One of the column's options.</summary>
    Select,

    /// <summary>True or false.</summary>
    Toggle
}