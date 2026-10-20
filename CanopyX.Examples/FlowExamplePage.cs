using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Writes a flow example page in the light and dark palettes: the flow written by <see cref="CanopyFlow.ToHtmlPage"/> with the
/// flow entry point, a page around it, and a mock host that answers the proposal and shows what it received. The mock host
/// prints the submitted document as JSON, so the page itself proves that secrets never travel in it (docs/flow.md).
/// </summary>
internal static class FlowExamplePage {
    private const string HostScript = """
<section class="flow-received" aria-labelledby="flow-received-title">
<h2 id="flow-received-title">What the host received</h2>
<pre id="flow-received" tabindex="0">Nothing yet. Submit the flow to see its proposal.</pre>
</section>
<script>
(() => {
  // The page's mock host: it shows the proposal, reads each secret once through the accessor, and answers after a moment.
  const received = document.getElementById("flow-received");
  window.flowAnswer = window.flowAnswer || (() => ({ status: "saved", message: "The settings were saved." }));
  document.addEventListener("canopyx:flowSubmit", event => {
    const detail = event.detail, secrets = Object.keys(detail.secrets).filter(id => detail.secrets[id].state === "set");
    const lengths = secrets.map(id => id + ": received once, " + (detail.secret(id) || "").length + " characters, not shown");
    received.textContent = JSON.stringify(detail, null, 2) + (lengths.length ? "\n\n" + lengths.join("\n") : "");
    event.detail.respondWith(new Promise(resolve => setTimeout(() => resolve(window.flowAnswer(detail)), 500)));
  });
})();
</script>
""";

    internal static void Write(string output, string name, CanopyFlow flow, string title, string? script = null, int width = 960,
        CanopyLabels? labels = null, string language = "en", CanopyTextDirection direction = CanopyTextDirection.Auto, bool dark = true, IEnumerable<string>? parts = null) {
        if (labels != null) flow.Labels = labels;
        foreach (var theme in dark ? new[] { CanopyTheme.Light, CanopyTheme.Dark } : new[] { CanopyTheme.Light }) {
            var options = new CanopyHtmlOptions { Title = title, Theme = theme, Language = language, Direction = direction };
            foreach (var part in parts ?? Enumerable.Empty<string>()) options.Parts.Add(part);
            var page = flow.ToHtmlPage(options);
            File.WriteAllText(Path.Combine(output, name + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"), Inject(page, theme, width, script));
        }
    }

    // The page around the flow: a quiet background, the flow centred at a readable width, and the received proposal below it.
    private static string Inject(string page, CanopyTheme theme, int width, string? script) {
        var dark = theme == CanopyTheme.Dark;
        var style = "<style>\nbody.cx-page{margin:0;background:" + (dark ? "#0e1013" : "#f3f4f6") + ";color:" + (dark ? "#f2f3f5" : "#16181c") + ";font:14px/1.45 Calibri,Carlito,\"Segoe UI\",system-ui,sans-serif}\n" +
            ".cx-main{box-sizing:border-box;max-width:" + width.ToString(CultureInfo.InvariantCulture) + "px;margin:0 auto;padding:32px 16px 48px}\n" +
            ".flow-received{margin-top:24px}.flow-received h2{margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.7}\n" +
            ".flow-received pre{box-sizing:border-box;max-height:320px;margin:0;padding:12px 14px;overflow:auto;border:1px solid " + (dark ? "#272a30" : "#e2e4e7") + ";border-radius:8px;background:" + (dark ? "#16181c" : "#fff") + ";font:12.5px/1.5 \"IBM Plex Mono\",Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}\n" +
            ".flow-mock{display:flex;padding:8px 14px;border:1px solid " + (dark ? "#272a30" : "#e2e4e7") + ";border-radius:8px;background:" + (dark ? "#16181c" : "#fff") + ";flex-wrap:wrap;align-items:center;gap:6px 14px;margin:0 0 16px;font-size:13px}.flow-mock legend{float:left;margin-inline-end:6px;font-weight:600}.flow-mock label{display:inline-flex;gap:6px;align-items:center}\n" +
            "@media (max-width:640px){.cx-main{padding:16px 12px 32px}}\n</style>\n";
        return page.Replace("</head>", style + "</head>").Replace("</main>", (script ?? string.Empty) + HostScript + "</main>");
    }
}
