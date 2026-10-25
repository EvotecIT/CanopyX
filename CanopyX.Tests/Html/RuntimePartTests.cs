using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>
/// The lazy parts of the runtime are listed once, in Build/parts.json: the assembly, the entry points' manifests and the
/// C# writers handle them alike, so a new part needs no host code.
/// </summary>
public sealed class RuntimePartTests {
    private static readonly CanopyRuntime[] AllRuntimes = { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid, CanopyRuntime.Flow };

    [Fact]
    public void Parts_FollowTheBuildListInOrder() {
        Assert.Equal(PartManifestFile.Read().Select(part => part.Name), CanopyHtmlAssets.Parts.Select(part => part.Name));
        Assert.Equal(new[] { "ui-overlays", "ui-menu", "ui-picker", "ui-navigation", "ui-tabs", "ui-stepper", "tree-tools", "presenters", "filter-editor", "export", "office-export", "history", "pager", "enhance", "data", "forms", "flow", "flow-host", "flow-checks", "flow-options", "flow-pick", "flow-records", "flow-drafts", "flow-preview", "flow-command", "flow-tasks", "flow-dialog", "flow-links", "flow-endpoint", "flow-facts", "flow-consent", "matrix", "changes", "editing", "column-groups", "cell-range", "links", "search", "formatting", "format-editor", "link", "detail-rows", "grouping", "highlight", "layouts", "facets", "live", "record-panel", "calendar", "calendar-recurrence", "calendar-edit", "calendar-ics", "timeline", "grid-options" }, CanopyHtmlAssets.Parts.Select(part => part.Name));
        Assert.Same(CanopyHtmlAssets.GetPart("export"), CanopyHtmlAssets.Parts[9]);
        Assert.Throws<ArgumentException>(() => CanopyHtmlAssets.GetPart("missing"));
    }

    [Fact]
    public void EveryPart_IsVersionedRegisteredInlineSafeAndNamedInTheEntryPointsThatShipIt() {
        foreach (var part in CanopyHtmlAssets.Parts) {
            Assert.Matches("^[a-f0-9]{16}$", part.Version);
            Assert.Equal("canopyx-" + part.Name + ".js", part.ScriptFileName);
            Assert.Matches("^canopyx-" + part.Name + "\\.[a-f0-9]{16}\\.js$", part.HashedScriptFileName);
            Assert.Equal(part.Style == null, part.StyleFileName == null);
            // The script registers its code under its name with its version, before or after the runtime runs.
            Assert.Contains("const part={version:\"" + part.Version + "\"", part.Script);
            Assert.EndsWith("(global.CanopyXParts||=[]).push([\"" + part.Name + "\",part])})(typeof window!==\"undefined\"?window:globalThis);", part.Script);
            Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain('\r', part.Script);
            foreach (var runtime in AllRuntimes) {
                var script = CanopyHtmlAssets.GetScript(runtime);
                var entry = "\"" + part.Name + "\":[\"" + part.Version + "\",\"" + part.HashedScriptFileName + "\"" + (part.Style == null ? "" : ",\"" + part.HashedStyleFileName + "\"") + "]";
                Assert.Equal(part.IsShippedWith(runtime), script.Contains(entry, StringComparison.Ordinal));
            }
        }
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid }) {
            Assert.Equal(new[] { "ui-overlays", "ui-menu", "ui-picker", "ui-navigation", "ui-tabs", "ui-stepper", "tree-tools", "export", "office-export", "links", "search", "link", "highlight", "layouts", "record-panel" }, CanopyHtmlAssets.GetParts(runtime).Select(part => part.Name));
        }
        // The flow entry point knows only the forms and flow parts and the flow's feature parts; the grid entry points know them
        // too, so a grid page can host a flow.
        Assert.Equal(new[] { "forms", "flow", "flow-host", "flow-checks", "flow-options", "flow-pick", "flow-records", "flow-drafts", "flow-preview", "flow-command", "flow-tasks", "flow-dialog", "flow-links", "flow-endpoint", "flow-facts", "flow-consent" },
            CanopyHtmlAssets.GetParts(CanopyRuntime.Flow).Select(part => part.Name));
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            Assert.Equal(new[] { "ui-overlays", "ui-menu", "ui-picker", "ui-navigation", "ui-tabs", "ui-stepper", "tree-tools", "presenters", "filter-editor", "export", "office-export", "history", "pager", "enhance", "data", "forms", "flow", "flow-host", "flow-checks", "flow-options", "flow-pick", "flow-records", "flow-drafts", "flow-preview", "flow-command", "flow-tasks", "flow-dialog", "flow-links", "flow-endpoint", "flow-facts", "flow-consent", "matrix", "changes", "editing", "column-groups", "cell-range", "links", "search", "formatting", "format-editor", "link", "detail-rows", "grouping", "highlight", "layouts", "facets", "live", "record-panel", "calendar", "calendar-recurrence", "calendar-edit", "calendar-ics", "timeline", "grid-options" }, CanopyHtmlAssets.GetParts(runtime).Select(part => part.Name));
        }
    }

    [Fact]
    public void MovedCode_LeavesTheEntryPointsForItsParts() {
        // The sidecar index search and the deep links load when a view needs them; the entry points keep their loaders.
        foreach (var runtime in AllRuntimes) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.DoesNotContain("function entryFile(", script);
            Assert.DoesNotContain("writeDeepLink(w,revision=this.selectionRevision)", script);
            Assert.Contains("function registerPart(", script);
            // The flow entry point has no trees, so it has no sidecar search to check.
            Assert.Equal(runtime != CanopyRuntime.Flow, script.Contains("function checkSearchIndex(", StringComparison.Ordinal));
        }
        Assert.Contains("function entryFile(", CanopyHtmlAssets.GetPart("search").Script);
        Assert.Contains("writeDeepLink(w,revision=this.selectionRevision)", CanopyHtmlAssets.GetPart("links").Script);
        // Combined roadmap integration: its size plus about 15%.
        Assert.True(Gzip(CanopyHtmlAssets.GetPart("search").Script) <= 3584, "The search part exceeds its 3.5 KiB guard.");
        Assert.True(Gzip(CanopyHtmlAssets.GetPart("links").Script) <= 1536, "The links part exceeds its 1.5 KiB guard.");
    }

    [Fact]
    public void RequiredParts_FollowTheView() {
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Equal(new[] { "ui-overlays", "tree-tools", "export" }, Names(CanopyHtmlAssets.GetRequiredParts(tree)));
        tree.DeepLink = true;
        Assert.Equal(new[] { "ui-overlays", "tree-tools", "export", "office-export", "links" }, Names(CanopyHtmlAssets.GetRequiredParts(tree)));
        tree.Source = CanopySource.Sidecar("data/tree/");
        Assert.Equal(new[] { "ui-overlays", "ui-menu", "tree-tools", "export", "office-export", "links", "search", "record-panel" }, Names(CanopyHtmlAssets.GetRequiredParts(tree)));

        var grid = new CanopyDataGridView("grid", "Grid");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Equal(new[] { "ui-overlays", "ui-menu", "presenters", "filter-editor", "export" }, Names(CanopyHtmlAssets.GetRequiredParts(grid)));
        grid.Columns.Add(new CanopyColumn("trend", "Trend") { Presenter = CanopyGridPresenter.StatusStrip() });
        Assert.Equal(new[] { "ui-overlays", "ui-menu", "presenters", "filter-editor", "export", "office-export", "history" }, Names(CanopyHtmlAssets.GetRequiredParts(grid)));
        // An editable column brings the editing part; a tree's editable column keeps the tree's own proposals.
        grid.Columns[0].Editable = true;
        Assert.Equal(new[] { "ui-overlays", "ui-menu", "presenters", "filter-editor", "export", "office-export", "history", "forms", "editing" }, Names(CanopyHtmlAssets.GetRequiredParts(grid)));
        tree.Columns[0].Editable = true;
        Assert.DoesNotContain("editing", Names(CanopyHtmlAssets.GetRequiredParts(tree)));
        Assert.DoesNotContain("forms", Names(CanopyHtmlAssets.GetRequiredParts(tree)));

        // A flow loads the flow part and the forms part it requires, and nothing of the grids or trees.
        var flow = new CanopyFlow("flow", "Flow").Step("step", "Step", step => step.Text("name", "Name"));
        Assert.Equal(new[] { "forms", "flow" }, Names(CanopyHtmlAssets.GetRequiredParts(flow)));
    }

    [Fact]
    public void InlineFragments_CarryTheirViewsParts_OncePerDocument() {
        var tree = new CanopyTreeView("linked", "Linked") { DeepLink = true };
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        var single = tree.ToHtmlFragment();
        foreach (var part in CanopyHtmlAssets.GetRequiredParts(tree)) Assert.Contains(part.Markup, single);
        Assert.DoesNotContain("application/x-canopyx-search", single);

        var document = new CanopyHtmlDocument();
        var first = tree.ToHtmlFragment(new CanopyHtmlOptions { Document = document });
        var second = tree.ToHtmlFragment(new CanopyHtmlOptions { Document = document });
        Assert.Contains("application/x-canopyx-links", first);
        Assert.DoesNotContain("application/x-canopyx-", second.Replace("application/json", ""));
        Assert.Equal(new[] { "ui-overlays", "tree-tools", "export", "office-export", "links" }, document.EmbeddedParts.Select(marker => marker.Substring(0, marker.IndexOf('@'))));
        Assert.Equal(string.Empty, document.EmbedOnce(CanopyHtmlAssets.GetPart("links")));
        Assert.Equal(CanopyHtmlAssets.GetPart("search").Markup, document.EmbedOnce(CanopyHtmlAssets.GetPart("search")));
        Assert.Throws<ArgumentNullException>(() => document.EmbedOnce(null!));
    }

    [Fact]
    public void Markup_MarksThePayloadWithItsTypeAndVersion() {
        var part = CanopyHtmlAssets.GetPart("tree-tools");
        Assert.Equal("<script type=\"application/x-canopyx-tree-tools-style\" data-cx-version=\"" + part.Version + "\">" + part.Style + "</script>"
            + "<script type=\"application/x-canopyx-tree-tools\" data-cx-version=\"" + part.Version + "\">" + part.Script + "</script>", part.Markup);
        var links = CanopyHtmlAssets.GetPart("links");
        Assert.Equal("<script type=\"application/x-canopyx-links\" data-cx-version=\"" + links.Version + "\">" + links.Script + "</script>", links.Markup);
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain)]
    [InlineData(CanopyAssetNaming.ContentHash)]
    public void WriteTo_WritesEveryPartTheEntryPointKnows(CanopyAssetNaming naming) {
        foreach (var runtime in AllRuntimes) {
            var directory = Path.Combine(Path.GetTempPath(), "canopyx-parts-" + Guid.NewGuid().ToString("N"));
            try {
                var main = CanopyHtmlAssets.WriteTo(directory, naming, runtime);
                var expected = CanopyHtmlAssets.GetParts(runtime).SelectMany(part => new[] { part.GetScriptFileName(naming), part.GetStyleFileName(naming) })
                    .Where(name => name != null).Concat(main.Select(Path.GetFileName)).OrderBy(name => name, StringComparer.Ordinal);
                Assert.Equal(expected, Directory.GetFiles(directory).Select(Path.GetFileName).OrderBy(name => name, StringComparer.Ordinal));
                foreach (var part in CanopyHtmlAssets.GetParts(runtime)) Assert.Equal(part.Script, File.ReadAllText(Path.Combine(directory, part.GetScriptFileName(naming))));
            } finally {
                Directory.Delete(directory, true);
            }
        }
    }

    [Fact]
    public void ManifestWriter_ListsEveryRuntimePartWithTheVersionItsScriptCarries() {
        var manifest = File.ReadAllText(Path.Combine(RepositoryPaths.Root, "CanopyX.Html", "Assets", "canopyx-parts.json"));
        foreach (var part in CanopyHtmlAssets.Parts) {
            Assert.Contains("\"name\": \"" + part.Name + "\"", manifest);
            Assert.Single(Regex.Matches(part.Script, "version:\"" + part.Version + "\""));
        }
    }

    [Fact]
    public void EmbeddedAssets_AreTheEntryPointsThePartsAndTheManifestOnly() {
        var expected = new HashSet<string>(StringComparer.Ordinal) { "page.html", "canopyx-parts.json" };
        foreach (var runtime in AllRuntimes) { expected.Add(CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.Plain, runtime)); expected.Add(CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.Plain, runtime)); }
        foreach (var part in CanopyHtmlAssets.Parts) { expected.Add(part.ScriptFileName); if (part.StyleFileName != null) expected.Add(part.StyleFileName); }
        var embedded = typeof(CanopyHtmlAssets).Assembly.GetManifestResourceNames().Where(name => name.StartsWith("CanopyX.Html.Assets.", StringComparison.Ordinal))
            .Select(name => name.Substring("CanopyX.Html.Assets.".Length));
        Assert.Equal(expected.OrderBy(name => name, StringComparer.Ordinal), embedded.OrderBy(name => name, StringComparer.Ordinal));
    }

    private static string[] Names(IEnumerable<CanopyHtmlPart> parts) => parts.Select(part => part.Name).ToArray();

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
