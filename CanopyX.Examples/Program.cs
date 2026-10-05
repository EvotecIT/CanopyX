using System.Diagnostics;
using System.Globalization;
using System.Reflection;
using System.Text;
using CanopyX.Examples;
using CanopyX.Html;
using CanopyX.Rendering;

// Generates the example gallery that the browser tests open:
//   inline.html        a single-file page with inline data (about 1,400 nodes)
//   bundle/index.html  a sidecar bundle of a large tree (more than 100,000 nodes), loadable from file://
//   outline.html       the static outline for email, print, and Word
//   outline-dark.html  the same outline in the dark theme, as literal colours
//   outline-page.html  the same outline following the theme of the page it is in, without script
//   filter-bar.html    a host's own filter bar in place of the view's filter switches
//   live-records.html  fresh record snapshots, selection, and saved view controls
//   index.html         links to the pages above
// With --search-bench it writes the search benchmark bundles instead (deep/ and directory/, see SearchBenchTrees).
// With --pack-bench it writes the packing benchmark bundle instead (catalog/, see PackBenchTree) and reports the
// generation time and the peak memory of the process; --services <n> sets the services per region (default 1,000).
// The bundle is streamed: each service is built when the writer asks for it and released once it is written. With
// --in-memory the whole tree is built first, which is how a host without a streaming source writes a bundle.
// --search-pack <bytes> packs the search index of every bundle into files of up to that size (default 64 KiB; 0 writes
// each index file on its own), and --child-pack <bytes> packs the children pages into files of up to that size
// (default 128 KiB).
// Usage: CanopyX.Examples [output folder] [--search-bench | --pack-bench [--services <n>] [--in-memory]] [--search-pack <bytes>] [--child-pack <bytes>]
var searchBench = args.Contains("--search-bench");
var packBench = args.Contains("--pack-bench");
var valueOptions = new[] { "--services", "--search-pack", "--child-pack" };
int? Number(string name) {
    var at = Array.IndexOf(args, name);
    return at >= 0 && at + 1 < args.Length ? int.Parse(args[at + 1], CultureInfo.InvariantCulture) : null;
}

var services = Number("--services") ?? PackBenchTree.DefaultServicesPerRegion;
var bundleOptions = new CanopyX.Bundles.CanopyBundleOptions();
if (Number("--search-pack") is int searchPack) bundleOptions.SearchPackBytes = searchPack;
if (Number("--child-pack") is int childPack) bundleOptions.ChildPackBytes = childPack;
var positional = args.Where((arg, index) => !arg.StartsWith("--", StringComparison.Ordinal) && (index == 0 || !valueOptions.Contains(args[index - 1]))).ToArray();
var output = positional.Length > 0 ? positional[0] : Path.Combine(AppContext.BaseDirectory, searchBench ? "search-bench" : packBench ? "pack-bench" : "output");
Directory.CreateDirectory(output);
var clock = Stopwatch.StartNew();

if (packBench) {
    var catalog = PackBenchTree.View();
    var options = new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Title = "CanopyX service catalog bundle" };
    if (args.Contains("--in-memory")) {
        foreach (var region in PackBenchTree.RegionNodes(services)) {
            foreach (var service in PackBenchTree.Services(PackBenchTree.RegionNumber(region), services)) {
                region.Children.Add(service);
            }

            catalog.Roots.Add(region);
        }

        ReportBundle("catalog", catalog.SaveHtmlBundle(Path.Combine(output, "catalog"), options, bundleOptions));
    } else {
        // A service arrives with its own subtree inline; only the regions ask for their children.
        ReportBundle("catalog", catalog.SaveHtmlBundle(Path.Combine(output, "catalog"), PackBenchTree.RegionNodes(services),
            node => node.Kind == "region" ? PackBenchTree.Services(PackBenchTree.RegionNumber(node), services) : null, options, bundleOptions));
    }

    using var process = Process.GetCurrentProcess();
    Report($"Packing benchmark bundle written to {output} in {clock.Elapsed.TotalSeconds:N1} s, peak working set {process.PeakWorkingSet64 / 1048576.0:N0} MB");
    return;
}

if (searchBench) {
    WriteBundle(SearchBenchTrees.DeepTree(), "deep", "CanopyX deep tree bundle");
    WriteBundle(SearchBenchTrees.DirectoryTree(), "directory", "CanopyX directory bundle");
    Report($"Search benchmark bundles written to {output} in {clock.Elapsed.TotalSeconds:N1} s");
    return;
}

var smallTree = new SyntheticFileTree();
var inline = ExampleViews.FileShares("files-inline", smallTree.Build(shares: 4, departments: 5, projects: 3, minFiles: 3, maxFiles: 9, longListFiles: 240));
inline.SaveHtmlPage(Path.Combine(output, "inline.html"), new CanopyHtmlOptions { Title = "CanopyX inline file shares" });
Report($"inline.html: {smallTree.NodeCount:N0} nodes");
InventoryGridExample.Write(output);
CursorGridExample.Write(output);
ReportingGridExample.Write(output);
GroupedGridExample.Write(output);
ContainedGridsExample.Write(output);
WrappedGridExample.Write(output);
RichGridExample.Write(output);

var largeTree = new SyntheticFileTree();
var bundleView = ExampleViews.FileShares("files", largeTree.Build(shares: 26, departments: 8, projects: 10, minFiles: 10, maxFiles: 40, longListFiles: 3_000));
WriteBundle(bundleView, "bundle", "CanopyX file shares bundle");

var outlineTree = new SyntheticFileTree();
var outlineView = ExampleViews.FileShares("files-outline", outlineTree.Build(shares: 3, departments: 4, projects: 3, minFiles: 3, maxFiles: 9, longListFiles: 5));
CanopyStaticHtmlOptions OutlineOptions() => new() { MaxRows = 200, MaxDepth = 4, FullReportUrl = "index.html", FullReportText = "Back to the examples" };
WriteTemplate("outline.html", Path.Combine(output, "outline.html"), CanopyStaticHtml.Render(outlineView, OutlineOptions()));
// The dark theme as literal colours, which is what a dark email or document gets: the page around it stays white.
var darkOutline = OutlineOptions();
darkOutline.Theme = CanopyStaticTheme.Dark();
WriteTemplate("outline.html", Path.Combine(output, "outline-dark.html"), CanopyStaticHtml.Render(outlineView, darkOutline));
// In a page, the outline can follow the page's theme instead: its colours are the custom properties of canopyx.css.
var pageOutline = OutlineOptions();
pageOutline.UseThemeVariables = true;
WriteTemplate("outline-page.html", Path.Combine(output, "outline-page.html"), CanopyStaticHtml.Render(outlineView, pageOutline));
// A host with a filter bar of its own: the page leaves the view's switches for those filters out, and the bar sets the
// active filters in one step.
var barTree = new SyntheticFileTree();
var barView = ExampleViews.FileShares("files-filter-bar", barTree.Build(shares: 4, departments: 5, projects: 3, minFiles: 3, maxFiles: 9, longListFiles: 20));
foreach (var root in barView.Roots) {
    FlagLarge(root);
}

barView.Filters.Add(new CanopyX.CanopyFilter("large", "Large files", "large") { AncestorFlag = "large-below" });
var barOptions = new CanopyHtmlOptions { Height = "70vh" };
barOptions.HiddenFilterIds.Add("changed");
barOptions.HiddenFilterIds.Add("large");
WriteTemplate("filter-bar.html", Path.Combine(output, "filter-bar.html"), barView.ToHtmlFragment(barOptions));
WriteTemplate("live-records.html", Path.Combine(output, "live-records.html"),
    LiveRecordsView.Create().ToHtmlFragment(new CanopyHtmlOptions { AutoMount = false, Height = "60vh" }));
WriteTemplate("query-records.html", Path.Combine(output, "query-records.html"),
    QueryRecordsView.Create().ToHtmlFragment(new CanopyHtmlOptions { AutoMount = false, Height = "55vh" }));
WriteTemplate("long-document.html", Path.Combine(output, "long-document.html"),
    LongDocumentView.Create().ToHtmlFragment(new CanopyHtmlOptions { AutoMount = false, Height = "55vh" }));
CanopyHtmlAssets.WriteTo(Path.Combine(output, "checkbox-assets"), CanopyAssetNaming.ContentHash, CanopyRuntime.InteractiveTreeGrid);
WriteTemplate("checkboxes.html", Path.Combine(output, "checkboxes.html"),
    CheckboxView.Create().ToHtmlFragment(new CanopyHtmlOptions { AutoMount = false, Height = "55vh" }), CanopyRuntime.InteractiveTreeGrid);
WriteTemplate("interactions.html", Path.Combine(output, "interactions.html"),
    InteractionView.Create().ToHtmlFragment(new CanopyHtmlOptions { AutoMount = false, Height = "55vh" }), CanopyRuntime.InteractiveTreeGrid);
WriteTemplate("index.html", Path.Combine(output, "index.html"), string.Empty);
Report($"Examples written to {output} in {clock.Elapsed.TotalSeconds:N1} s");

void WriteBundle(CanopyX.CanopyView view, string folder, string title) {
    ReportBundle(folder, view.SaveHtmlBundle(Path.Combine(output, folder), new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Title = title }, bundleOptions));
}

static void ReportBundle(string folder, CanopyX.Bundles.CanopyBundleResult bundle) =>
    Report($"{folder}/index.html: {bundle.NodeCount:N0} nodes in {bundle.FileCount:N0} files ({bundle.PackCount:N0} packs), {bundle.TotalBytes / 1048576.0:N1} MB, largest file {bundle.LargestFileBytes / 1024.0:N0} KB, {bundle.SearchShardCount:N0} search shards");

// The host computes its own flags: files the tree marks large, and the folders above them.
static bool FlagLarge(CanopyX.CanopyNode node) {
    var below = false;
    foreach (var child in node.Children) {
        below |= FlagLarge(child);
    }

    if (below) {
        node.Flags.Add("large-below");
    }

    var large = node.Cells.TryGetValue("state", out var state) && Equals(state.Value, "large");
    if (large) {
        node.Flags.Add("large");
    }

    return large || below;
}

static void Report(FormattableString message) => Console.WriteLine(message.ToString(CultureInfo.InvariantCulture));

static void WriteTemplate(string name, string path, string content, CanopyRuntime runtime = CanopyRuntime.TreeGrid) {
    File.WriteAllText(path, ReadTemplate(name).Replace("{{content}}", content)
        .Replace("{{example-style}}", ReadTemplate("examples.css"))
        .Replace("{{style}}", CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.ContentHash, runtime))
        .Replace("{{script}}", CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, runtime)), new UTF8Encoding(false));
}

static string ReadTemplate(string name) {
    using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates." + name)
        ?? throw new InvalidOperationException("Missing template " + name);
    using var reader = new StreamReader(stream);
    return reader.ReadToEnd();
}
