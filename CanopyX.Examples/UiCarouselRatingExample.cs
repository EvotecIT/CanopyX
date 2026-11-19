using System.Text;
using CanopyX.Html;
using CanopyX.Html.Ui;

namespace CanopyX.Examples;

/// <summary>A page with a carousel, a rating input, a flow question with stars and a grid that shows ratings.</summary>
/// <remarks>The page uses the grid entry point, which carries the UI factories, flows and grids; everything is inline, so it works offline.</remarks>
internal static class UiCarouselRatingExample {
    internal static void Write(string output) {
        var body = new StringBuilder("<main class=\"page\"><header><p class=\"eyebrow\">Standalone UI</p><h1>Carousel and rating</h1>");
        body.Append("<p>Slides that move only when the reader asks, star ratings as a control, a flow question and a grid column.</p></header>");
        var carousel = new CanopyCarousel("highlights", "Release highlights", new CanopyCarouselOptions { PerView = 2 });
        foreach (var (title, text) in new[] { ("Faster sorting", "Large inline grids sort about ten times faster."), ("Copy details", "The record drawer copies a record as plain lines."),
            ("Filter counts", "Tree filter switches say how many nodes match."), ("Toasts", "Notifications queue, pause and announce themselves."), ("Ratings", "Stars as a control, a flow field and a grid column.") })
            carousel.Slides.Add(new CanopyCarouselSlide("<article class=\"slide\"><h3>" + title + "</h3><p>" + text + "</p></article>") { Label = title });
        body.Append("<section class=\"card\" aria-labelledby=\"carousel-title\"><h2 id=\"carousel-title\">Carousel</h2>");
        body.Append("<p>Use Previous and Next, the slide buttons, the arrow keys or a swipe. Nothing moves by itself.</p>").Append(carousel.ToHtmlFragment()).Append("</section>");

        body.Append("<section class=\"card\" aria-labelledby=\"rating-title\"><h2 id=\"rating-title\">Rating input</h2>");
        body.Append("<p>A radio group drawn as stars: arrow keys move, choosing the same star again or Delete clears it, and it submits with the form.</p><form id=\"feedback\">");
        body.Append(new CanopyRating("setup", "setup", "How easy was the setup?", new CanopyRatingOptions { Value = 4 }).ToHtmlFragment());
        body.Append("<p>Average this month: ").Append(CanopyRating.Display(4.3)).Append(" 4.3</p><output id=\"rating-log\" role=\"status\"></output></form></section>");

        var flow = new CanopyFlow("survey", "Service survey") { Submit = new CanopyFlowSubmit("Send feedback") };
        flow.Step("answers", "How did the migration go?", step => step
            .Rating("quality", "Overall quality", f => f.Required())
            .Rating("support", "Support response", f => f.Scale(4).Help("Four stars: answered within the hour."))
            .TextArea("notes", "Anything else?"));
        flow.Review(review => review.Declaration("Your answers go to the service owner."));
        body.Append("<section class=\"card\" aria-labelledby=\"flow-title\"><h2 id=\"flow-title\">Rating in a flow</h2>").Append(flow.ToHtmlFragment()).Append("</section>");

        var grid = new CanopyDataGridView("vendors", "Vendor reviews");
        grid.Columns.Add(new CanopyColumn("name", "Vendor"));
        grid.Columns.Add(new CanopyColumn("score", "Score") { Kind = CanopyColumnKind.Number, Presenter = CanopyGridPresenter.Rating() });
        grid.Columns.Add(new CanopyColumn("reviews", "Reviews") { Kind = CanopyColumnKind.Number });
        foreach (var (name, score, reviews) in new[] { ("Contoso", 4.6, 128), ("Fabrikam", 3.2, 41), ("Northwind", 4.0, 77), ("Tailspin", 2.4, 19) }) {
            var row = new CanopyGridRow(name.ToLowerInvariant());
            row.Cells["name"] = name; row.Cells["score"] = score; row.Cells["reviews"] = reviews;
            grid.Rows.Add(row);
        }
        body.Append("<section class=\"card\" aria-labelledby=\"grid-title\"><h2 id=\"grid-title\">Ratings in a grid</h2><div class=\"grid-host\">").Append(grid.ToHtmlFragment()).Append("</div></section></main>");

        var parts = string.Concat(new[] { "ui-overlays", "ui-carousel", "ui-rating" }.Select(name => CanopyHtmlAssets.GetPart(name).Markup));
        var page = "<!doctype html><html lang=\"en\" data-theme=\"light\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
            "<title>Carousel and rating · CanopyX</title>" + CanopyHtmlAssets.FontHead() + "<style>" + CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid) + "</style><style>" +
            UiPrimitivesExample.ApplyTokenFallbacks(PageStyle) + "</style></head><body>" + body + parts + "<script>" + CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid) +
            "</script><script>" + PageScript + "</script></body></html>";
        Directory.CreateDirectory(output);
        File.WriteAllText(Path.Combine(output, "ui-carousel-rating.html"), page);
    }

    private const string PageStyle = """
        body { margin:0;background:var(--hfx-color-surface-page);color:var(--hfx-color-text);font-family:var(--hfx-font-sans,system-ui,sans-serif); }
        .page { max-inline-size:72rem;margin-inline:auto;padding:var(--hfx-space-6) var(--hfx-space-4); }
        .eyebrow { margin:0;color:var(--hfx-color-accent-text);font-size:var(--hfx-type-caption-size);font-weight:var(--hfx-weight-semibold);text-transform:uppercase; }
        .card { margin-block:var(--hfx-space-5);padding:var(--hfx-card-padding-y) var(--hfx-card-padding-x);border:var(--hfx-border-width) solid var(--hfx-color-border);border-radius:var(--hfx-radius-container);background:var(--hfx-color-surface); }
        .card h2 { margin-block-start:0; }
        .slide { block-size:100%;padding:var(--hfx-space-4);border:var(--hfx-border-width) solid var(--hfx-color-border);border-radius:var(--hfx-radius-container);background:var(--hfx-color-surface-sunken); }
        .slide h3 { margin-block-start:0; }
        .grid-host { block-size:16rem; }
        """;

    private const string PageScript = """
        document.addEventListener('cx-rating:change', event => {
          document.getElementById('rating-log').textContent = event.detail.value === null ? 'No answer.' : 'Answer: ' + event.detail.value + ' of 5.';
        });
        document.addEventListener('canopyx:flowSubmit', event => event.detail.respondWith({ status: 'saved', message: 'Thank you for the feedback.' }));
        """;
}
