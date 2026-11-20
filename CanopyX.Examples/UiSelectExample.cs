using CanopyX.Html;
using CanopyX.Html.Ui;

namespace CanopyX.Examples;

/// <summary>A settings form with searchable selects: a country with flags, owners as chips, and labels the reader creates.</summary>
internal static class UiSelectExample {
    internal static void Write(string output) {
        var country = new CanopySelect("country", "country", "Country", new CanopySelectOptions { Placeholder = "Choose a country" });
        foreach (var (code, name, group, capital) in new[] { ("PL", "Poland", "Europe", "Warsaw"), ("DE", "Germany", "Europe", "Berlin"), ("FR", "France", "Europe", "Paris"),
            ("US", "United States", "Americas", "Washington"), ("BR", "Brazil", "Americas", "Brasília"), ("JP", "Japan", "Asia", "Tokyo") })
            country.Items.Add(new CanopySelectOption(code.ToLowerInvariant(), name) { Flag = code, Group = group, Description = capital, Selected = code == "PL" });
        var owners = new CanopySelect("owners", "owners", "Owners", new CanopySelectOptions { Multiple = true, Max = 3, Placeholder = "Add owners" });
        foreach (var (id, name, role, tone) in new[] { ("ada", "Ada Lovelace", "Admin", CanopyTone.Danger), ("alan", "Alan Turing", "Operator", CanopyTone.Info), ("grace", "Grace Hopper", "Operator", CanopyTone.Info), ("linus", "Linus Torvalds", "Reader", CanopyTone.Neutral) })
            owners.Items.Add(new CanopySelectOption(id, name) { Badge = role, BadgeTone = tone, Description = id + "@example.com", Selected = id == "ada" });
        var labels = new CanopySelect("labels", "labels", "Labels", new CanopySelectOptions { Multiple = true, Tags = true, Placeholder = "Type a label" });
        foreach (var label in new[] { "production", "staging", "critical" }) labels.Items.Add(new CanopySelectOption(label, label));
        var body = "<main class=\"page\"><p class=\"eyebrow\">Standalone UI</p><h1>Select</h1><p>Search, chips, tags and flags over native selects that still submit with the form.</p>" +
            "<form class=\"card\" id=\"settings\">" + country.ToHtmlFragment() + owners.ToHtmlFragment() + labels.ToHtmlFragment() +
            "<p><button type=\"submit\">Show the answers</button></p><output id=\"answers\" role=\"status\"></output></form></main>";
        var parts = string.Concat(new[] { "ui-overlays", "ui-select" }.Select(name => CanopyHtmlAssets.GetPart(name).Markup));
        var page = "<!doctype html><html lang=\"en\" data-theme=\"light\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
            "<title>Select · CanopyX</title>" + CanopyHtmlAssets.FontHead() + "<style>" + CanopyHtmlAssets.GetStyle(CanopyRuntime.Ui) + "</style><style>" + UiPrimitivesExample.ApplyTokenFallbacks(Style) +
            "</style></head><body>" + body + parts + "<script>" + CanopyHtmlAssets.GetScript(CanopyRuntime.Ui) + "</script><script>" + Script + "</script></body></html>";
        Directory.CreateDirectory(output);
        File.WriteAllText(Path.Combine(output, "ui-select.html"), page);
    }

    private const string Style = """
        body { margin:0;background:var(--hfx-color-surface-page);color:var(--hfx-color-text);font-family:var(--hfx-font-sans,system-ui,sans-serif); }
        .page { max-inline-size:40rem;margin-inline:auto;padding:var(--hfx-space-6) var(--hfx-space-4); }
        .eyebrow { margin:0;color:var(--hfx-color-accent-text);font-size:var(--hfx-type-caption-size);font-weight:var(--hfx-weight-semibold);text-transform:uppercase; }
        .card { display:grid;gap:var(--hfx-space-2);padding:var(--hfx-card-padding-y) var(--hfx-card-padding-x);border:var(--hfx-border-width) solid var(--hfx-color-border);border-radius:var(--hfx-radius-container);background:var(--hfx-color-surface); }
        .card label { margin-block-start:var(--hfx-space-2);font-weight:var(--hfx-weight-medium); }
        button[type=submit] { min-block-size:var(--hfx-control-height-md);padding:0 var(--hfx-control-padding-x);border:var(--hfx-border-width) solid var(--hfx-color-accent);border-radius:var(--hfx-radius-control);color:var(--hfx-color-accent-contrast);background:var(--hfx-color-accent);font:inherit; }
        """;

    private const string Script = """
        document.getElementById('settings').addEventListener('submit', event => {
          event.preventDefault();
          const data = new FormData(event.target);
          document.getElementById('answers').textContent = ['country', 'owners', 'labels'].map(name => name + ': ' + (data.getAll(name).join(', ') || '—')).join(' · ');
        });
        """;
}
