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
    private static readonly CanopyRuntime[] AllRuntimes = { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid };

    [Fact]
    public void Parts_FollowTheBuildListInOrder() {
        Assert.Equal(PartManifestFile.Read().Select(part => part.Name), CanopyHtmlAssets.Parts.Select(part => part.Name));
        Assert.Equal(new[] { "tree-tools", "filter-editor", "export", "history", "pager", "enhance", "data", "editing", "links", "search", "formatting", "format-editor" }, CanopyHtmlAssets.Parts.Select(part => part.Name));
        Assert.Same(CanopyHtmlAssets.GetPart("export"), CanopyHtmlAssets.Parts[2]);
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
        Assert.Equal(new[] { "tree-tools", "export", "links", "search" }, CanopyHtmlAssets.GetParts(CanopyRuntime.TreeGrid).Select(part => part.Name));
        Assert.Equal(new[] { "tree-tools", "filter-editor", "export", "history", "pager", "enhance", "data", "editing", "links", "search", "formatting", "format-editor" }, CanopyHtmlAssets.GetParts(CanopyRuntime.ReportingGrid).Select(part => part.Name));
    }

    [Fact]
    public void MovedCode_LeavesTheEntryPointsForItsParts() {
        // The sidecar index search and the deep links load when a view needs them; the entry points keep their loaders.
        foreach (var runtime in AllRuntimes) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.DoesNotContain("function entryFile(", script);
            Assert.DoesNotContain("writeDeepLink(w,revision=this.selectionRevision)", script);
            Assert.Contains("function checkSearchIndex(", script);
            Assert.Contains("function registerPart(", script);
        }
        Assert.Contains("function entryFile(", CanopyHtmlAssets.GetPart("search").Script);
        Assert.Contains("writeDeepLink(w,revision=this.selectionRevision)", CanopyHtmlAssets.GetPart("links").Script);
        Assert.True(Gzip(CanopyHtmlAssets.GetPart("search").Script) <= 8 * 1024, "The search part exceeds its 8 KiB guard.");
        Assert.True(Gzip(CanopyHtmlAssets.GetPart("links").Script) <= 4 * 1024, "The links part exceeds its 4 KiB guard.");
    }

    [Fact]
    public void RequiredParts_FollowTheView() {
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Equal(new[] { "tree-tools", "export" }, Names(CanopyHtmlAssets.GetRequiredParts(tree)));
        tree.DeepLink = true;
        Assert.Equal(new[] { "tree-tools", "export", "links" }, Names(CanopyHtmlAssets.GetRequiredParts(tree)));
        tree.Source = CanopySource.Sidecar("data/tree/");
        Assert.Equal(new[] { "tree-tools", "export", "links", "search" }, Names(CanopyHtmlAssets.GetRequiredParts(tree)));

        var grid = new CanopyDataGridView("grid", "Grid");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Equal(new[] { "filter-editor", "export" }, Names(CanopyHtmlAssets.GetRequiredParts(grid)));
        grid.Columns.Add(new CanopyColumn("trend", "Trend") { Presenter = CanopyGridPresenter.StatusStrip() });
        Assert.Equal(new[] { "filter-editor", "export", "history" }, Names(CanopyHtmlAssets.GetRequiredParts(grid)));
        // An editable column brings the editing part; a tree's editable column keeps the tree's own proposals.
        grid.Columns[0].Editable = true;
        Assert.Equal(new[] { "filter-editor", "export", "history", "editing" }, Names(CanopyHtmlAssets.GetRequiredParts(grid)));
        tree.Columns[0].Editable = true;
        Assert.DoesNotContain("editing", Names(CanopyHtmlAssets.GetRequiredParts(tree)));
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
        Assert.Equal(new[] { "tree-tools", "export", "links" }, document.EmbeddedParts.Select(marker => marker.Substring(0, marker.IndexOf('@'))));
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
