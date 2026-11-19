using CanopyX.Html.Ui;

namespace CanopyX.Tests.Html;

/// <summary>Markup, escaping and validation of the carousel and rating builders.</summary>
public sealed class UiMediaBuilderTests {
    [Fact]
    public void Carousel_WritesANamedSectionOfSlidesThatReadsWithoutTheRuntime() {
        var carousel = new CanopyCarousel("news", "Release <notes>", new CanopyCarouselOptions { PerView = 2, Loop = true, SelectedIndex = 1, AutoplayInterval = 6000 });
        carousel.Slides.Add(new CanopyCarouselSlide("<h3>One</h3>"));
        carousel.Slides.Add(new CanopyCarouselSlide("<h3>Two</h3>") { Label = "Second \"note\"" });
        var html = carousel.ToHtmlFragment();
        Assert.Equal("<section id=\"news\" class=\"cx-carousel\" data-cx-carousel data-cx-part=\"carousel\" aria-label=\"Release &lt;notes&gt;\" data-per-view=\"2\" data-loop=\"true\" data-selected=\"1\" data-autoplay-interval=\"6000\">" +
            "<div class=\"cx-carousel-viewport\" data-cx-part=\"viewport\"><div class=\"cx-carousel-track\" data-cx-part=\"track\"><div class=\"cx-carousel-slide\"><h3>One</h3></div>" +
            "<div class=\"cx-carousel-slide\" data-label=\"Second &quot;note&quot;\"><h3>Two</h3></div></div></div></section>", html);
        Assert.DoesNotContain("data-autoplay", new CanopyCarousel("plain", "Plain") { Slides = { new CanopyCarouselSlide("x") } }.ToHtmlFragment());
    }

    [Fact]
    public void Carousel_RefusesWhatTheRuntimeCouldNotHonor() {
        Assert.Throws<ArgumentException>(() => new CanopyCarousel("c", "C").ToHtmlFragment());
        Assert.Throws<ArgumentException>(() => new CanopyCarousel("c", " "));
        foreach (var options in new[] { new CanopyCarouselOptions { PerView = 7 }, new CanopyCarouselOptions { SelectedIndex = 3 }, new CanopyCarouselOptions { AutoplayInterval = 0 } }) {
            var carousel = new CanopyCarousel("c", "C", options) { Slides = { new CanopyCarouselSlide("a"), new CanopyCarouselSlide("b") } };
            Assert.Throws<ArgumentOutOfRangeException>(() => carousel.ToHtmlFragment());
        }
    }

    [Fact]
    public void Rating_IsARadioGroupThatSubmitsWithAForm() {
        var html = new CanopyRating("quality", "quality", "Service <quality>", new CanopyRatingOptions { Max = 3, Value = 2, Required = true, Labels = CanopyLabels.Polish() }).ToHtmlFragment();
        Assert.Equal("<fieldset id=\"quality\" class=\"cx-rating\" data-cx-rating data-cx-part=\"rating\" data-max=\"3\" data-clearable=\"false\"><legend>Service &lt;quality&gt;</legend><span class=\"cx-rating-options\">" +
            "<label class=\"cx-rating-option\"><input type=\"radio\" name=\"quality\" value=\"1\" required><span class=\"cx-rating-text\">1 z 3</span></label>" +
            "<label class=\"cx-rating-option\"><input type=\"radio\" name=\"quality\" value=\"2\" checked><span class=\"cx-rating-text\">2 z 3</span></label>" +
            "<label class=\"cx-rating-option\"><input type=\"radio\" name=\"quality\" value=\"3\"><span class=\"cx-rating-text\">3 z 3</span></label></span></fieldset>", html);
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRating("r", "r", "R", new CanopyRatingOptions { Max = 11 }).ToHtmlFragment());
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRating("r", "r", "R", new CanopyRatingOptions { Value = 6 }).ToHtmlFragment());
    }

    [Fact]
    public void RatingDisplay_ReadsAsWordsAndShowsStarsWithoutAStylesheet() {
        Assert.Equal("<span class=\"cx-rating-display\" role=\"img\" aria-label=\"3.5 of 5\"><span class=\"cx-rating-on\" aria-hidden=\"true\">★★★★</span><span class=\"cx-rating-off\" aria-hidden=\"true\">☆</span></span>",
            CanopyRating.Display(3.5));
        Assert.Contains("aria-label=\"0 of 4\"", CanopyRating.Display(0, 4));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRating.Display(6));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRating.Display(double.NaN));
    }
}
