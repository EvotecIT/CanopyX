using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>The facet panel: its view settings, their checks, and the facets part.</summary>
public sealed class GridFacetPanelTests {
    [Fact]
    public void FacetPanel_WritesColumnsAsIdsOrObjectsAndOnlyChangedSettings() {
        var view = Grid();
        Assert.Null(JsonNode.Parse(view.ToJson())!["facets"]);
        view.FacetPanel = new CanopyFacetPanel().Add("site").Add("load");
        Assert.Equal("{\"columns\":[\"site\",\"load\"]}", JsonNode.Parse(view.ToJson())!["facets"]!.ToJsonString());
        view.FacetPanel = new CanopyFacetPanel { Position = CanopyFacetPosition.Top, Open = false, Collapsible = false, Width = 300, Label = "Refine" };
        view.FacetPanel.Facets.Add(new CanopyFacet("site") { Kind = CanopyFacetKind.List, Label = "Where", Limit = 5, Sort = CanopyFacetSort.Value, Collapsed = true });
        view.FacetPanel.Facets.Add(new CanopyFacet("load") { Bins = 10 });
        Assert.Equal("{\"columns\":[{\"column\":\"site\",\"kind\":\"list\",\"label\":\"Where\",\"limit\":5,\"sort\":\"value\",\"collapsed\":true},{\"column\":\"load\",\"bins\":10}]," +
            "\"position\":\"top\",\"open\":false,\"collapsible\":false,\"width\":300,\"label\":\"Refine\"}", JsonNode.Parse(view.ToJson())!["facets"]!.ToJsonString());
        ProtocolSchema.AssertValid(view.ToJson(), "a grid with a facet panel");
    }

    [Fact]
    public void FacetPanel_RefusesUnknownRepeatedAndUnfitColumns() {
        var view = Grid();
        view.FacetPanel = new CanopyFacetPanel();
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.FacetPanel = new CanopyFacetPanel().Add("missing");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.FacetPanel = new CanopyFacetPanel().Add("site").Add("site");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.FacetPanel = new CanopyFacetPanel().Add("site", CanopyFacetKind.Range);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyFacetPanel { Width = 100 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyFacet("load") { Bins = 1 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyFacet("load") { Limit = 0 });
        Assert.Throws<ArgumentException>(() => new CanopyFacet("load") { Label = " " });
        // A hosted grid's facets must be declared facet columns, which its source answers.
        var hosted = new CanopyDataGridView("hosted", "Hosted") { Source = CanopyGridSource.HostedOffset() };
        hosted.Columns.Add(new CanopyColumn("site", "Site"));
        hosted.FacetPanel = new CanopyFacetPanel().Add("site");
        Assert.Throws<InvalidOperationException>(() => hosted.ToJson());
        hosted.Reporting = new CanopyGridReporting();
        hosted.Reporting.FacetColumns.Add("site");
        Assert.Contains("\"facets\":{\"columns\":[\"site\"]}", hosted.ToJson());
    }

    [Fact]
    public void FacetsPart_IsVersionedBoundedOutsideTheEntryPointsAndCarriedByFacetViewsOnly() {
        var part = CanopyHtmlAssets.GetPart("facets");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Equal("facet panel", part.Label);
        Assert.False(part.IsShippedWith(CanopyRuntime.TreeGrid));
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            Assert.True(part.IsShippedWith(runtime));
            Assert.Contains("setFacetPanelOpen", CanopyHtmlAssets.GetScript(runtime));
            Assert.DoesNotContain("function facetOptions(", CanopyHtmlAssets.GetScript(runtime));
            Assert.DoesNotContain("cx-facet-frame", CanopyHtmlAssets.GetStyle(runtime));
        }
        Assert.Contains("function facetOptions(", part.Script);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        // The new part's size plus about 15%.
        Assert.True(Gzip(part.Script) <= 11264, "The facets part is " + Gzip(part.Script) + " bytes gzip; the guard is 11 KiB (about 9.2 KiB plus headroom).");
        Assert.True(Gzip(part.Style!) <= 2304, "The facets stylesheet is " + Gzip(part.Style!) + " bytes gzip; the guard is 2.25 KiB (about 1.9 KiB plus headroom).");
        var plain = Grid();
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(plain), item => item.Name == "facets");
        var faceted = Grid();
        faceted.FacetPanel = new CanopyFacetPanel().Add("site");
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(faceted), item => item.Name == "facets");
        Assert.Contains("<script type=\"application/x-canopyx-facets\" data-cx-version=\"" + part.Version + "\">", faceted.ToHtmlFragment());
    }

    [Fact]
    public void LabelPacks_TranslateTheFacetPanelTexts() {
        foreach (var labels in new[] { CanopyLabels.Polish(), CanopyLabels.German(), CanopyLabels.Spanish(), CanopyLabels.French(), CanopyLabels.Italian() }) {
            Assert.NotEqual(new CanopyLabels().GridFacetPanel, labels.GridFacetPanel);
            Assert.Contains("{column}", labels.GridFacetHistogram);
            foreach (var placeholder in new[] { "{from}", "{to}", "{count}" }) Assert.Contains(placeholder, labels.GridFacetBin);
        }
    }

    private static CanopyDataGridView Grid() {
        var grid = new CanopyDataGridView("services", "Services");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        grid.Columns.Add(new CanopyColumn("site", "Site"));
        grid.Columns.Add(new CanopyColumn("load", "Load") { Kind = CanopyColumnKind.Number });
        return grid;
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
