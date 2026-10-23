using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Search highlighting and layout modes ship as two parts: bounded, outside the entry points, and carried by the views that declare them.</summary>
public sealed class ViewModePartAssetsTests {
    [Theory]
    // Combined roadmap integration: each part's size plus about 15%.
    [InlineData("highlight", "function hlMarkCell", 9.5)]
    [InlineData("layouts", "function cardGeometry", 6.5)]
    public void Part_IsBoundedAndOutsideTheEntryPoints(string name, string marker, double guardKiB) {
        var part = CanopyHtmlAssets.GetPart(name);
        Assert.Contains(marker, part.Script);
        Assert.NotNull(part.Style);
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            Assert.True(part.IsShippedWith(runtime));
            Assert.DoesNotContain(marker, CanopyHtmlAssets.GetScript(runtime));
            Assert.Contains(part.HashedScriptFileName, CanopyHtmlAssets.GetScript(runtime));
        }
        var size = Gzip(part.Script) + Gzip(part.Style!);
        Assert.True(size <= guardKiB * 1024, "The " + name + " part is " + size + " bytes gzip; the guard is " + guardKiB + " KiB.");
    }

    [Fact]
    public void GridFragments_CarryThePayloadsOnlyForTheFeaturesTheyDeclare() {
        var view = new CanopyDataGridView("tickets", "Tickets");
        view.Columns.Add(new CanopyColumn("ticket", "Ticket"));
        Assert.DoesNotContain("x-canopyx-highlight", view.ToHtmlFragment());
        Assert.DoesNotContain("x-canopyx-layouts", view.ToHtmlFragment());
        view.SearchHighlight = new CanopySearchHighlight();
        var fragment = view.ToHtmlFragment();
        Assert.Contains("<script type=\"application/x-canopyx-highlight\" data-cx-version=\"" + CanopyHtmlAssets.GetPart("highlight").Version + "\">", fragment);
        Assert.Contains("application/x-canopyx-highlight-style", fragment);
        Assert.DoesNotContain("x-canopyx-layouts", fragment);
        view.Layout = new CanopyLayoutOptions();
        Assert.Contains("x-canopyx-layouts", view.ToHtmlFragment());
        Assert.DoesNotContain("x-canopyx-highlight", view.ToHtmlFragment(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External }));
    }

    [Fact]
    public void TreeFragments_CarryThePayloadsOnlyForTheFeaturesTheyDeclare() {
        var view = new CanopyTreeView("kb", "Knowledge base");
        view.Columns.Add(new CanopyColumn("name", "Article"));
        Assert.DoesNotContain("x-canopyx-layouts", view.ToHtmlFragment());
        view.Layout = new CanopyLayoutOptions();
        Assert.Contains("x-canopyx-layouts", view.ToHtmlFragment());
        Assert.DoesNotContain("x-canopyx-highlight", view.ToHtmlFragment());
        Assert.Equal(new[] { "ui-overlays", "tree-tools", "export", "layouts" }, CanopyHtmlAssets.GetRequiredParts(view).Select(part => part.Name));
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain)]
    [InlineData(CanopyAssetNaming.ContentHash)]
    public void AssetWriters_WriteBothPartsBesideEveryRuntime(CanopyAssetNaming naming) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-view-modes-" + Guid.NewGuid().ToString("N"));
        try {
            foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.ReportingGrid }) {
                var target = Path.Combine(directory, runtime.ToString());
                CanopyHtmlAssets.WriteTo(target, naming, runtime);
                foreach (var name in new[] { "highlight", "layouts" }) {
                    var part = CanopyHtmlAssets.GetPart(name);
                    Assert.Equal(part.Script, File.ReadAllText(Path.Combine(target, part.GetScriptFileName(naming))));
                    Assert.Equal(part.Style, File.ReadAllText(Path.Combine(target, part.GetStyleFileName(naming)!)));
                }
            }
        } finally { Directory.Delete(directory, true); }
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
