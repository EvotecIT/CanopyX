# Rating

A rating asks for, or shows, a score in stars: service feedback, the quality of a vendor, how easy a setup was. The input is
a native radio group drawn as stars, so the arrow keys, form submission and reading without the runtime come from the
browser. The same rating is a [flow field](flow.md#fields) and a read-only [grid cell presenter](authoring.md). The control
ships in the lazy `ui-rating` part, which needs `ui-overlays`.

## Write a rating input from .NET

```csharp
using CanopyX.Html.Ui;

var setup = new CanopyRating("setup", "setup", "How easy was the setup?", new CanopyRatingOptions {
    Max = 5,          // 2 to 10 stars
    Value = 4,        // or null for no answer
    Required = false  // a required rating keeps its answer and marks the group required
});
string fragment = setup.ToHtmlFragment();
```

The radio buttons submit under `Name` with values 1 to `Max`. `Clearable` (the default) lets the reader go back to no answer
by choosing the current star again or pressing Delete; a required rating cannot be cleared. `Labels` names each star in the
page language ("4 of 5" from `RatingValue`).

## Show a rating

`CanopyRating.Display(4.3, 5)` writes read-only stars for a report, a card or an email: the value rounded to whole filled
stars (★) and empty ones (☆), with the exact value in words for screen readers. It needs no stylesheet or runtime.

In a grid, `CanopyGridPresenter.Rating(maximum: 5)` shows the stars in a numeric column, reads as "4.3 / 5", and keeps the
number for sorting, filtering and exports. In a flow, `step.Rating("quality", "Overall quality", f => f.Scale(5))` asks for one.

## Control it from JavaScript

```javascript
const setup = CanopyX.rating('#setup', { onChange: value => save(value) });
await setup.ready;
setup.select(5);
setup.getState();   // { value: 5, max: 5 }
setup.clear();
```

An empty element gets its radio group: `CanopyX.rating('#stars', { max: 3, name: 'stars', label: 'Ease of setup' })`. The root
fires `cx-rating:change` with `{ value, source }` and an `input` event for forms; `value` is null after a clear.

## Accessibility and phones

Each star is a radio button named "3 of 5", so screen readers hear the group's label, the position and the choice. Hovering
with a mouse previews the stars without choosing. Below 40rem the stars grow to a touch-sized target. Forced colours keep the
chosen stars distinct. The built-in locale packs translate `ratingValue` (the control) and `flowRatingValue` (the flow field).
