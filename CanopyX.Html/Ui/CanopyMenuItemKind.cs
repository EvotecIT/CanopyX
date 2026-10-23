namespace CanopyX.Html.Ui;

/// <summary>Semantic kind of a menu entry.</summary>
public enum CanopyMenuItemKind {
    /// <summary>An ordinary action or submenu.</summary>
    Action,
    /// <summary>A checkable menu item.</summary>
    Checkbox,
    /// <summary>An exclusive choice within its group.</summary>
    Radio,
    /// <summary>A separator with no action.</summary>
    Separator,
    /// <summary>A non-interactive group label.</summary>
    GroupLabel,
}
