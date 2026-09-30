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
//   index.html         links to the pages above
// With --search-bench it writes the search benchmark bundles instead (deep/ and directory/, see SearchBenchTrees).
// Usage: CanopyX.Examples [output folder] [--search-bench]
var searchBench = args.Contains("--search-bench");
var positional = args.Where(arg => !arg.StartsWith("--", StringComparison.Ordinal)).ToArray();
var output = positional.Length > 0 ? positional[0] : Path.Combine(AppContext.BaseDirectory, searchBench ? "search-bench" : "output");
Directory.CreateDirectory(output);
var clock = Stopwatch.StartNew();

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
var outline = CanopyStaticHtml.Render(outlineView, new CanopyStaticHtmlOptions { MaxRows = 200, MaxDepth = 4, FullReportUrl = "index.html", FullReportText = "Back to the examples" });
WriteTemplate("outline.html", Path.Combine(output, "outline.html"), outline);
WriteTemplate("index.html", Path.Combine(output, "index.html"), string.Empty);
Report($"Examples written to {output} in {clock.Elapsed.TotalSeconds:N1} s");

void WriteBundle(CanopyX.CanopyView view, string folder, string title) {
    var bundle = view.SaveHtmlBundle(Path.Combine(output, folder), new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Title = title });
    Report($"{folder}/index.html: {bundle.NodeCount:N0} nodes in {bundle.FileCount:N0} files, {bundle.TotalBytes / 1048576.0:N1} MB, largest file {bundle.LargestFileBytes / 1024.0:N0} KB, {bundle.SearchShardCount:N0} search shards");
}

static void Report(FormattableString message) => Console.WriteLine(message.ToString(CultureInfo.InvariantCulture));

static void WriteTemplate(string name, string path, string content) {
    using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates." + name)
        ?? throw new InvalidOperationException("Missing template " + name);
    using var reader = new StreamReader(stream);
    File.WriteAllText(path, reader.ReadToEnd().Replace("{{content}}", content), new UTF8Encoding(false));
}
