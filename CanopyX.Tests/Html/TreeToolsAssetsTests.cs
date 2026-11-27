using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Every tree runtime loads the tree tools part; it must match its runtimes, stay bounded and travel with tree pages.</summary>
public sealed class TreeToolsAssetsTests {
    [Fact]
    public void TreeTools_AreVersionedInlineSafeAndBounded() {
        Assert.Matches("^[a-f0-9]{16}$", CanopyHtmlAssets.TreeToolsVersion);
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            Assert.Contains(CanopyHtmlAssets.TreeToolsVersion, CanopyHtmlAssets.GetScript(runtime));
            Assert.Contains(CanopyHtmlAssets.HashedTreeToolsScriptFileName, CanopyHtmlAssets.GetScript(runtime));
            Assert.Contains(CanopyHtmlAssets.HashedTreeToolsStyleFileName, CanopyHtmlAssets.GetScript(runtime));
        }
        Assert.DoesNotContain("</script", CanopyHtmlAssets.TreeToolsScript, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("</script", CanopyHtmlAssets.TreeToolsStyle, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain('\r', CanopyHtmlAssets.TreeToolsScript);
        var size = Gzip(CanopyHtmlAssets.TreeToolsScript) + Gzip(CanopyHtmlAssets.TreeToolsStyle);
        // Combined roadmap integration: its size plus about 15%.
        // 256 bytes cover the record drawer's heading hierarchy and phone action styles, which the tree tools share.
        // 448 bytes cover narrow toolbars keeping Export and the tree's outlined, indented Office exports.
        Assert.True(size <= 20160, "The tree tools part is " + size + " bytes gzip; the guard is 19 KiB + 704.");
        // The shared chrome in this copy targets tree hosts only, so a flat grid's own rules keep their order on a mixed page.
        Assert.DoesNotContain(".cx-chrome", CanopyHtmlAssets.TreeToolsStyle);
        Assert.Contains(".cx-tree-tools", CanopyHtmlAssets.TreeToolsStyle);
        // Tree details and grid editors use the same layered overlay shell. Consumers keep their content rules without
        // overriding the common shell when parts load in either order on a mixed page.
        foreach (var name in new[] { "tree-tools", "filter-editor" }) {
            var consumer = CanopyHtmlAssets.GetPart(name);
            Assert.Contains("ui-overlays", consumer.Requires);
            Assert.NotNull(consumer.Style);
            Assert.DoesNotMatch(@"body\s+\.cx-host\.cx-(drawer|grid-overlay)\s*\{", consumer.Style!);
        }
        var overlays = CanopyHtmlAssets.GetPart("ui-overlays").Style;
        Assert.NotNull(overlays);
        Assert.Contains("@layer hfx.components", overlays);
        foreach (var element in new[] { "header", "title", "body", "footer" }) {
            Assert.Matches(@"[^{}]*\.cx-dialog[^{}]*\.cx-drawer[^{}]*\.cx-popover[^{}]*\[data-cx-part=""" + element + @"""\]\s*\{", overlays!);
        }
    }

    [Fact]
    public void TreeFragments_CarryThePayloadOnlyWithInlineAssets() {
        var view = new CanopyTreeView("tree", "Tree");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var inline = view.ToHtmlFragment();
        Assert.Contains("<script data-canopyx-part=\"tree-tools\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\">", inline);
        Assert.Contains("<style data-canopyx-part=\"tree-tools\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\" media=\"not all\">", inline);
        Assert.DoesNotContain("data-canopyx-part=\"tree-tools\"", view.ToHtmlFragment(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External }));
        var grid = new CanopyDataGridView("grid", "Grid");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain("data-canopyx-part=\"tree-tools\"", grid.ToHtmlFragment());
    }

    [Fact]
    public void FragmentsSharingADocument_CarryEachSharedPartOnce() {
        var document = new CanopyHtmlDocument();
        var options = new CanopyHtmlOptions { Document = document };
        var fragments = new[] { "org", "files", "groups" }.Select(id => {
            var view = new CanopyTreeView(id, id);
            view.Columns.Add(new CanopyColumn("name", "Name"));
            return view.ToHtmlFragment(options);
        }).ToArray();
        var page = string.Concat(fragments);
        Assert.Single(Regex.Matches(page, "<script data-canopyx-part=\"tree-tools\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\">"));
        Assert.Single(Regex.Matches(page, "<style data-canopyx-part=\"tree-tools\""));
        Assert.Contains("data-canopyx-part=\"tree-tools\"", fragments[0]);
        Assert.All(fragments.Skip(1), fragment => Assert.DoesNotContain("data-canopyx-part=\"tree-tools\"", fragment));
        Assert.Equal(new[] { "ui-overlays@" + CanopyHtmlAssets.GetPart("ui-overlays").Version, "tree-tools@" + CanopyHtmlAssets.TreeToolsVersion, "export@" + CanopyHtmlAssets.ExportVersion, "csv-export@" + CanopyHtmlAssets.GetPart("csv-export").Version }, document.EmbeddedParts);
        Assert.Single(Regex.Matches(page, "<script data-canopyx-part=\"ui-overlays\""));
        Assert.Single(Regex.Matches(page, "<style data-canopyx-part=\"ui-overlays\""));
        Assert.Single(Regex.Matches(page, "data-canopyx-part=\"export\""));

        // Flat grids share the filter editor and export parts the same way: the trees above already carry the export part.
        var grid = new CanopyDataGridView("records", "Records");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        var first = grid.ToHtmlFragment(options);
        Assert.Contains("data-canopyx-part=\"filter-editor\"", first);
        Assert.DoesNotContain("data-canopyx-part=\"export\"", first);
        Assert.DoesNotContain("data-canopyx-part=", grid.ToHtmlFragment(options));
        var tree = new CanopyTreeView("mixed", "Mixed");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain("data-canopyx-part=", tree.ToHtmlFragment(new CanopyHtmlOptions { Document = document, Runtime = CanopyRuntime.DataGrid }));
        // Without a document every inline fragment stands alone.
        Assert.Contains("data-canopyx-part=\"tree-tools\"", tree.ToHtmlFragment());
    }

    [Fact]
    public void Runtime_NeverTurnsPageTextIntoScriptOrStyle() {
        // A part the page carries registers itself as it runs; the loader only inserts the part files beside the runtime, so a
        // strict Content Security Policy needs no 'unsafe-inline' (docs/security.md).
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = ReadableAssets.Script(runtime);
            Assert.DoesNotContain("application/x-canopyx-'+", script);
            Assert.DoesNotContain("trusted(\"Script\"", script);
            Assert.DoesNotContain("createScript:", script);
        }
        Assert.StartsWith("<style data-canopyx-part=\"tree-tools\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\" media=\"not all\">", CanopyHtmlAssets.TreeToolsMarkup);
        Assert.Contains("<script data-canopyx-part=\"tree-tools\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\">", CanopyHtmlAssets.TreeToolsMarkup);
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain, CanopyRuntime.TreeGrid)]
    [InlineData(CanopyAssetNaming.ContentHash, CanopyRuntime.InteractiveTreeGrid)]
    [InlineData(CanopyAssetNaming.ContentHash, CanopyRuntime.DataGrid)]
    public void AssetWriters_WriteTheTreeToolsBesideEveryRuntime(CanopyAssetNaming naming, CanopyRuntime runtime) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-tree-tools-" + Guid.NewGuid().ToString("N"));
        try {
            var files = CanopyHtmlAssets.WriteTo(directory, naming, runtime);
            Assert.Equal(2, files.Count);
            var plain = naming == CanopyAssetNaming.Plain;
            Assert.Equal(CanopyHtmlAssets.TreeToolsScript, File.ReadAllText(Path.Combine(directory, plain ? CanopyHtmlAssets.TreeToolsScriptFileName : CanopyHtmlAssets.HashedTreeToolsScriptFileName)));
            Assert.Equal(CanopyHtmlAssets.TreeToolsStyle, File.ReadAllText(Path.Combine(directory, plain ? CanopyHtmlAssets.TreeToolsStyleFileName : CanopyHtmlAssets.HashedTreeToolsStyleFileName)));
        } finally { Directory.Delete(directory, true); }
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
