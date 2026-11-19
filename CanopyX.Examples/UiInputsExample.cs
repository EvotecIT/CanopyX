using CanopyX.Html;
using CanopyX.Html.Ui;

namespace CanopyX.Examples;

/// <summary>A page with live input masks and a signature pad with colours and downloads.</summary>
internal static class UiInputsExample {
    internal static void Write(string output) {
        var body = "<main class=\"page\"><p class=\"eyebrow\">Standalone UI</p><h1>Masks and signatures</h1><p>Separators appear as you type; the pad draws, types and saves.</p>" +
            "<form class=\"card\" id=\"device\"><h2>Device</h2>" +
            new CanopyMaskedInput("ip", "ip", "Management address", "ipv4") { Placeholder = "192.168.1.10" }.ToHtmlFragment() +
            new CanopyMaskedInput("mac", "mac", "MAC address", "mac") { Placeholder = "00:1A:2B:3C:4D:5E" }.ToHtmlFragment() +
            new CanopyMaskedInput("asset", "asset", "Asset tag", "AAA-0000") { Placeholder = "ABC-1234" }.ToHtmlFragment() +
            new CanopyMaskedInput("window", "window", "Maintenance starts", "time") { Placeholder = "22:00" }.ToHtmlFragment() +
            "<h2>Approval</h2>" + new CanopySignature("approval", "Signature of the change owner", new CanopySignatureOptions { Name = "signature", Colours = true, DownloadName = "approval" }).ToHtmlFragment() +
            "<p><button type=\"submit\">Show the answers</button></p><output id=\"answers\" role=\"status\"></output></form></main>";
        var parts = string.Concat(new[] { "ui-overlays", "ui-mask", "ui-signature" }.Select(name => CanopyHtmlAssets.GetPart(name).Markup));
        var page = "<!doctype html><html lang=\"en\" data-theme=\"light\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
            "<title>Masks and signatures · CanopyX</title>" + CanopyHtmlAssets.FontHead() + "<style>" + CanopyHtmlAssets.GetStyle(CanopyRuntime.Ui) + "</style><style>" +
            UiPrimitivesExample.ApplyTokenFallbacks(Style) + "</style></head><body>" + body + parts + "<script>" + CanopyHtmlAssets.GetScript(CanopyRuntime.Ui) + "</script><script>" + Script + "</script></body></html>";
        Directory.CreateDirectory(output);
        File.WriteAllText(Path.Combine(output, "ui-inputs.html"), page);
    }

    private const string Style = """
        body { margin:0;background:var(--hfx-color-surface-page);color:var(--hfx-color-text);font-family:var(--hfx-font-sans,system-ui,sans-serif); }
        .page { max-inline-size:40rem;margin-inline:auto;padding:var(--hfx-space-6) var(--hfx-space-4); }
        .eyebrow { margin:0;color:var(--hfx-color-accent-text);font-size:var(--hfx-type-caption-size);font-weight:var(--hfx-weight-semibold);text-transform:uppercase; }
        .card { display:grid;gap:var(--hfx-space-2);padding:var(--hfx-card-padding-y) var(--hfx-card-padding-x);border:var(--hfx-border-width) solid var(--hfx-color-border);border-radius:var(--hfx-radius-container);background:var(--hfx-color-surface); }
        .card h2 { margin-block:var(--hfx-space-3) 0;font-size:var(--hfx-type-heading-size); }
        .card label { font-weight:var(--hfx-weight-medium); }
        .card input[type=text] { min-block-size:var(--hfx-control-height-md);padding:0 var(--hfx-space-2);border:var(--hfx-border-width) solid var(--hfx-color-border-control);border-radius:var(--hfx-radius-control);background:var(--hfx-color-surface);color:var(--hfx-color-text);font:inherit; }
        .card button { min-block-size:var(--hfx-control-height-md);padding:0 var(--hfx-control-padding-x);border:var(--hfx-border-width) solid var(--hfx-color-border-strong);border-radius:var(--hfx-radius-control);background:var(--hfx-color-surface);color:var(--hfx-color-text);font:inherit; }
        :focus-visible { outline:var(--hfx-focus-width) solid var(--hfx-color-focus-ring);outline-offset:var(--hfx-focus-offset); }
        """;

    private const string Script = """
        document.getElementById('device').addEventListener('submit', event => {
          event.preventDefault();
          const data = new FormData(event.target);
          document.getElementById('answers').textContent = ['ip', 'mac', 'asset', 'window'].map(name => name + ': ' + (data.get(name) || '—')).join(' · ') +
            ' · signature: ' + (data.get('signature') ? 'signed' : '—');
        });
        """;
}
