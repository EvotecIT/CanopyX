// Writes the "build it yourself" code of each view: runs the C# snippets in ViewSnippets, writes a runnable page for each
// JavaScript snippet in Views/js, and lists every tab with its code and its page in data/viewcode.json.
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using CanopyX.Html;
using SiteDemos.Docs;

namespace SiteDemos.Views;

/// <summary>Writes static/live/snippets/&lt;view&gt;-&lt;lang&gt;.html and data/viewcode.json.</summary>
internal static class ViewCode {
    private const string Marker = "// view:";
    // The shown C# starts with the namespaces a reader needs; the regions in ViewSnippets.cs leave them out.
    private const string Usings = "using CanopyX;\nusing CanopyX.Html;\n\n";
    private const string EmailUsings = "using CanopyX;\nusing CanopyX.Rendering;\n\n";

    private static readonly (string Id, string Label, string Lang)[] Languages = {
        ("cs", "C#", "csharp"), ("fluent", "C# fluent", "csharp"), ("js", "JavaScript", "javascript")
    };

    /// <summary>The views in site order: the page title, the C# snippets by language and the runtime its JavaScript snippet needs.</summary>
    private static readonly (string View, string Title, Dictionary<string, Action> CSharp, CanopyRuntime? Js)[] Views = {
        ("files", "File explorer", new() { ["cs"] = ViewSnippets.Files }, CanopyRuntime.TreeGrid),
        ("inventory", "Device inventory", new() { ["cs"] = ViewSnippets.Inventory, ["fluent"] = ViewSnippets.InventoryFluent }, CanopyRuntime.ReportingGrid),
        ("calendar", "Operations calendar", new() { ["cs"] = ViewSnippets.Calendar, ["fluent"] = ViewSnippets.CalendarFluent }, CanopyRuntime.DataGrid),
        ("timeline", "Incidents by host", new() { ["cs"] = ViewSnippets.Timeline, ["fluent"] = ViewSnippets.TimelineFluent }, CanopyRuntime.DataGrid),
        ("matrix", "Services by server", new() { ["cs"] = ViewSnippets.Matrix }, CanopyRuntime.DataGrid),
        ("changes", "Change review", new() { ["cs"] = ViewSnippets.Changes }, CanopyRuntime.DataGrid),
        ("flow", "Service setup", new() { ["cs"] = ViewSnippets.Flow }, CanopyRuntime.Flow),
        // A static table has no browser renderer, so the email view has no JavaScript tab.
        ("email", "Email and print", new() { ["cs"] = () => ViewSnippets.Email() }, null)
    };

    /// <summary>Writes every snippet page and the manifest.</summary>
    /// <returns>A one-line summary for the console.</returns>
    internal static string Write(string website, UTF8Encoding utf8) {
        var tools = Path.Combine(website, "tools", "SiteDemos", "Views");
        var live = Path.Combine(website, "static", "live");
        var output = Path.Combine(live, "snippets");
        var assets = Path.Combine(live, "assets");
        Directory.CreateDirectory(output);
        var snippets = Read(Path.Combine(tools, "ViewSnippets.cs"));
        var manifest = new Dictionary<string, object>(StringComparer.Ordinal);
        var pages = 0;

        foreach (var (view, title, csharp, js) in Views) {
            var tabs = new List<object>();
            foreach (var (id, label, lang) in Languages) {
                string code;
                var page = Path.Combine(output, view + "-" + id + ".html");
                if (id == "js") {
                    if (js is not CanopyRuntime runtime) continue;
                    code = File.ReadAllText(Path.Combine(tools, "js", view + ".js")).Replace("\r\n", "\n").Trim();
                    CanopyHtmlAssets.WriteTo(assets, CanopyAssetNaming.ContentHash, runtime);
                    File.WriteAllText(page, JsPage(view, title, code, runtime), utf8);
                } else {
                    if (!csharp.TryGetValue(id, out var run)) continue;
                    code = (view == "email" ? EmailUsings : Usings) + (snippets.TryGetValue(view + "-" + id, out var text) ? text : throw new InvalidOperationException("ViewSnippets.cs has no " + view + "-" + id + " region."));
                    if (view == "email") {
                        File.WriteAllText(page, EmailPage(title, ViewSnippets.Email()), utf8);
                    } else {
                        RunIn(output, run, view + ".html", page);
                    }
                }

                Bar(page, title + " · " + label, view, utf8);
                tabs.Add(new { id, label, lang, code, run = "/live/snippets/" + view + "-" + id + ".html" });
                pages++;
            }

            manifest[view] = new { tabs };
        }

        File.WriteAllText(Path.Combine(website, "data", "viewcode.json"),
            JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }) + "\n", utf8);
        return "View code: " + pages + " snippet pages for " + manifest.Count + " views.";
    }

    /// <summary>Runs a snippet in the output folder, where its SaveHtmlPage call writes, and names the page after its language.</summary>
    private static void RunIn(string folder, Action run, string written, string page) {
        var previous = Environment.CurrentDirectory;
        try {
            Environment.CurrentDirectory = folder;
            run();
        } finally {
            Environment.CurrentDirectory = previous;
        }

        var source = Path.Combine(folder, written);
        if (!File.Exists(source)) throw new InvalidOperationException("The snippet for " + Path.GetFileName(page) + " did not write " + written + ".");
        File.Move(source, page, overwrite: true);
    }

    /// <summary>
    /// The JavaScript snippet running from the classic script: the code after its imports, with the runtime's global in their
    /// place. Parts the snippet's view needs load from the shared assets folder beside the entry point.
    /// </summary>
    private static string JsPage(string view, string title, string code, CanopyRuntime runtime) {
        var names = Regex.Matches(code, @"^import\s*\{([^}]*)\}\s*from", RegexOptions.Multiline)
            .SelectMany(match => match.Groups[1].Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)).Distinct().ToList();
        var body = string.Join("\n", code.Split('\n').Where(line => !line.StartsWith("import ", StringComparison.Ordinal))).Trim();
        var height = runtime == CanopyRuntime.Flow ? string.Empty : "#" + view + "{height:100vh}html:not(.cnx-framed) #" + view + "{height:calc(100vh - 48px)}";
        return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
            + "<meta name=\"color-scheme\" content=\"light dark\">\n<title>CanopyX " + title.ToLowerInvariant() + ", JavaScript</title>\n"
            + "<link rel=\"stylesheet\" href=\"../assets/" + CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.ContentHash, runtime) + "\">\n"
            + "<script src=\"../assets/" + CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, runtime) + "\"></script>\n"
            + "<style>body{margin:0}" + height + "</style>\n"
            + "</head>\n<body class=\"cx-page\">\n<main class=\"cx-main\">\n<h1 class=\"cx-sr-only\">" + title + "</h1>\n"
            + "<div id=\"" + view + "\"></div>\n</main>\n"
            + "<script type=\"module\">\n// The snippet shown on canopyx.dev, with the classic script's global in place of its imports.\n"
            + "const { " + string.Join(", ", names) + " } = window.CanopyX;\n" + body + "\n</script>\n</body>\n</html>\n";
    }

    /// <summary>A static table on a plain page, as a mail client would show it.</summary>
    private static string EmailPage(string title, string html) =>
        "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        + "<title>CanopyX " + title.ToLowerInvariant() + "</title>\n</head>\n"
        + "<body class=\"cx-page\" style=\"margin:0;padding:16px;background:#ffffff;font-family:Calibri,Arial,sans-serif\">\n" + html + "\n</body>\n</html>\n";

    /// <summary>The site's slim bar when the page opens full screen; pages without a CanopyX body keep their own chrome.</summary>
    private static void Bar(string page, string title, string view, UTF8Encoding utf8) {
        if (!File.ReadAllText(page).Contains("<body class=\"cx-page\">", StringComparison.Ordinal)) return;
        LiveBar.Apply(page, title, ("/views/", "Views"), "/views/" + view + "/", utf8);
    }

    /// <summary>Reads the regions between "// view:begin id" and "// view:end", without their indentation; regions of one id join with a blank line.</summary>
    private static Dictionary<string, string> Read(string path) {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        string? id = null;
        var lines = new List<string>();
        foreach (var line in File.ReadAllLines(path)) {
            var trimmed = line.Trim();
            if (trimmed.StartsWith(Marker + "begin ", StringComparison.Ordinal)) {
                id = trimmed[(Marker.Length + "begin ".Length)..].Trim();
                lines.Clear();
            } else if (trimmed == Marker + "end" && id != null) {
                var text = Dedent(lines);
                result[id] = result.TryGetValue(id, out var earlier) ? earlier + "\n\n" + text : text;
                id = null;
            } else if (id != null) {
                lines.Add(line);
            }
        }

        if (id != null) throw new InvalidOperationException("Snippet " + id + " in " + path + " has no end marker.");
        return result;
    }

    private static string Dedent(List<string> lines) {
        var indent = lines.Where(line => line.Trim().Length > 0).Select(line => line.Length - line.TrimStart().Length).DefaultIfEmpty(0).Min();
        return string.Join("\n", lines.Select(line => line.Length >= indent ? line[indent..] : line.TrimStart())).Trim('\n');
    }
}
