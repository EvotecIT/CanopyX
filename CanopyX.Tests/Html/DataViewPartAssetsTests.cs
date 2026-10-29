using System.IO.Compression;
using System.Text;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Html;

public sealed class DataViewPartAssetsTests {
    [Fact]
    public void SingleFileComparisonCarriesItsControlsAndPresenterWhileOrdinaryViewsStaySmall() {
        var plain = new CanopyDataGridView("plain", "Inventory");
        plain.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(plain), part => part.Name is "compare" or "view-intents");

        var before = new CanopyGridRow("one"); before.Cells["name"] = "Earlier";
        var after = new CanopyGridRow("one"); after.Cells["name"] = "Later";
        var view = CanopyDatasetComparer.Compare(new[] { before }, new[] { after }).ToView("compare", "Changes", plain.Columns);
        ProtocolSchema.AssertValid(view.ToJson(), "Comparison with an additive before/after presenter");
        var required = CanopyHtmlAssets.GetRequiredParts(view);
        Assert.Contains(required, part => part.Name == "compare");
        Assert.Contains(required, part => part.Name == "presenters");
        Assert.DoesNotContain(required, part => part.Name == "view-intents");
        var html = view.ToHtmlFragment();
        Assert.Contains("application/x-canopyx-compare", html);
        Assert.Contains("application/x-canopyx-presenters", html);
        Assert.DoesNotContain("application/x-canopyx-view-intents", html);
    }

    [Fact]
    public void ExplicitViewIntentOptInCarriesOfflinePreviewPayloadAndMatchesSchema() {
        var view = new CanopyDataGridView("inventory", "Inventory") { ViewIntents = true };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        ProtocolSchema.AssertValid(view.ToJson(), "Opt-in view intents");
        var html = view.ToHtmlFragment();
        Assert.Contains("application/x-canopyx-view-intents", html);
        Assert.Contains("application/x-canopyx-view-intents-style", html);
        view.ViewIntents = false;
        Assert.DoesNotContain("application/x-canopyx-view-intents", view.ToHtmlFragment());
    }

    [Theory]
    [InlineData("compare", 4096)]
    [InlineData("view-intents", 8192)]
    public void DataViewPartsHaveIndependentSizeGuardsAndShipWithGridRuntimes(string name, int guard) {
        var part = CanopyHtmlAssets.GetPart(name);
        Assert.True(Gzip(part.Script) + Gzip(part.Style ?? "") <= guard, name + " exceeded its independent gzip guard.");
        Assert.True(part.IsShippedWith(CanopyRuntime.DataGrid));
        Assert.True(part.IsShippedWith(CanopyRuntime.ReportingGrid));
        Assert.False(part.IsShippedWith(CanopyRuntime.TreeGrid));
    }

    private static long Gzip(string content) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) {
            var bytes = Encoding.UTF8.GetBytes(content); gzip.Write(bytes);
        }
        return output.Length;
    }
}
