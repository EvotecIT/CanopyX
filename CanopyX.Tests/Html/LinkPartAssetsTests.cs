using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Linked views ship in the link part: versioned, bounded, outside the entry points, and carried by the fragments a host asks for.</summary>
public sealed class LinkPartAssetsTests {
    [Fact]
    public void LinkPart_IsVersionedInlineSafeBoundedAndOutsideTheEntryPoints() {
        var part = CanopyHtmlAssets.GetPart("link");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Equal("linked views", part.Label);
        Assert.NotNull(part.Style);
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            Assert.True(part.IsShippedWith(runtime));
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.Contains(part.HashedScriptFileName, script);
            // The entry points carry the method stubs and labels; the filtering, chips, highlights and events stay in the part.
            Assert.Contains("setExternalFilter", script);
            Assert.DoesNotContain("function linkFilter(", script);
            Assert.DoesNotContain("cx-link-chip", CanopyHtmlAssets.GetStyle(runtime));
        }
        Assert.Contains("function linkFilter(", part.Script);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain('\r', part.Script);
        Assert.True(Gzip(part.Script) <= 8 * 1024, "The link part is " + Gzip(part.Script) + " bytes gzip; the guard is 8 KiB.");
        Assert.True(Gzip(part.Style!) <= 1024, "The link stylesheet is " + Gzip(part.Style!) + " bytes gzip; the guard is 1 KiB.");
    }

    [Fact]
    public void Fragments_CarryTheLinkPartOnlyWhenTheHostAsksOncePerDocument() {
        var grid = Grid();
        Assert.DoesNotContain("x-canopyx-link\"", grid.ToHtmlFragment());
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(grid), part => part.Name == "link");

        var document = new CanopyHtmlDocument();
        var options = new CanopyHtmlOptions { Document = document };
        options.Parts.Add("link");
        var first = grid.ToHtmlFragment(options);
        var tree = new CanopyTreeView("sites", "Sites");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        var second = tree.ToHtmlFragment(options);
        var marker = "<script type=\"application/x-canopyx-link\" data-cx-version=\"" + CanopyHtmlAssets.GetPart("link").Version + "\">";
        Assert.Contains(marker, first);
        Assert.Contains("application/x-canopyx-link-style", first);
        Assert.DoesNotContain(marker, second);
        Assert.Contains("link@" + CanopyHtmlAssets.GetPart("link").Version, document.EmbeddedParts);

        var page = new CanopyHtmlOptions();
        page.Parts.Add("link");
        Assert.Contains(marker, grid.ToHtmlPage(page));
        Assert.Contains(marker, tree.ToHtmlPage(page));
        // External assets load the part file beside the runtime instead.
        var external = new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External };
        external.Parts.Add("link");
        Assert.DoesNotContain(marker, grid.ToHtmlFragment(external));
    }

    [Fact]
    public void Parts_RefuseUnknownNamesAndPartsOutsideTheViewsRuntime() {
        var unknown = new CanopyHtmlOptions();
        unknown.Parts.Add("missing");
        Assert.Throws<ArgumentException>(() => Grid().ToHtmlFragment(unknown));
        var gridOnly = new CanopyHtmlOptions();
        gridOnly.Parts.Add("filter-editor");
        var tree = new CanopyTreeView("sites", "Sites");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Throws<InvalidOperationException>(() => tree.ToHtmlFragment(gridOnly));
        // External assets check the names too, though they embed nothing.
        var external = new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External };
        external.Parts.Add("missing");
        Assert.Throws<ArgumentException>(() => Grid().ToHtmlFragment(external));
    }

    [Fact]
    public void LabelPacks_TranslateTheLinkTexts() {
        foreach (var labels in new[] { CanopyLabels.Polish(), CanopyLabels.German(), CanopyLabels.Spanish(), CanopyLabels.French(), CanopyLabels.Italian() }) {
            Assert.Contains("{source}", labels.LinkFilteredBy);
            Assert.Contains("{values}", labels.LinkFilteredBy);
            Assert.NotEqual(new CanopyLabels().LinkCleared, labels.LinkCleared);
        }
        var tree = new CanopyTreeView("sites", "Sites") { Labels = CanopyLabels.German() };
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        // Trees read the link texts, so a tree view carries them.
        Assert.Contains("\"linkFilteredBy\":\"Gefiltert nach {source}: {values}\"", tree.ToJson());
    }

    private static CanopyDataGridView Grid() {
        var grid = new CanopyDataGridView("services", "Services");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        grid.Columns.Add(new CanopyColumn("site", "Site"));
        return grid;
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
