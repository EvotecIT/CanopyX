namespace CanopyX.Html.Ui;

/// <summary>What a typed dialog action does when it is chosen.</summary>
public enum CanopyDialogActionKind {
    /// <summary>Raises <c>cx-dialog:action</c>, then submits to the action's target or, without one, closes the dialog.</summary>
    Submit,
    /// <summary>Closes the dialog without an answer, as Escape does. Alert dialogs focus it first.</summary>
    Cancel
}
