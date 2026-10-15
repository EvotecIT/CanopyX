namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the accessible name of a cell editor, including <c>{column}</c>. Default "Edit {column}".</summary>
    public string GridEditCell { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that saves changes (the edit bar and the edit form). Default "Save".</summary>
    public string GridEditSave { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that closes the edit form without saving. Default "Cancel".</summary>
    public string GridEditCancel { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the edit bar button that reverts every unsaved change. Default "Discard".</summary>
    public string GridEditDiscard { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the edit bar's undo button. Default "Undo".</summary>
    public string GridEditUndo { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the edit bar's redo button. Default "Redo".</summary>
    public string GridEditRedo { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what a screen reader hears for a changed cell. Default "Edited".</summary>
    public string GridEditEdited { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the edit bar's count of changed rows, including <c>{count}</c>. Default "Unsaved changes: {count}".</summary>
    public string GridEditChanges { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the count of rows with errors, including <c>{count}</c>. Default "Errors: {count}".</summary>
    public string GridEditErrors { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the edit bar's text while changes save. Default "Saving…".</summary>
    public string GridEditSaving { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement of saved rows, including <c>{count}</c>. Default "Saved rows: {count}".</summary>
    public string GridEditSaved { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement of rows that could not be saved, including <c>{count}</c>. Default "Rows not saved: {count}".</summary>
    public string GridEditFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for an empty required value, including <c>{column}</c>. Default "{column} is required.".</summary>
    public string GridEditRequired { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for text in a number column, including <c>{column}</c>. Default "{column} must be a number.".</summary>
    public string GridEditNumber { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for an incomplete or invalid date, including <c>{column}</c>. Default "{column} must be a valid date.".</summary>
    public string GridEditDate { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a value below the minimum, including <c>{column}</c> and <c>{min}</c>. Default "{column} must be at least {min}.".</summary>
    public string GridEditMin { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a value above the maximum, including <c>{column}</c> and <c>{max}</c>. Default "{column} must be at most {max}.".</summary>
    public string GridEditMax { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a number off the editor's step, including <c>{column}</c> and <c>{step}</c>. Default "{column} must be a multiple of {step}.".</summary>
    public string GridEditStep { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for text that is too short, including <c>{column}</c> and <c>{min}</c>. Default "{column} needs at least {min} characters.".</summary>
    public string GridEditMinLength { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for text that is too long, including <c>{column}</c> and <c>{max}</c>. Default "{column} allows at most {max} characters.".</summary>
    public string GridEditMaxLength { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for text that does not match the pattern, including <c>{column}</c>. Default "{column} does not have the expected format.".</summary>
    public string GridEditPattern { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for lookup text that matches no suggestion, including <c>{column}</c>. Default "Choose {column} from the list.".</summary>
    public string GridEditChoice { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a row the host reports as changed by someone else. Default "Someone else changed this row. Reload it and try again.".</summary>
    public string GridEditConflict { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a row whose save failed with <c>{error}</c>. Default "Not saved: {error}".</summary>
    public string GridEditRejected { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a row the host reports as not saved without a reason. Default "Not saved.".</summary>
    public string GridEditNotSaved { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the lookup's note when nothing matches. Default "No matches".</summary>
    public string GridEditNoMatches { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the lookup's note while it searches. Default "Searching…".</summary>
    public string GridEditSearching { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement after undo, including <c>{column}</c>. Default "Undone: {column}".</summary>
    public string GridEditUndone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement after redo, including <c>{column}</c>. Default "Redone: {column}".</summary>
    public string GridEditRedone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the empty choice of a select editor. Default "(none)".</summary>
    public string GridEditNone { get => Get(); set => Set(value); }
}
