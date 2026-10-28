namespace CanopyX.Html.Ui;

/// <summary>Preferred anchor placement; the runtime may flip or shift it.</summary>
public enum CanopyOverlayPlacement {
    /// <summary>Below the trigger, aligned to its inline start.</summary>
    BottomStart,
    /// <summary>Below the trigger, aligned to its inline end.</summary>
    BottomEnd,
    /// <summary>Above the trigger, centered.</summary>
    Top,
    /// <summary>Below the trigger, centered.</summary>
    Bottom,
    /// <summary>To the left of the trigger.</summary>
    Left,
    /// <summary>To the right of the trigger.</summary>
    Right,
}
