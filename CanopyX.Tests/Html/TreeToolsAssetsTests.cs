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
        Assert.True(size <= 19456, "The tree tools part is " + size + " bytes gzip; the guard is 19 KiB.");
        // The shared chrome in this copy targets tree hosts only, so a flat grid's own rules keep their order on a mixed page.
        Assert.DoesNotContain(".cx-chrome", CanopyHtmlAssets.TreeToolsStyle);
        Assert.Contains(".cx-tree-tools", CanopyHtmlAssets.TreeToolsStyle);
        // The record drawer rules it shares with the editor part come before the flat grid's overlay rules, as in the editor's
        // stylesheet, so a flat grid's drawer keeps the overlay's font and height when the tree tools load after the editor.
        foreach (var style in new[] { CanopyHtmlAssets.TreeToolsStyle, CanopyHtmlAssets.FilterEditorStyle }) {
            Assert.True(style.IndexOf("body .cx-host.cx-drawer{", StringComparison.Ordinal) >= 0, "The record drawer rules are missing.");
            Assert.True(style.IndexOf("body .cx-host.cx-grid-overlay{", StringComparison.Ordinal) > style.IndexOf("body .cx-host.cx-drawer{", StringComparison.Ordinal));
        }
    }

    [Fact]
    public void TreeFragments_CarryThePayloadOnlyWithInlineAssets() {
        var view = new CanopyTreeView("tree", "Tree");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var inline = view.ToHtmlFragment();
        Assert.Contains("<script type=\"application/x-canopyx-tree-tools\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\">", inline);
        Assert.Contains("<script type=\"application/x-canopyx-tree-tools-style\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\">", inline);
        Assert.DoesNotContain("x-canopyx-tree-tools", view.ToHtmlFragment(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External }));
        var grid = new CanopyDataGridView("grid", "Grid");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain("x-canopyx-tree-tools", grid.ToHtmlFragment());
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
        Assert.Single(Regex.Matches(page, "<script type=\"application/x-canopyx-tree-tools\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\">"));
        Assert.Single(Regex.Matches(page, "application/x-canopyx-tree-tools-style"));
        Assert.Contains("x-canopyx-tree-tools", fragments[0]);
        Assert.All(fragments.Skip(1), fragment => Assert.DoesNotContain("x-canopyx-tree-tools", fragment));
        Assert.Equal(new[] { "tree-tools@" + CanopyHtmlAssets.TreeToolsVersion, "export@" + CanopyHtmlAssets.ExportVersion }, document.EmbeddedParts);
        Assert.Single(Regex.Matches(page, "application/x-canopyx-export"));

        // Flat grids share the filter editor and export parts the same way: the trees above already carry the export part.
        var grid = new CanopyDataGridView("records", "Records");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        var first = grid.ToHtmlFragment(options);
        Assert.Contains("application/x-canopyx-filter-editor", first);
        Assert.DoesNotContain("application/x-canopyx-export", first);
        Assert.DoesNotContain("application/x-canopyx-", grid.ToHtmlFragment(options).Replace("application/json", ""));
        var tree = new CanopyTreeView("mixed", "Mixed");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain("application/x-canopyx-", tree.ToHtmlFragment(new CanopyHtmlOptions { Document = document, Runtime = CanopyRuntime.DataGrid }));
        // Without a document every inline fragment stands alone.
        Assert.Contains("application/x-canopyx-tree-tools", tree.ToHtmlFragment());
    }

    [Fact]
    public void Runtime_FindsAPayloadByTheMarkerTheWriterEmits() {
        // The writer marks a payload with its type and version; the part loader looks for exactly that pair anywhere in the
        // document, so the views of a page share one payload whatever their order.
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.Contains("document.querySelectorAll('script[type=\"application/x-canopyx-'+type+'\"][data-cx-version=\"'+part.version+'\"]')", script);
        }
        Assert.StartsWith("<script type=\"application/x-canopyx-tree-tools-style\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\">", CanopyHtmlAssets.TreeToolsMarkup);
        Assert.Contains("<script type=\"application/x-canopyx-tree-tools\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\">", CanopyHtmlAssets.TreeToolsMarkup);
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
