namespace CanopyX;

/// <summary>Which values a flat grid copies from cell ranges.</summary>
public enum CanopyGridClipboardValues {
    /// <summary>The text the cells show, in the page language and the grid's time zone.</summary>
    Display,
    /// <summary>The raw values: numbers with a dot as the decimal separator, dates as yyyy-MM-dd HH:mm:ss in the grid's time zone, and TRUE or FALSE.</summary>
    Raw
}
