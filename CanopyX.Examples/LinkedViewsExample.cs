using System.Globalization;
using System.Reflection;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Linked views (docs/linked-views.md): a site picker filters a flat grid and a host-sourced grid and highlights a tree, and
/// the grid's selection marks the picker. The page is one file: the fragments carry the link part through
/// <see cref="CanopyHtmlOptions.Parts"/>, once for the document.
/// </summary>
internal static class LinkedViewsExample {
    private static readonly string[] Sites = { "Warsaw", "Berlin", "Madrid", "Lisbon" };
    private static readonly string[] Statuses = { "Healthy", "Degraded", "Down" };
    private static readonly string[] Teams = { "Platform", "Payments", "Identity", "Search" };
    private static readonly string[] Services = { "api-gateway", "auth", "billing", "catalog", "checkout", "images", "mail", "orders", "search", "sessions" };

    internal static void Write(string output) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.linked-views.html")!;
        using var reader = new StreamReader(stream);
        var template = reader.ReadToEnd();
        using var css = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.examples.css")!;
        using var cssReader = new StreamReader(css);
        var exampleStyle = cssReader.ReadToEnd();
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var document = new CanopyHtmlDocument();
            CanopyHtmlOptions Options(string height) {
                var options = new CanopyHtmlOptions { Theme = theme, Height = height, Document = document };
                options.Parts.Add("link");
                return options;
            }
            var page = template.Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.ReportingGrid))
                .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.ReportingGrid))
                .Replace("{{example-style}}", exampleStyle)
                .Replace("{{grid}}", Grid().ToHtmlFragment(Options("360px")))
                .Replace("{{tree}}", Tree().ToHtmlFragment(Options("360px")))
                .Replace("{{remote}}", Remote().ToHtmlFragment(Options("260px")));
            File.WriteAllText(Path.Combine(output, "linked-views" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"), page);
        }
    }

    private static string Id(int index) => "svc-" + index.ToString("D2", CultureInfo.InvariantCulture);
    private static readonly int[] SitePattern = { 0, 1, 0, 2, 0, 1, 3, 0, 1, 2 };
    private static string Site(int index) => Sites[SitePattern[index % SitePattern.Length]];
    private static string Status(int index) => index % 9 == 4 ? Statuses[2] : index % 5 == 2 ? Statuses[1] : Statuses[0];
    private static string Name(int index) => Services[index % Services.Length] + "-" + (index / Services.Length + 1).ToString(CultureInfo.InvariantCulture);

    private static CanopyDataGridView Grid() {
        var grid = new CanopyDataGridView("linked-services", "Services") { Selection = CanopySelectionMode.Multiple, SelectOnClick = true, PageSize = 100, Noun = "services" };
        grid.Columns.Add(new CanopyColumn("name", "Service") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(170) });
        grid.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(110) });
        grid.Columns.Add(new CanopyColumn("status", "Status") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(110) });
        grid.Columns.Add(new CanopyColumn("latency", "Latency (ms)") { Kind = CanopyColumnKind.Number, Sortable = true, Sizing = CanopyColumnSizing.Preferred(120) });
        grid.Columns.Add(new CanopyColumn("team", "Team") { Sortable = true, Sizing = CanopyColumnSizing.Flex(1, 100, 400, preferredWidth: 140) });
        for (var i = 0; i < 40; i++) {
            var row = new CanopyGridRow(Id(i));
            row.Cells["name"] = Name(i);
            row.Cells["site"] = Site(i);
            row.Cells["status"] = new CanopyCell(Status(i)) { Tone = Status(i) == "Down" ? CanopyTone.Danger : Status(i) == "Degraded" ? CanopyTone.Warning : CanopyTone.Success };
            row.Cells["latency"] = 20 + i * 37 % 180;
            row.Cells["team"] = Teams[i / 3 % Teams.Length];
            grid.Rows.Add(row);
        }
        return grid;
    }

    private static CanopyTreeView Tree() {
        var tree = new CanopyTreeView("linked-sites", "Sites and services") { Selection = CanopySelectionMode.Single };
        tree.Columns.Add(new CanopyColumn("name", "Name") { Sizing = CanopyColumnSizing.Preferred(220) });
        tree.Columns.Add(new CanopyColumn("site", "Site") { Sizing = CanopyColumnSizing.Preferred(110) });
        tree.Columns.Add(new CanopyColumn("status", "Status") { Sizing = CanopyColumnSizing.Preferred(110) });
        for (var s = 0; s < Sites.Length; s++) {
            var site = new CanopyNode("site-" + Sites[s].ToLowerInvariant(), Sites[s]) { Expanded = s == 0 };
            site.Cells["site"] = Sites[s];
            for (var i = 0; i < 40; i++) {
                if (Site(i) != Sites[s]) continue;
                var service = new CanopyNode(Id(i), Name(i));
                service.Cells["site"] = Sites[s];
                service.Cells["status"] = Status(i);
                site.Children.Add(service);
            }
            tree.Roots.Add(site);
        }
        return tree;
    }

    private static CanopyDataGridView Remote() {
        var grid = new CanopyDataGridView("linked-incidents", "Incidents") {
            Source = CanopyGridSource.HostedOffset(), PageSize = 50, Noun = "incidents"
        };
        grid.Columns.Add(new CanopyColumn("title", "Incident") { Sortable = true, Sizing = CanopyColumnSizing.Flex(1, 160, 600, preferredWidth: 260) });
        grid.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(110) });
        grid.Columns.Add(new CanopyColumn("opened", "Opened") { Kind = CanopyColumnKind.DateTime, Sortable = true, Sizing = CanopyColumnSizing.Preferred(170) });
        return grid;
    }
}
