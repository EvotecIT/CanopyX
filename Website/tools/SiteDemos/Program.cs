// Writes the canopyx.dev demos with CanopyX itself.
// Usage: dotnet run --project Website/tools/SiteDemos -c Release -- <Website directory>
// Writes static/live/*, data/demos.json and the generated partials of the canopyx theme.
using System.Globalization;
using System.Text;
using System.Text.Json;
using CanopyX;
using CanopyX.Examples;
using CanopyX.Html;
using CanopyX.Rendering;

var website = Path.GetFullPath(args.Length > 0 ? args[0] : "Website");
var demos = Path.Combine(website, "static", "live");
var partials = Path.Combine(website, "themes", "canopyx", "partials", "generated");
if (Directory.Exists(demos)) {
    Directory.Delete(demos, recursive: true);
}

Directory.CreateDirectory(demos);
Directory.CreateDirectory(partials);
var utf8 = new UTF8Encoding(false);

// File explorer: the large file-share tree from the examples, written as a sidecar bundle that loads branches on demand.
var fileTree = new SyntheticFileTree();
var fileRoots = fileTree.Build(shares: 26, departments: 8, projects: 10, minFiles: 10, maxFiles: 40, longListFiles: 3_000);
// Open the first department and its first project so the explorer starts on files with owners, states and history.
fileRoots[0].Children[0].Expanded = true;
fileRoots[0].Children[0].Children[0].Expanded = true;
var files = ExampleViews.FileShares("files", fileRoots);
var bundle = files.SaveHtmlBundle(Path.Combine(demos, "files"),
    new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Title = "CanopyX file explorer", Theme = CanopyTheme.Auto });

// Device inventory: a reporting grid with grouping, aggregates, facets and visual history presenters.
var inventory = DeviceInventory.Create(1_200);
File.WriteAllText(Path.Combine(demos, "inventory.html"),
    inventory.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX device inventory", Theme = CanopyTheme.Auto }), utf8);

// Email and print: the script-free outline of a smaller tree, following the page's theme variables.
var outlineTree = new SyntheticFileTree();
var outline = ExampleViews.FileShares("files-outline", outlineTree.Build(shares: 3, departments: 4, projects: 3, minFiles: 3, maxFiles: 9, longListFiles: 5));
File.WriteAllText(Path.Combine(partials, "outline.html"),
    CanopyStaticHtml.Render(outline, new CanopyStaticHtmlOptions { MaxRows = 40, MaxDepth = 4, UseThemeVariables = true }), utf8);

// The feature comparison on the home page, rendered by the same static grid renderer.
File.WriteAllText(Path.Combine(partials, "features.html"),
    CanopyStaticHtml.RenderGrid(FeatureTable.Create(), options: new CanopyStaticHtmlOptions { MaxRows = 50, UseThemeVariables = true }), utf8);

var manifest = new {
    generatedBy = "Website/tools/SiteDemos",
    files = new {
        nodes = bundle.NodeCount.ToString("N0", CultureInfo.InvariantCulture),
        dataFiles = bundle.FileCount.ToString("N0", CultureInfo.InvariantCulture),
        size = (bundle.TotalBytes / 1048576.0).ToString("0.0", CultureInfo.InvariantCulture) + " MB",
        largestFile = Math.Ceiling(bundle.LargestFileBytes / 1024.0).ToString("0", CultureInfo.InvariantCulture) + " KB"
    },
    inventory = new { rows = inventory.Rows.Count.ToString("N0", CultureInfo.InvariantCulture) }
};
File.WriteAllText(Path.Combine(website, "data", "demos.json"),
    JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }) + "\n", utf8);

Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
    $"Bundle: {bundle.NodeCount:N0} nodes in {bundle.FileCount:N0} files, {bundle.TotalBytes / 1048576.0:N1} MB. Inventory: {inventory.Rows.Count:N0} rows."));

/// <summary>A deterministic device inventory with the kind of data an endpoint report carries.</summary>
internal static class DeviceInventory {
    private static readonly string[] Sites = { "Warsaw", "London", "Berlin", "Madrid", "Remote" };
    private static readonly string[] Codes = { "WAW", "LON", "BER", "MAD", "REM" };
    private static readonly string[] Systems = { "Windows 11 24H2", "Windows 11 23H2", "Windows 10 22H2", "Windows Server 2025", "Windows Server 2022" };
    private static readonly string[] Owners = { "anna.kowalska", "ben.okafor", "chen.wei", "dana.levi", "erik.lund", "fatima.zahra", "goran.petrov", "hana.sato" };
    private static readonly DateTime Now = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);

    internal static CanopyDataGridView Create(int count) {
        var view = new CanopyDataGridView("devices", "Device inventory") {
            Selection = CanopySelectionMode.Multiple, StatusBar = true, Noun = "devices", PageSize = 100,
            Presentation = CanopyGridPresentation.Continuous, StateKey = "canopyx-site-devices",
            Reporting = new CanopyGridReporting {
                Grouping = new CanopyGridGrouping("site"), HeaderFilters = true, FilterGroups = true,
                SelectionControls = true, Responsive = true
            }
        };
        view.Columns.Add(new CanopyColumn("device", "Device") {
            Sizing = CanopyColumnSizing.Preferred(200, 160, 320), Sortable = true, Pinned = CanopyGridColumnPin.Left,
            AlwaysVisible = true, ResponsivePriority = 0, Presenter = CanopyGridPresenter.Identifier(mono: true)
        });
        view.Columns.Add(new CanopyColumn("site", "Site") { Sizing = CanopyColumnSizing.Preferred(110), Sortable = true, ResponsivePriority = 2 });
        view.Columns.Add(new CanopyColumn("os", "Operating system") { Sizing = CanopyColumnSizing.Preferred(180), Sortable = true, ResponsivePriority = 4 });
        view.Columns.Add(new CanopyColumn("health", "Health, 14 days") { Sizing = CanopyColumnSizing.Preferred(170), ResponsivePriority = 1, Presenter = CanopyGridPresenter.StatusStrip() });
        view.Columns.Add(new CanopyColumn("patch", "Patch level") {
            Sizing = CanopyColumnSizing.Preferred(150), Kind = CanopyColumnKind.Number, Sortable = true, ResponsivePriority = 3,
            Presenter = CanopyGridPresenter.Progress()
        });
        view.Columns.Add(new CanopyColumn("signins", "Sign-ins, 14 days") {
            Sizing = CanopyColumnSizing.Preferred(160), Kind = CanopyColumnKind.Number, Sortable = true, ResponsivePriority = 5,
            Presenter = CanopyGridPresenter.SparklineBars(minimum: 0, maximum: 12)
        });
        view.Columns.Add(new CanopyColumn("encrypted", "Encrypted") { Sizing = CanopyColumnSizing.Preferred(110), Sortable = true, ResponsivePriority = 6, Presenter = CanopyGridPresenter.Boolean() });
        view.Columns.Add(new CanopyColumn("seen", "Last seen") { Sizing = CanopyColumnSizing.Preferred(170), Kind = CanopyColumnKind.DateTime, Sortable = true, ResponsivePriority = 7 });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Sizing = CanopyColumnSizing.Preferred(140), Sortable = true, ResponsivePriority = 8 });
        view.GetColumn("device").Ordering = new CanopyGridOrdering(CanopyGridTextOrder.FoldedNatural);
        view.Reporting.FacetColumns.Add("site");
        view.Reporting.FacetColumns.Add("os");
        view.Reporting.FacetColumns.Add("encrypted");
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("patch-average", "patch", CanopyGridAggregateOperation.Average, "Average patch level"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("patch-minimum", "patch", CanopyGridAggregateOperation.Minimum, "Lowest patch level"));

        var random = new Lcg(20261012);
        for (var i = 0; i < count; i++) {
            var site = (int)(random.Next() * Sites.Length);
            var server = random.Next() < 0.12;
            var name = (server ? "SRV-" : "WS-") + Codes[site] + "-" + (i + 1).ToString("D4", CultureInfo.InvariantCulture);
            var row = new CanopyGridRow(name.ToLowerInvariant());
            row.Cells["device"] = new CanopyCell(name) { Secondary = name.ToLowerInvariant() + ".corp.example" };
            row.Cells["site"] = Sites[site];
            row.Cells["os"] = Systems[server ? 3 + (int)(random.Next() * 2) : (int)(random.Next() * 3)];
            var patch = Math.Round(55 + random.Next() * 45);
            row.Cells["patch"] = new CanopyCell(patch) { Text = patch.ToString("0", CultureInfo.InvariantCulture) + "%" };
            row.Cells["health"] = Health(random, patch);
            row.Cells["signins"] = SignIns(random, server);
            row.Cells["encrypted"] = random.Next() > 0.08;
            row.Cells["seen"] = Now.AddMinutes(-(int)(random.Next() * 60 * 24 * 21));
            row.Cells["owner"] = server ? new CanopyCell() { Text = "service", Tone = CanopyTone.Muted } : new CanopyCell(Owners[(int)(random.Next() * Owners.Length)]);
            view.Rows.Add(row);
        }

        return view;
    }

    private static CanopyCell Health(Lcg random, double patch) {
        var failing = patch < 65 ? 0.25 : 0.03;
        var warning = patch < 80 ? 0.2 : 0.05;
        var periods = new List<CanopyCellPeriod>();
        var current = "Healthy";
        var currentTone = CanopyTone.Success;
        for (var day = 13; day >= 0; day--) {
            var roll = random.Next();
            (current, currentTone) = roll < failing ? ("Failing", CanopyTone.Danger) : roll < failing + warning ? ("Warning", CanopyTone.Warning) : ("Healthy", CanopyTone.Success);
            periods.Add(new CanopyCellPeriod(Now.AddDays(-day).ToString("MMM d", CultureInfo.InvariantCulture), state: current, tone: currentTone));
        }

        var cell = new CanopyCell(current) { Tone = currentTone };
        foreach (var period in periods) {
            cell.Series.Add(period);
        }

        return cell;
    }

    private static CanopyCell SignIns(Lcg random, bool server) {
        var total = 0d;
        var periods = new List<CanopyCellPeriod>();
        for (var day = 13; day >= 0; day--) {
            var weekend = Now.AddDays(-day).DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
            var value = server ? Math.Round(random.Next() * 4) : weekend ? Math.Round(random.Next() * 2) : Math.Round(2 + random.Next() * 9);
            total += value;
            periods.Add(new CanopyCellPeriod(Now.AddDays(-day).ToString("MMM d", CultureInfo.InvariantCulture), value));
        }

        var cell = new CanopyCell(total) { Text = total.ToString("0", CultureInfo.InvariantCulture) };
        foreach (var period in periods) {
            cell.Series.Add(period);
        }

        return cell;
    }
}

/// <summary>The tree grid and data grid capabilities from the README, as a CanopyX grid.</summary>
internal static class FeatureTable {
    internal static CanopyDataGridView Create() {
        var view = new CanopyDataGridView("features", "Tree grid and data grid") { Noun = "capabilities" };
        view.Columns.Add(new CanopyColumn("area", "Capability") { Sizing = CanopyColumnSizing.Preferred(140) });
        view.Columns.Add(new CanopyColumn("tree", "Tree grid") { Sizing = CanopyColumnSizing.Preferred(320) });
        view.Columns.Add(new CanopyColumn("grid", "Data grid") { Sizing = CanopyColumnSizing.Preferred(320) });
        Add("Navigation", "Expandable branches, path search and lazy children", "Continuous or paged records, offset or cursor navigation");
        Add("Querying", "Search, sibling sorting and named filters", "Search, multi-column sorting, typed filters and condition groups");
        Add("Columns", "Resize and hide", "Resize, hide, reorder, pin and fit to content");
        Add("Selection", "Single or multiple selection and hierarchical checkboxes", "Single or multiple selection with stable record IDs");
        Add("Presentation", "Badges, details, custom cells and light and dark themes", "Links, progress, wrapped text, row highlighting and light and dark themes");
        Add("Reporting", "Static outline for email and print", "Grouping, aggregates, saved views, CSV export and row copying");
        Add("Delivery", "Single HTML file, sidecar bundle or hosted data", "Single HTML file or hosted data");
        return view;

        void Add(string area, string tree, string grid) {
            var row = new CanopyGridRow(area.ToLowerInvariant());
            row.Cells["area"] = area;
            row.Cells["tree"] = tree;
            row.Cells["grid"] = grid;
            view.Rows.Add(row);
        }
    }
}

/// <summary>A linear congruential generator so the demo data is the same on every machine.</summary>
internal sealed class Lcg {
    private uint _state;
    internal Lcg(uint seed) => _state = seed;
    internal double Next() {
        _state = unchecked(_state * 1664525u + 1013904223u);
        return _state / 4294967296.0;
    }
}
