namespace CanopyX.Html.Ui;

/// <summary>Where a carousel's slide picker (one button per slide) sits.</summary>
public enum CanopyCarouselIndicatorPosition {
    /// <summary>Between the Previous and Next buttons. The default.</summary>
    WithControls,
    /// <summary>On its own line above the slides.</summary>
    Above,
    /// <summary>On its own line under the slides.</summary>
    Below,
    /// <summary>Not shown; the buttons, keys and swipes still move between slides.</summary>
    Hidden
}
