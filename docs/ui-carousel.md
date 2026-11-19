# Carousel

A carousel shows slides of any content (release notes, dashboard highlights, screenshots, cards) one or a few at a time.
Nothing moves by itself unless the host asks for it. It ships in the lazy `ui-carousel` part, which needs `ui-overlays`,
and works in static reports (`file://`, a nonce-based Content Security Policy, no CDN) as well as in live hosts.

## Write a carousel from .NET

```csharp
using CanopyX.Html.Ui;

var highlights = new CanopyCarousel("highlights", "Release highlights", new CanopyCarouselOptions { PerView = 2 });
highlights.Slides.Add(new CanopyCarouselSlide("<h3>Faster sorting</h3><p>Large grids sort ten times faster.</p>") { Label = "Faster sorting" });
highlights.Slides.Add(new CanopyCarouselSlide("<h3>Copy details</h3><p>The record drawer copies a record.</p>"));
string fragment = highlights.ToHtmlFragment();
```

Slide content is trusted host HTML. `Label` names a slide and its picker button; without it the slide reads as "Slide 2 of 5".
Without the runtime the slides read one after another under the carousel's name.

| Option | Meaning |
| --- | --- |
| `PerView` | Slides shown at once, 1 to 6. Below 40rem one shows. |
| `Loop` | Moving past the last slide returns to the first. |
| `SelectedIndex` | The slide shown first. |
| `AutoplayInterval` | Off (null) by default. Milliseconds between slides: the carousel gets a Pause button, pauses while the pointer or focus is on it, stops once the reader picks a slide, and stays still under reduced motion. |

## Control it from JavaScript

```javascript
const highlights = CanopyX.carousel('#highlights', { loop: true });
await highlights.ready;
highlights.select(2);
highlights.getState();   // { index: 2, total: 5, visible: 2, playing: false }
```

`next()`, `back()`, `play()`, `pause()` and `refresh()` (after the host changed the slides) complete the controller. The root
fires `cx-carousel:change` with `{ index, total, source }`, where the source is `button`, `picker`, `keyboard`, `swipe`,
`autoplay` or `api`. A host builds the same markup itself: a `[data-cx-carousel]` element with a `.cx-carousel-track` of slides,
optionally inside a `.cx-carousel-viewport`.

## Keys, swipes and accessibility

The carousel follows the WAI-ARIA carousel pattern. The root is a region with the role description "carousel", each slide a
group with the role description "slide" and its name. Previous, Next and one picker button per slide come first in the Tab
order; the picker marks the current slide with `aria-current`. Left and Right (mirrored in right-to-left pages), Home and End
move between slides when focus is on the controls or the track. Slides outside the view are `inert`, so Tab never reaches
hidden links.

The track is a scroll-snapped strip, so touch and trackpad swipes are the browser's own; the carousel settles on the slide
nearest the start. New slides are announced politely, except while autoplay runs, when announcements stop. Reduced motion
moves slides instantly and disables autoplay; the Play button then says why. Printing shows every slide.

The built-in locale packs translate `carouselRole`, `carouselSlideRole`, `carouselSlide`, `carouselPrevious`, `carouselNext`,
`carouselPicker` and `carouselMotionDisabled`; Play and Pause use `tabsPlay` and `tabsPause`.
