using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json;
using Xunit;

namespace CanopyX.Tests.Grids;

public sealed class GridOrderingTests {
    [Fact]
    public void SharedFixture_OrdersLikeTheBrowserAcrossModesDirectionsAndStableTies() {
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(RepositoryPaths.Root, "tests", "fixtures", "grid-ordering.json")));
        foreach (var item in fixture.RootElement.EnumerateArray()) {
            var name = item.GetProperty("text").GetString()!;
            var order = (CanopyGridTextOrder)Enum.Parse(typeof(CanopyGridTextOrder), char.ToUpperInvariant(name[0]) + name.Substring(1));
            var categories = item.TryGetProperty("categories", out var categoryList) ? categoryList.EnumerateArray().Select(value => value.GetString()!).ToArray() : null;
            var policy = new CanopyGridOrdering(order, categories);
            var values = item.GetProperty("values").EnumerateArray().Select(value => value.GetString()).ToArray();
            foreach (var descending in new[] { false, true }) {
                var ids = Enumerable.Range(0, values.Length).ToArray();
                Array.Sort(ids, (a, b) => {
                    var result = values[a] == null || values[b] == null ? policy.Compare(values[a], values[b]) :
                        (descending ? -1 : 1) * policy.Compare(values[a], values[b]);
                    return result == 0 ? a.CompareTo(b) : result;
                });
                Assert.Equal(item.GetProperty(descending ? "descending" : "ascending").EnumerateArray().Select(value => value.GetInt32()), ids);
            }
        }
    }

    [Fact]
    public void TextPolicy_UsesFrozenFoldingNaturalMagnitudeAndCategoriesWithoutCulture() {
        var ordinal = new CanopyGridOrdering();
        Assert.True(ordinal.Compare("item10", "item2") < 0);
        var natural = new CanopyGridOrdering(CanopyGridTextOrder.FoldedNatural);
        Assert.True(natural.Compare("ITEM2", "item10") < 0);
        Assert.Equal(0, natural.Compare("item0002", "ITEM2"));
        Assert.Equal(0, natural.Compare("ŁÓDŹ", "łódź"));
        Assert.True(natural.Compare("x9007199254740992", "x9007199254740993") < 0);
        Assert.True(natural.Compare("x99999999999999999999", "x100000000000000000000") < 0);
        Assert.True(natural.Compare("", "x") < 0);
        Assert.True(natural.Compare(null, "x") > 0);
        var categories = new[] { "Critical", "Warning", "Healthy" };
        var policy = new CanopyGridOrdering(CanopyGridTextOrder.FoldedNatural, categories);
        categories[0] = "Mutated";
        Assert.True(policy.Compare("critical", "Healthy") < 0);
        Assert.True(policy.Compare("HEALTHY", "Other") < 0);
        Assert.True(policy.Compare("Other2", "Other10") < 0);
        Assert.Equal("Critical", policy.Categories[0]);
        Assert.Throws<ArgumentException>(() => new CanopyGridOrdering(CanopyGridTextOrder.FoldedOrdinal, new[] { "A", "a" }));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridOrdering((CanopyGridTextOrder)99));
    }

    [Fact]
    public void ReportingDefinition_BindsPoliciesAndSelectsTheOptionalRuntime() {
        var view = new CanopyDataGridView("ordering", "Ordered inventory");
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        Assert.Equal(CanopyRuntime.DataGrid, CanopyHtmlAssets.GetRuntime(view));
        view.Reporting = new CanopyGridReporting();
        view.GetColumn("name").Ordering = new CanopyGridOrdering(CanopyGridTextOrder.Natural, new[] { "Pinned" });
        ProtocolSchema.AssertValid(view.ToJson(), "reporting ordering");
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        Assert.Contains("canopyx-reporting.js", view.ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetNaming = CanopyAssetNaming.Plain }));
        view.GetColumn("name").Sortable = false;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }
}
