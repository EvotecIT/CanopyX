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
    LongText
}
