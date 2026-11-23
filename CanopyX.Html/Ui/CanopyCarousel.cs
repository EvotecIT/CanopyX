using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds a carousel of slides with any content (docs/ui-carousel.md).</summary>
/// <remarks>Hosts load the CanopyX UI stylesheet and runtime once per page. Without the runtime the slides read one after another
/// under the carousel's name. This builder emits no assets or executable code.</remarks>
[PowerForge.Fluent.Fluent]
public sealed class CanopyCarousel {
    /// <summary>Creates a carousel with a page-unique identity and a plain text name, such as "Release highlights".</summary>
    public CanopyCarousel(string id, string label, CanopyCarouselOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Label = UiHtml.Text(label, nameof(label));
        Options = options ?? new CanopyCarouselOptions();
    }

    /// <summary>Gets the root DOM identity.</summary>
    public string Id { get; }
    /// <summary>Gets the carousel's accessible name.</summary>
    public string Label { get; }
    /// <summary>Gets the slides in order.</summary>
    public IList<CanopyCarouselSlide> Slides { get; } = new List<CanopyCarouselSlide>();
    /// <summary>Gets the typed options.</summary>
    public CanopyCarouselOptions Options { get; }

    /// <summary>Renders the carousel with encoded names and trusted slide content.</summary>
    /// <exception cref="ArgumentException">There are no slides, or a slide is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException">An option is out of range.</exception>
    public string ToHtmlFragment() {
        if (Slides.Count == 0) throw new ArgumentException("A carousel requires at least one slide.");
        if (Options.PerView < 1 || Options.PerView > 6) throw new ArgumentOutOfRangeException(nameof(Options.PerView), "A carousel shows 1 to 6 slides at once.");
        UiHtml.Index(Options.SelectedIndex, Slides.Count);
        UiHtml.EnumValue(Options.Transition); UiHtml.EnumValue(Options.Controls); UiHtml.EnumValue(Options.Indicators); UiHtml.EnumValue(Options.Captions);
        if (Options.Transition == CanopyCarouselTransition.Fade && Options.PerView != 1) throw new ArgumentException("A fading carousel shows one slide at a time.");
        if (Options.AutoplayInterval <= 0) throw new ArgumentOutOfRangeException(nameof(Options.AutoplayInterval), "The interval must be positive milliseconds.");
        var html = new StringBuilder("<section");
        UiHtml.Attribute(html, "id", Id);
        html.Append(" class=\"cx-carousel\" data-cx-carousel data-cx-part=\"carousel\"");
        UiHtml.Attribute(html, "aria-label", Label);
        if (Options.PerView != 1) UiHtml.Attribute(html, "data-per-view", UiHtml.Number(Options.PerView));
        if (Options.Loop) UiHtml.Attribute(html, "data-loop", "true");
        if (Options.SelectedIndex != 0) UiHtml.Attribute(html, "data-selected", UiHtml.Number(Options.SelectedIndex));
        if (Options.AutoplayInterval != null) UiHtml.Attribute(html, "data-autoplay-interval", UiHtml.Number(Options.AutoplayInterval.Value));
        if (Options.Transition != CanopyCarouselTransition.Slide) UiHtml.Attribute(html, "data-transition", UiHtml.Token(Options.Transition));
        if (Options.Controls != CanopyCarouselControlPosition.Below) UiHtml.Attribute(html, "data-controls", UiHtml.Token(Options.Controls));
        if (Options.Indicators != CanopyCarouselIndicatorPosition.WithControls) UiHtml.Attribute(html, "data-indicators", UiHtml.Token(Options.Indicators));
        if (Options.Captions != CanopyCarouselCaptionPosition.Overlay) UiHtml.Attribute(html, "data-captions", UiHtml.Token(Options.Captions));
        html.Append("><div class=\"cx-carousel-viewport\" data-cx-part=\"viewport\"><div class=\"cx-carousel-track\" data-cx-part=\"track\">");
        foreach (var slide in Slides) {
            if (slide == null) throw new ArgumentException("Slides cannot contain null entries.");
            html.Append("<div class=\"cx-carousel-slide\"");
            if (slide.Label != null) UiHtml.Attribute(html, "data-label", UiHtml.Text(slide.Label, nameof(slide.Label)));
            html.Append('>').Append(slide.ContentHtml);
            if (slide.Caption != null) html.Append("<p class=\"cx-carousel-caption\">").Append(UiHtml.Encode(UiHtml.Text(slide.Caption, nameof(slide.Caption)))).Append("</p>");
            html.Append("</div>");
        }
        return html.Append("</div></div></section>").ToString();
    }
}
