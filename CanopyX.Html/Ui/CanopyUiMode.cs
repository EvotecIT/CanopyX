namespace CanopyX.Html.Ui;

/// <summary>Rendering mode for step content.</summary>
public enum CanopyUiMode {
    /// <summary>Declares an interactive view; content stays readable until the runtime is ready.</summary>
    Interactive,
    /// <summary>Shows every content section with a heading, without step navigation.</summary>
    Report,
    /// <summary>Shows a display-only step progress header.</summary>
    Static,
}
