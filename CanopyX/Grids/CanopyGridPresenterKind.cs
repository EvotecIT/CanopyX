namespace CanopyX;

/// <summary>Safe optional cell presentations. Raw values retain their query and export meanings.</summary>
public enum CanopyGridPresenterKind {
    /// <summary>A link with an HTTP, HTTPS, mail or relative destination.</summary>
    Link,
    /// <summary>A decorative text glyph beside the cell's accessible text.</summary>
    Icon,
    /// <summary>A bounded native progress indicator beside the formatted value.</summary>
    Progress,
    /// <summary>Translated true and false labels for raw boolean values.</summary>
    Boolean,
    /// <summary>A bounded preview of delimiter-separated text, with a complete text dialog.</summary>
    List,
    /// <summary>A cell preview that opens complete plain text outside the fixed row.</summary>
    LongText,
    /// <summary>A tone pill; healthy values use a quiet state instead.</summary>
    Enum,
    /// <summary>A state dot with quiet healthy text.</summary>
    State,
    /// <summary>A directional delta beside the current numeric value.</summary>
    Change,
    /// <summary>Period states, condensed into worst-state buckets when necessary.</summary>
    StatusStrip,
    /// <summary>A small bar history with a cell or shared scale.</summary>
    SparklineBars,
    /// <summary>A small line history marking its worst or last point.</summary>
    SparklineLine,
    /// <summary>Primary and optional secondary identifier text.</summary>
    Identifier,
    /// <summary>Up to three outlined tags followed by a complete-text control.</summary>
    Tags,
    /// <summary>Normal text with an em dash for missing values.</summary>
    Missing,
    /// <summary>A summary of a structured value (a list, object, collection, timeline or changes): a count, chips, or the first item and +N.</summary>
    Structured
}
