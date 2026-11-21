namespace CanopyX.Html.Ui;

/// <summary>The HTTP method a dialog action submits its form with.</summary>
public enum CanopyDialogSubmitMethod {
    /// <summary>POST, for actions that change something.</summary>
    Post,
    /// <summary>GET, for actions that only navigate.</summary>
    Get
}
