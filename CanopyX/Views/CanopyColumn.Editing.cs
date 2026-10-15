namespace CanopyX;

public sealed partial class CanopyColumn {
    /// <summary>
    /// Gets or sets the typed editor of an editable flat-grid column. Null uses the editor of the column's kind. Requires
    /// <see cref="Editable"/>; tree views do not take editors.
    /// </summary>
    public CanopyCellEditor? Editor { get; set; }

    /// <summary>
    /// Gets or sets the checks an edited value of a flat-grid column must pass, which the browser mirrors as the reader edits.
    /// Requires <see cref="Editable"/>; tree views do not take validation.
    /// </summary>
    public CanopyCellValidation? Validation { get; set; }
}