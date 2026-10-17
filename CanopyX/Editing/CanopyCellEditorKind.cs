namespace CanopyX;

/// <summary>The typed editor an editable flat-grid column offers (<see cref="CanopyCellEditor"/>).</summary>
public enum CanopyCellEditorKind {
    /// <summary>A text box. The default for text columns.</summary>
    Text = 0,

    /// <summary>A number box that reads numbers as the page language writes them, with optional minimum, maximum and step. The default for number columns.</summary>
    Number,

    /// <summary>A date picker. On a date-and-time column it changes the date in the grid's time zone and keeps the time of day; on a text column the value is <c>yyyy-MM-dd</c>.</summary>
    Date,

    /// <summary>A date and time picker in the grid's time zone. The default for date-and-time columns; on a text column the value is <c>yyyy-MM-ddTHH:mm</c>.</summary>
    DateTime,

    /// <summary>A time picker. On a date-and-time column it changes the time of day in the grid's time zone; on a text column the value is <c>HH:mm</c>.</summary>
    Time,

    /// <summary>A list of fixed options (<see cref="CanopyCellEditor.Options"/>).</summary>
    Select,

    /// <summary>A check box for true and false values of a text column.</summary>
    Toggle,

    /// <summary>A search box that suggests values as the reader types: the editor's options, the host's lookup function, or the values of a column through the data source.</summary>
    Lookup,

    /// <summary>An editor a browser plugin or the host registers under <see cref="CanopyCellEditor.Name"/>.</summary>
    Custom
}
