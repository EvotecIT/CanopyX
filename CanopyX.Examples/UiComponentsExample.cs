using System.Text;
using CanopyX.Html;
using CanopyX.Html.Ui;

namespace CanopyX.Examples;

/// <summary>A standalone page of notification, gallery and media components built with the typed .NET builders.</summary>
/// <remarks>Everything the page needs is inline (the runtime, its stylesheet, the UI parts and the images), so it works from
/// a file share or an email attachment, as a static report does.</remarks>
internal static class UiComponentsExample {
    internal static void Write(string output) {
        var body = new StringBuilder();
        body.Append("<main class=\"page\"><header><p class=\"eyebrow\">Standalone UI</p><h1>Notifications and media</h1>");
        body.Append("<p>Toasts for what a page or a server reports, and a gallery whose items open in a viewer. Every part works offline.</p></header>");
        Notifications(body);
        Gallery(body);
        body.Append("</main>");
        var parts = string.Concat(CanopyHtmlAssets.GetParts(CanopyRuntime.Ui).Select(part => part.Markup));
        var page = "<!doctype html><html lang=\"en\" data-theme=\"light\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
            "<title>Notifications and media · CanopyX</title>" + CanopyHtmlAssets.FontHead() + "<style>" + CanopyHtmlAssets.GetStyle(CanopyRuntime.Ui) + "</style><style>" + UiPrimitivesExample.ApplyTokenFallbacks(PageStyle) + "</style></head><body>" +
            body + parts + "<script>" + CanopyHtmlAssets.GetScript(CanopyRuntime.Ui) + "</script><script>" + PageScript + "</script></body></html>";
        Directory.CreateDirectory(output);
        File.WriteAllText(Path.Combine(output, "ui-components.html"), page);
    }

    private static void Notifications(StringBuilder body) {
        // The region opens with the notices a report wants the reader to see; script adds more as things happen.
        var region = new CanopyToasts("notices", new CanopyToastsOptions { Position = CanopyToastPosition.BottomEnd, Max = 3, Timeout = 6000 });
        region.Items.Add(new CanopyToast("Collected 1,204 accounts from 3 domains.") { Id = "collected", Title = "Report ready", Tone = CanopyTone.Success });
        body.Append("<section class=\"card\" aria-labelledby=\"toasts-title\"><h2 id=\"toasts-title\">Toasts</h2>");
        body.Append("<p>Hover or focus a toast to pause its timeout. Errors and toasts with actions stay until dismissed; Escape dismisses the focused toast.</p>");
        body.Append("<div class=\"actions\"><button type=\"button\" data-toast=\"info\">Information</button><button type=\"button\" data-toast=\"success\">Success</button>");
        body.Append("<button type=\"button\" data-toast=\"warning\">Warning</button><button type=\"button\" data-toast=\"danger\">Error</button>");
        body.Append("<button type=\"button\" data-toast=\"undo\">With an action</button><button type=\"button\" data-toast=\"progress\">Server progress</button>");
        body.Append("<button type=\"button\" data-toast=\"clear\">Clear all</button></div><p class=\"log\" id=\"toast-log\" role=\"status\"></p></section>");
        body.Append(region.ToHtmlFragment());
    }

    private static void Gallery(StringBuilder body) {
        var gallery = new CanopyGallery("photos");
        var shots = new[] { ("Rack A", "#3b6ea8", "Rack A after the move"), ("Rack B", "#2f8a5b", "Rack B cabling"), ("Cooling", "#a8603b", "Cooling unit, east wall"),
            ("Patch panel", "#6b4fa8", "Patch panel 3") };
        foreach (var (name, colour, caption) in shots)
            gallery.Items.Add(new CanopyGalleryItem(Image(name, colour, 1600, 1000), name) { ThumbnailHref = Image(name, colour, 320, 200), Caption = caption, Width = 320, Height = 200 });
        gallery.Items.Add(new CanopyGalleryItem("inventory", "Inventory summary") { Type = CanopyGalleryItemType.Content, Caption = "Inventory summary",
            ContentHtml = "<h3>Inventory summary</h3><ul><li>12 servers</li><li>4 switches</li><li>2 cooling units</li></ul>" });
        body.Append("<section class=\"card\" aria-labelledby=\"gallery-title\"><h2 id=\"gallery-title\">Gallery and lightbox</h2>");
        body.Append("<p>Open a picture, then use the arrow keys, Home and End, + and − to zoom, 0 to fit and Escape to close. A swipe moves between items on a phone.</p>");
        body.Append(gallery.ToHtmlFragment()).Append("</section>");
    }

    // A labelled picture as an inline SVG, so the example needs no image files.
    private static string Image(string label, string colour, int width, int height) =>
        "data:image/svg+xml," + Uri.EscapeDataString("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + width + "\" height=\"" + height + "\" viewBox=\"0 0 160 100\">" +
            "<rect width=\"160\" height=\"100\" fill=\"" + colour + "\"/><text x=\"80\" y=\"55\" fill=\"#fff\" font-family=\"sans-serif\" font-size=\"12\" text-anchor=\"middle\">" + label + "</text></svg>");

    private const string PageStyle = """
        body { margin:0;background:var(--hfx-color-surface-page);color:var(--hfx-color-text);font-family:var(--hfx-font-sans,system-ui,sans-serif); }
        .page { max-inline-size:72rem;margin-inline:auto;padding:var(--hfx-space-6) var(--hfx-space-4); }
        .eyebrow { margin:0;color:var(--hfx-color-accent-text);font-size:var(--hfx-type-caption-size);font-weight:var(--hfx-weight-semibold);text-transform:uppercase; }
        h1 { margin-block:var(--hfx-space-2); }
        .card { margin-block:var(--hfx-space-5);padding:var(--hfx-card-padding-y) var(--hfx-card-padding-x);border:var(--hfx-border-width) solid var(--hfx-color-border);border-radius:var(--hfx-radius-container);background:var(--hfx-color-surface); }
        .card h2 { margin-block-start:0; }
        .actions { display:flex;flex-wrap:wrap;gap:var(--hfx-space-2); }
        .actions button { min-block-size:var(--hfx-control-height-md);padding:0 var(--hfx-control-padding-x);border:var(--hfx-border-width) solid var(--hfx-color-border-strong);border-radius:var(--hfx-radius-control);background:var(--hfx-color-surface);color:var(--hfx-color-text);font:inherit;cursor:pointer; }
        .actions button:hover { background:var(--hfx-color-hover); }
        :focus-visible { outline:var(--hfx-focus-width) solid var(--hfx-color-focus-ring);outline-offset:var(--hfx-focus-offset); }
        .log { min-block-size:1.5em;color:var(--hfx-color-text-secondary); }
        """;

    // Host code: the buttons call CanopyX.notify, as a page would after a save or when a server pushes a message.
    private const string PageScript = """
        (() => {
          const log = text => { document.getElementById('toast-log').textContent = text; };
          const samples = {
            info: { title: 'Scan scheduled', message: 'The next scan starts at 02:00.' },
            success: { tone: 'success', title: 'Saved', message: 'Service settings were stored.' },
            warning: { tone: 'warning', title: 'Certificate expires soon', message: 'mail.contoso.example expires in 12 days.' },
            danger: { tone: 'danger', title: 'Sync failed', message: 'The domain controller did not answer.' },
            undo: { tone: 'neutral', message: 'Rule deleted.', actions: [{ id: 'undo', label: 'Undo', onSelect: () => log('Rule restored.') }] }
          };
          document.addEventListener('click', event => {
            const button = event.target.closest('[data-toast]');
            if (!button) return;
            const kind = button.dataset.toast;
            if (kind === 'clear') { CanopyX.toasts('#notices').clear(); log('All toasts cleared.'); return; }
            if (kind === 'progress') {
              // A server push: the same id updates one toast instead of stacking new ones.
              CanopyX.notify({ id: 'sync', title: 'Sync', message: 'Reading 3 domains…', timeout: 0 });
              setTimeout(() => CanopyX.notify({ id: 'sync', tone: 'success', title: 'Sync', message: 'Finished: 1,204 accounts.' }), 1500);
              return;
            }
            CanopyX.notify(samples[kind]).then(id => log('Shown: ' + id));
          });
          document.addEventListener('cx-toasts:close', event => log('Closed ' + event.detail.id + ' (' + event.detail.reason + ').'));
        })();
        """;
}
