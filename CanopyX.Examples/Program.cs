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
WriteTemplate("index.html", Path.Combine(output, "index.html"), string.Empty);
Report($"Examples written to {output} in {clock.Elapsed.TotalSeconds:N1} s");

void WriteBundle(CanopyX.CanopyView view, string folder, string title) {
    ReportBundle(folder, view.SaveHtmlBundle(Path.Combine(output, folder), new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Title = title }, bundleOptions));
}

static void ReportBundle(string folder, CanopyX.Bundles.CanopyBundleResult bundle) =>
    Report($"{folder}/index.html: {bundle.NodeCount:N0} nodes in {bundle.FileCount:N0} files ({bundle.PackCount:N0} packs), {bundle.TotalBytes / 1048576.0:N1} MB, largest file {bundle.LargestFileBytes / 1024.0:N0} KB, {bundle.SearchShardCount:N0} search shards");

static void Report(FormattableString message) => Console.WriteLine(message.ToString(CultureInfo.InvariantCulture));

static void WriteTemplate(string name, string path, string content) {
    using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates." + name)
        ?? throw new InvalidOperationException("Missing template " + name);
    using var reader = new StreamReader(stream);
    File.WriteAllText(path, reader.ReadToEnd().Replace("{{content}}", content).Replace("{{style}}", CanopyHtmlAssets.HashedStyleFileName), new UTF8Encoding(false));
}
