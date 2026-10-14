// Writes the documentation's visuals with CanopyX: the output under each code snippet, the reference tables, the file
// layouts of the delivery modes, the protocol messages beside the grids they produce and the navigation thumbnails.
using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using CanopyX;
using CanopyX.Examples;
using CanopyX.Html;
using CanopyX.Rendering;

namespace SiteDemos.Docs;

/// <summary>Writes static/live/{assets,docs,thumbs}, themes/canopyx/partials/generated/{docs,thumbs} and data/docs.json.</summary>
internal sealed class SiteDocs {
    private const string Usings = "using CanopyX;\nusing CanopyX.Html;\n\n";
    private const string RenderingUsings = "using CanopyX.Rendering;\n\n";
    private readonly string _website;
    private readonly string _assets;
    private readonly string _liveDocs;
    private readonly string _liveThumbs;
    private readonly string _partialDocs;
    private readonly string _partialThumbs;
    private readonly UTF8Encoding _utf8;
    private readonly Dictionary<string, string> _snippets;
    private readonly SortedDictionary<string, object> _examples = new(StringComparer.Ordinal);
    private readonly SortedDictionary<string, object> _thumbs = new(StringComparer.Ordinal);
    private readonly List<object> _modes = new();
    private CanopyTreeView? _remote;

    private SiteDocs(string website, UTF8Encoding utf8) {
        _website = website;
        _utf8 = utf8;
        var live = Path.Combine(website, "static", "live");
        var generated = Path.Combine(website, "themes", "canopyx", "partials", "generated");
        _assets = Path.Combine(live, "assets");
        _liveDocs = Path.Combine(live, "docs");
        _liveThumbs = Path.Combine(live, "thumbs");
        _partialDocs = Path.Combine(generated, "docs");
        _partialThumbs = Path.Combine(generated, "thumbs");
        foreach (var directory in new[] { _assets, _liveDocs, _liveThumbs, _partialDocs, _partialThumbs }) {
            if (Directory.Exists(directory) && directory.StartsWith(generated, StringComparison.Ordinal)) {
                Directory.Delete(directory, recursive: true);
            }

            Directory.CreateDirectory(directory);
        }

        _snippets = Snippets.Read(Path.Combine(website, "tools", "SiteDemos", "Docs", "DocsSnippets.cs"));
    }

    /// <summary>Writes every documentation visual.</summary>
    /// <returns>A one-line summary for the console.</returns>
    internal static string Write(string website, UTF8Encoding utf8) {
        var docs = new SiteDocs(website, utf8);
        var shares = ExampleViews.FileShares("shares", new SyntheticFileTree().Build(shares: 3, departments: 4, projects: 3, minFiles: 3, maxFiles: 9, longListFiles: 5));
        docs.GettingStarted();
        docs.JavaScript();
        var devices = docs.Reporting();
        docs.EmailAndPrint(shares, devices);
        var layout = docs.Delivery();
        docs.Protocol();
        docs.ExplorerLayout();
        docs.Thumbnails(shares, devices, layout);
        docs.Bars();

        var manifest = new SortedDictionary<string, object>(StringComparer.Ordinal) {
            ["generatedBy"] = "Website/tools/SiteDemos",
            ["examples"] = docs._examples,
            ["modes"] = docs._modes,
            ["thumbs"] = docs._thumbs
        };
        File.WriteAllText(Path.Combine(website, "data", "docs.json"),
            JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }) + "\n", utf8);
        return string.Create(CultureInfo.InvariantCulture, $"Docs: {docs._examples.Count} examples, {docs._thumbs.Count} thumbnails.");
    }

    private void GettingStarted() {
        var files = DocsSnippets.ProjectFiles();
        Live(files, "tree");
        Example("tree", "Program.cs", "csharp", Usings + _snippets["tree"] + "\n\nfiles.SaveHtmlPage(\"files.html\");",
            Output.Frame("tree", "files.html", Count(files) + " nodes, tree runtime", 300));

        var inventory = DocsSnippets.Inventory();
        Live(inventory, "grid");
        Example("grid", "Program.cs", "csharp", Usings + _snippets["grid"] + "\n\ninventory.SaveHtmlPage(\"inventory.html\");",
            Output.Frame("grid", "inventory.html", inventory.Rows.Count + " rows, grid runtime", 300));

        var (tree, grid) = DocsSnippets.StaticTables(files, inventory);
        Partial("static", "<div class=\"cnx-paper\">" + tree + "</div><div class=\"cnx-paper\">" + grid + "</div>");
        Example("static", "Report.cs", "csharp", RenderingUsings + _snippets["static"],
            Output.Static("static", "treeTable, inventoryTable", "Script-free HTML, " + Kb(tree.Length + grid.Length)));
    }

    private void JavaScript() {
        var source = File.ReadAllText(Path.Combine(_website, "tools", "SiteDemos", "Docs", "mount.js")).Replace("\r\n", "\n").TrimEnd();
        WriteMountPage(source);
        Example("js-mount", "files.js", "javascript", source, Output.Frame("js-mount", "createTreeGrid(host, { view })", "Mounted from the classic script", 300));

        var polish = DocsSnippets.Polish(DocsSnippets.ProjectFiles());
        Live(polish, "labels");
        Example("labels", "Program.cs", "csharp", _snippets["labels"] + "\nfiles.SaveHtmlPage(\"pliki.html\");",
            Output.Frame("labels", "pliki.html", "Polish labels", 300));

        var runtimes = Reference("runtimes", "npm entry points", new[] { "Import", "Use it for", "Stylesheet" }, new[] {
            new[] { "@evotecit/canopyx", "Interactive tree grids", "@evotecit/canopyx/styles.css" },
            new[] { "@evotecit/canopyx/grid", "Flat data grids", "@evotecit/canopyx/grid.css" },
            new[] { "@evotecit/canopyx/reporting", "Flat grids with reporting controls", "@evotecit/canopyx/reporting.css" }
        }, mono: true);
        Partial("runtimes", Paper(CanopyStaticHtml.RenderGrid(runtimes, options: Themed(10))));
    }

    private CanopyDataGridView Reporting() {
        var devices = DocsSnippets.Devices();
        Live(devices, "reporting");
        Example("reporting", "Report.cs", "csharp", Usings + _snippets["reporting"] + "\n\ndevices.SaveHtmlPage(\"devices.html\");",
            Output.Frame("reporting", "devices.html", devices.Rows.Count + " rows, reporting runtime", 470));
        return devices;
    }

    private void EmailAndPrint(CanopyTreeView shares, CanopyDataGridView devices) {
        var outline = DocsSnippets.Outline(shares);
        Partial("static-outline", "<div class=\"cnx-paper\">" + outline + "</div>");
        Example("static-outline", "Mail.cs", "csharp", RenderingUsings + _snippets["static-outline"],
            Output.Static("static-outline", "html", "Script-free HTML, " + Kb(outline.Length)));

        var dark = DocsSnippets.DarkOutline(shares);
        Partial("static-dark", "<div class=\"cnx-paper cnx-paper--dark\">" + dark + "</div>");
        Example("static-dark", "Mail.cs", "csharp", RenderingUsings + _snippets["static-dark"],
            Output.Static("static-dark", "html", "Dark literals, " + Kb(dark.Length)));

        var themed = DocsSnippets.ThemedGrid(devices);
        Partial("static-themed", "<div class=\"cnx-paper cnx-paper--themed\">" + themed + "</div>");
        Example("static-themed", "Page.cs", "csharp", RenderingUsings + _snippets["static-themed"],
            Output.Static("static-themed", "html", "Follows this page's theme"));
    }

    /// <summary>Writes the three delivery modes into a temporary folder and draws what each one produced.</summary>
    private CanopyTreeView Delivery() {
        var scratch = Path.Combine(Path.GetTempPath(), "canopyx-site-delivery-" + Guid.NewGuid().ToString("N"));
        var previous = Environment.CurrentDirectory;
        CanopyTreeView bundleLayout;
        try {
            var tree = new SyntheticFileTree().Build(shares: 2, departments: 3, projects: 3, minFiles: 6, maxFiles: 16, longListFiles: 600);
            var files = ExampleViews.FileShares("files", tree);

            var single = Directory.CreateDirectory(Path.Combine(scratch, "single")).FullName;
            Environment.CurrentDirectory = single;
            DocsSnippets.Single(files);
            Mode("single", "Single HTML file", "deliver-single", single, "report/", _ => true,
                "One page with the runtime and the data inline. Attach it, archive it or open it from disk.");

            var bundle = Directory.CreateDirectory(Path.Combine(scratch, "bundle")).FullName;
            Environment.CurrentDirectory = bundle;
            DocsSnippets.Bundle(files);
            bundleLayout = Mode("bundle", "Sidecar bundle", "deliver-bundle", Path.Combine(bundle, "file-report"), "file-report/",
                path => path is "assets" or "data" || path.Count(c => c == '/') == 1 || path.EndsWith("/r", StringComparison.Ordinal),
                "A page plus data and search files next to it. Branches and search shards load as the reader opens them, with no server.");

            var hosted = Directory.CreateDirectory(Path.Combine(scratch, "hosted")).FullName;
            Environment.CurrentDirectory = hosted;
            _remote = DocsSnippets.Hosted();
            Mode("hosted", "Hosted data", "deliver-hosted", hosted, "wwwroot/", _ => true,
                "Your application serves the page and answers children, search and counts requests with canopyx/2 documents.",
                Endpoints(_remote));
        } finally {
            Environment.CurrentDirectory = previous;
            if (Directory.Exists(scratch)) {
                Directory.Delete(scratch, recursive: true);
            }
        }

        return bundleLayout;
    }

    private CanopyTreeView Mode(string id, string title, string snippet, string directory, string label, Func<string, bool> expand, string body, CanopyNode? extra = null) {
        var view = FileLayout.Build("layout-" + id, label, directory, expand, maxFiles: 3);
        if (extra != null) {
            view.Roots.Add(extra);
        }

        var root = view.Roots[0];
        var html = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { MaxRows = 40, OnlyExpanded = true, UseThemeVariables = true, Caption = string.Empty });
        Partial("layout-" + id, html);
        var code = Usings + _snippets[snippet];
        _modes.Add(new {
            id, title, body, code, file = "Program.cs", lang = "csharp",
            files = root.Data["files"], size = root.Cells["size"].Text, partial = "generated/docs/layout-" + id
        });
        return view;
    }

    /// <summary>The endpoints a hosted view calls, as rows next to the files the host serves.</summary>
    private static CanopyNode Endpoints(CanopyTreeView remote) {
        var source = JsonNode.Parse(remote.ToJson())!["source"]!;
        var app = new CanopyNode("app", "Your endpoints") { Kind = "folder", Expanded = true };
        app.Badges.Add(new CanopyBadge("canopyx/2", CanopyTone.Success));
        foreach (var name in new[] { "children", "search", "counts" }) {
            var template = source[name]?.GetValue<string>();
            if (template == null) continue;
            var endpoint = new CanopyNode("api:" + name, "GET " + template.Split('?')[0]) { Kind = "endpoint" };
            endpoint.Cells["holds"] = name switch {
                "children" => "A page document of a node's children",
                "search" => "A search document of id paths",
                _ => "A counts document for loaded nodes"
            };
            app.Children.Add(endpoint);
        }

        return app;
    }

    private void Protocol() {
        // A view document and the tree it produces.
        var view = new CanopyTreeView("files", "Project files") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sizing = CanopyColumnSizing.Preferred(260) });
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Preferred(100) });
        var projects = new CanopyNode("projects", "Projects") { Expanded = true };
        var plan = new CanopyNode("plan", "Project plan.docx");
        plan.Cells["size"] = new CanopyCell(48128L) { Text = "47 KiB" };
        var report = new CanopyNode("report", "Quarterly report.pdf");
        report.Cells["size"] = new CanopyCell(2048L) { Text = "2 KiB", Tone = CanopyTone.Warning };
        report.Badges.Add(new CanopyBadge("new", CanopyTone.Info));
        projects.Children.Add(plan);
        projects.Children.Add(report);
        view.Roots.Add(projects);
        Live(view, "protocol-view");
        Example("protocol-view", "view.json", "json", Json.Format(view.ToJson()),
            Output.Frame("protocol-view", "type: view", "The tree it produces", 220));

        // A grid document and the table it produces.
        var grid = new CanopyDataGridView("sites", "Sites") { Noun = "sites" };
        grid.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        grid.Columns.Add(new CanopyColumn("devices", "Devices") { Kind = CanopyColumnKind.Number, Sortable = true });
        foreach (var (site, count) in new[] { ("Warsaw", 412L), ("London", 318L), ("Berlin", 270L) }) {
            var row = new CanopyGridRow(site.ToLowerInvariant());
            row.Cells["site"] = site;
            row.Cells["devices"] = count;
            grid.Rows.Add(row);
        }

        Live(grid, "protocol-grid");
        Example("protocol-grid", "grid.json", "json", Json.Format(grid.ToJson()),
            Output.Frame("protocol-grid", "type: grid", "The table it produces", 330));

        // A children page, written in C#, and the document it becomes.
        var page = DocsSnippets.ChildrenPage();
        Example("protocol-page", "Children.cs", "csharp", Usings.Split('\n')[0] + "\n\n" + _snippets["protocol-page"],
            Output.Json("page.json", Json.Format(page.ToJson())));

        // The remote source a hosted view declares.
        var source = JsonNode.Parse(_remote!.ToJson())!["source"]!.ToJsonString();
        Example("protocol-source", "view.json", "json", "\"source\": " + Json.Format(source), Output.None());

        // The documents of the protocol, read from the reference in docs/data-protocol.md.
        var rows = MarkdownTable(Path.Combine(_website, "..", "docs", "data-protocol.md"), "## Documents");
        var documents = Reference("documents", "canopyx/2 documents", new[] { "Type", "Written by", "Read when" }, rows, mono: true);
        Partial("documents", Paper(CanopyStaticHtml.RenderGrid(documents, options: Themed(20))));
    }

    /// <summary>The live file explorer's own files, explored with CanopyX, for the demos page.</summary>
    private void ExplorerLayout() {
        var folder = Path.Combine(_website, "static", "live", "files");
        var view = FileLayout.Build("explorer-files", "files/", folder, path => path == "data" || path.Count(c => c == '/') == 1, maxFiles: 1000);
        Live(view, "explorer-layout");
    }

    private void Thumbnails(CanopyTreeView shares, CanopyDataGridView devices, CanopyTreeView bundleLayout) {
        Image("demos", "/img/showcase-files", "The live file explorer");
        Image("inventory", "/img/showcase-inventory", "The device inventory reporting grid");
        Thumb("outline", CanopyStaticHtml.Render(shares, new CanopyStaticHtmlOptions { MaxRows = 9, MaxDepth = 3, UseThemeVariables = true, Caption = string.Empty }));

        var map = new CanopyTreeView("docs-map", "Documentation");
        map.Columns.Add(new CanopyColumn("name", "Topic"));
        map.Columns.Add(new CanopyColumn("out", "Output"));
        foreach (var (group, topics) in new[] {
            ("Start", new[] { ("Getting started", "Tree and grid"), ("JavaScript", "Mounted view") }),
            ("Build", new[] { ("Reporting grids", "Grouped grid"), ("Email and print", "Static table") }),
            ("Ship", new[] { ("Delivery modes", "File layouts"), ("Data protocol", "Messages") })
        }) {
            var node = new CanopyNode(group.ToLowerInvariant(), group) { Expanded = true, Group = true };
            foreach (var (title, output) in topics) {
                var topic = new CanopyNode(title.ToLowerInvariant().Replace(' ', '-'), title);
                topic.Cells["out"] = output;
                node.Children.Add(topic);
            }

            map.Roots.Add(node);
        }

        Thumb("docs", CanopyStaticHtml.Render(map, Themed(12)));
        Thumb("getting-started", CanopyStaticHtml.Render(DocsSnippets.ProjectFiles(), Themed(8)));
        var runtimes = Reference("thumb-runtimes", "Runtimes", new[] { "Import", "Use it for" }, new[] {
            new[] { "canopyx", "Tree grids" }, new[] { "canopyx/grid", "Data grids" }, new[] { "canopyx/reporting", "Reporting" }
        }, mono: true);
        Thumb("javascript", CanopyStaticHtml.RenderGrid(runtimes, options: Themed(6)));
        Thumb("reporting", CanopyStaticHtml.RenderGrid(devices, options: Themed(7)));
        Thumb("static-tables", CanopyStaticHtml.Render(shares, new CanopyStaticHtmlOptions { MaxRows = 8, MaxDepth = 2, Theme = CanopyStaticTheme.Dark(), Caption = string.Empty }), dark: true);
        Thumb("delivery", CanopyStaticHtml.Render(bundleLayout, new CanopyStaticHtmlOptions { MaxRows = 9, OnlyExpanded = true, UseThemeVariables = true, Caption = string.Empty }));
        var documents = Reference("thumb-documents", "Documents", new[] { "Type", "Read when" }, new[] {
            new[] { "view", "The page loads" }, new[] { "page", "A node opens" }, new[] { "search", "A search answers" },
            new[] { "counts", "Counts refresh" }, new[] { "grid", "A grid loads" }
        }, mono: true);
        Thumb("data-protocol", CanopyStaticHtml.RenderGrid(documents, options: Themed(6)));
        Thumb("authoring", CanopyStaticHtml.Render(Headings(Path.Combine(_website, "..", "docs", "authoring.md"), "Authoring reference"), Themed(9)));
    }

    /// <summary>The site's bar on every page that opens full screen, so leaving and returning to the site feels like one place.</summary>
    private void Bars() {
        var live = Path.Combine(_website, "static", "live");
        var demos = ("/demos/", "Live demos");
        LiveBar.Apply(Path.Combine(live, "files", "index.html"), "File explorer", demos, "/demos/#files", _utf8);
        LiveBar.Apply(Path.Combine(live, "inventory.html"), "Device inventory", demos, "/demos/#inventory", _utf8);
        LiveBar.Apply(Path.Combine(_liveDocs, "explorer-layout.html"), "The explorer's files", demos, "/demos/#files", _utf8);
        foreach (var (page, title, url, name) in new[] {
            ("tree", "Project files", "/docs/getting-started/", "Getting started"),
            ("grid", "Inventory", "/docs/getting-started/", "Getting started"),
            ("js-mount", "createTreeGrid", "/docs/javascript/", "JavaScript"),
            ("labels", "Polish labels", "/docs/javascript/", "JavaScript"),
            ("reporting", "Devices", "/docs/reporting/", "Reporting grids"),
            ("protocol-view", "A view document", "/docs/data-protocol/", "Data protocol"),
            ("protocol-grid", "A grid document", "/docs/data-protocol/", "Data protocol")
        }) {
            LiveBar.Apply(Path.Combine(_liveDocs, page + ".html"), title, (url, name), url, _utf8);
        }
    }

    private static CanopyStaticHtmlOptions Themed(int rows) => new() { MaxRows = rows, UseThemeVariables = true, Caption = string.Empty };

    private void Thumb(string id, string html, bool dark = false) {
        var fragment = "<div class=\"cnx-thumb__render" + (dark ? " cnx-thumb__render--dark" : string.Empty) + "\">" + html + "</div>";
        File.WriteAllText(Path.Combine(_liveThumbs, id + ".html"), fragment, _utf8);
        File.WriteAllText(Path.Combine(_partialThumbs, id + ".html"), fragment, _utf8);
        _thumbs[id] = new { kind = "html", src = "/live/thumbs/" + id + ".html", partial = "generated/thumbs/" + id, bytes = _utf8.GetByteCount(fragment) };
    }

    private void Image(string id, string basePath, string alt) {
        var fragment = "<img class=\"cnx-only-light\" src=\"" + basePath + "-light.png\" width=\"1440\" height=\"820\" alt=\"\" decoding=\"async\" />"
            + "<img class=\"cnx-only-dark\" src=\"" + basePath + "-dark.png\" width=\"1440\" height=\"820\" alt=\"\" decoding=\"async\" />";
        fragment = "<div class=\"cnx-thumb__shot\" title=\"" + alt + "\">" + fragment + "</div>";
        File.WriteAllText(Path.Combine(_liveThumbs, id + ".html"), fragment, _utf8);
        File.WriteAllText(Path.Combine(_partialThumbs, id + ".html"), fragment.Replace("decoding=\"async\"", "loading=\"lazy\" decoding=\"async\""), _utf8);
        _thumbs[id] = new { kind = "image", src = "/live/thumbs/" + id + ".html", partial = "generated/thumbs/" + id, bytes = _utf8.GetByteCount(fragment) };
    }

    /// <summary>The headings of a Markdown document as a tree: level 2 under the title, level 3 under level 2.</summary>
    private static CanopyTreeView Headings(string path, string label) {
        var view = new CanopyTreeView("headings", label);
        view.Columns.Add(new CanopyColumn("name", "Section"));
        CanopyNode? section = null;
        var index = 0;
        foreach (var line in File.ReadLines(path)) {
            if (line.StartsWith("## ", StringComparison.Ordinal)) {
                section = new CanopyNode("h" + index++, line[3..].Trim()) { Expanded = view.Roots.Count < 2 };
                view.Roots.Add(section);
            } else if (line.StartsWith("### ", StringComparison.Ordinal) && section != null) {
                section.Children.Add(new CanopyNode("h" + index++, line[4..].Trim()));
            }
        }

        return view;
    }

    /// <summary>Reads the Markdown table that follows a heading, without its code marks.</summary>
    private static string[][] MarkdownTable(string path, string heading) {
        var rows = new List<string[]>();
        var inSection = false;
        foreach (var line in File.ReadLines(path)) {
            if (line.StartsWith("## ", StringComparison.Ordinal)) {
                inSection = line.Trim() == heading;
                continue;
            }

            if (!inSection || !line.StartsWith('|') || line.StartsWith("| ---", StringComparison.Ordinal)) continue;
            var cells = line.Trim('|').Split('|').Select(cell => cell.Trim().Replace("`", string.Empty, StringComparison.Ordinal)).ToArray();
            rows.Add(cells);
        }

        if (rows.Count < 2) throw new InvalidOperationException("No table follows " + heading + " in " + path + ".");
        return rows.Skip(1).ToArray();
    }

    /// <summary>A reference table as a CanopyX grid, so the site's tables come from the static renderer too.</summary>
    private static CanopyDataGridView Reference(string id, string label, string[] columns, string[][] rows, bool mono) {
        var view = new CanopyDataGridView(id, label);
        for (var i = 0; i < columns.Length; i++) {
            var column = new CanopyColumn("c" + i, columns[i]);
            if (i == 0 && mono) column.Presenter = CanopyGridPresenter.Identifier(mono: true);
            view.Columns.Add(column);
        }

        for (var r = 0; r < rows.Length; r++) {
            var row = new CanopyGridRow("r" + r);
            for (var i = 0; i < columns.Length; i++) {
                row.Cells["c" + i] = i < rows[r].Length ? rows[r][i] : string.Empty;
            }

            view.Rows.Add(row);
        }

        return view;
    }

    private void Live(CanopyTreeView view, string name) {
        CanopyHtmlAssets.WriteTo(_assets, CanopyAssetNaming.ContentHash, CanopyHtmlAssets.GetRuntime(view));
        view.SaveHtmlPage(Path.Combine(_liveDocs, name + ".html"), LiveOptions(view.Label));
    }

    private void Live(CanopyDataGridView view, string name) {
        CanopyHtmlAssets.WriteTo(_assets, CanopyAssetNaming.ContentHash, CanopyHtmlAssets.GetRuntime(view));
        view.SaveHtmlPage(Path.Combine(_liveDocs, name + ".html"), LiveOptions(view.Label));
    }

    private static CanopyHtmlOptions LiveOptions(string title) =>
        new() { AssetMode = CanopyAssetMode.External, AssetBaseUrl = "../assets/", Theme = CanopyTheme.Auto, Title = title };

    /// <summary>The JavaScript snippet running from the classic script: the same code after its two imports.</summary>
    private void WriteMountPage(string source) {
        CanopyHtmlAssets.WriteTo(_assets, CanopyAssetNaming.ContentHash, CanopyRuntime.TreeGrid);
        var body = string.Join("\n", source.Split('\n').Where(line => !line.StartsWith("import ", StringComparison.Ordinal))).Trim();
        var page = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
            + "<meta name=\"color-scheme\" content=\"light dark\">\n<title>createTreeGrid</title>\n"
            + "<link rel=\"stylesheet\" href=\"../assets/" + CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.ContentHash, CanopyRuntime.TreeGrid) + "\">\n"
            + "<script src=\"../assets/" + CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, CanopyRuntime.TreeGrid) + "\"></script>\n"
            + "</head>\n<body class=\"cx-page\">\n<main class=\"cx-main\">\n<h1 class=\"cx-sr-only\">createTreeGrid</h1>\n"
            + "<div id=\"files\" style=\"height: 360px\"></div>\n</main>\n"
            + "<script type=\"module\">\n// The snippet on canopyx.dev/docs/javascript/, with the classic script's global in place of its imports.\n"
            + "const { createTreeGrid } = window.CanopyX;\n" + body + "\n</script>\n</body>\n</html>\n";
        File.WriteAllText(Path.Combine(_liveDocs, "js-mount.html"), page, _utf8);
    }

    private void Example(string id, string file, string lang, string code, object output) =>
        _examples[id] = new { file, lang, code = code.Replace("\r\n", "\n").TrimEnd(), output };

    private void Partial(string id, string html) => File.WriteAllText(Path.Combine(_partialDocs, id + ".html"), html, _utf8);

    private static string Paper(string html) => "<div class=\"cnx-paper cnx-paper--themed\">" + html + "</div>";

    private static string Kb(int chars) => (chars / 1024.0).ToString("0.0", CultureInfo.InvariantCulture) + " KB";

    private static int Count(CanopyTreeView view) {
        var total = 0;
        var stack = new Stack<CanopyNode>(view.Roots);
        while (stack.Count > 0) {
            var node = stack.Pop();
            total++;
            foreach (var child in node.Children) stack.Push(child);
        }

        return total;
    }

    /// <summary>The output shown under a snippet.</summary>
    private static class Output {
        internal static object Frame(string id, string label, string meta, int height) =>
            new { kind = "live", src = "/live/docs/" + id + ".html", label, meta, height };

        internal static object Static(string id, string label, string meta) =>
            new { kind = "static", partial = "generated/docs/" + id, label, meta };

        internal static object Json(string label, string json) => new { kind = "json", label, code = json };

        internal static object None() => new { kind = "none" };
    }
}
