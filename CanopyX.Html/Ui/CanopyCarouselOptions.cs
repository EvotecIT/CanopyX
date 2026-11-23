namespace CanopyX.Html.Ui;

/// <summary>Typed carousel options. Change callbacks are registered by the host in JavaScript.</summary>
public sealed class CanopyCarouselOptions {
    /// <summary>Gets or sets how many slides show at once, 1 to 6. Narrow screens show one. Default 1.</summary>
    public int PerView { get; set; } = 1;
    /// <summary>Gets or sets whether moving past the last slide returns to the first.</summary>
    public bool Loop { get; set; }
    /// <summary>Gets or sets the zero-based slide shown first.</summary>
    public int SelectedIndex { get; set; }
    /// <summary>Gets or sets the time each slide shows before the next, in milliseconds. Null (the default) never moves slides by itself.</summary>
    /// <remarks>Autoplay shows a Pause button, pauses while the pointer or focus is on the carousel, stops once the reader chooses a slide and stays off under reduced motion.</remarks>
    public int? AutoplayInterval { get; set; }
    /// <summary>Gets or sets how slides change. <see cref="CanopyCarouselTransition.Fade"/> needs <see cref="PerView"/> 1.</summary>
    public CanopyCarouselTransition Transition { get; set; }
    /// <summary>Gets or sets where the Previous and Next buttons sit.</summary>
    public CanopyCarouselControlPosition Controls { get; set; }
    /// <summary>Gets or sets where the slide picker sits, or hides it.</summary>
    public CanopyCarouselIndicatorPosition Indicators { get; set; }
    /// <summary>Gets or sets where slide captions (<see cref="CanopyCarouselSlide.Caption"/>) show.</summary>
    public CanopyCarouselCaptionPosition Captions { get; set; }
}
