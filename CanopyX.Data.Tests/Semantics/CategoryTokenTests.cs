using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class CategoryTokenTests {
    [Theory]
    [InlineData(ProviderKind.Reference, CanopyGridTextOrder.FoldedOrdinal, "a", "A")]
    [InlineData(ProviderKind.Linq, CanopyGridTextOrder.FoldedOrdinal, "a", "A")]
    [InlineData(ProviderKind.Reference, CanopyGridTextOrder.Natural, "item1", "item01")]
    [InlineData(ProviderKind.Linq, CanopyGridTextOrder.Natural, "item1", "item01")]
    public async Task LabelsOnlyFacetsKeepDistinctKeysWhenDisplayOrderingTies(ProviderKind kind, CanopyGridTextOrder order, string first, string second) {
        var view = Fleet.View(); var column = view.GetColumn("site");
        column.ValueLabels.Add(first, "First"); column.ValueLabels.Add(second, "Second"); column.Ordering = new CanopyGridOrdering(order);
        var harness = new Harness(new[] { new Host { Id = 1, Site = first }, new Host { Id = 2, Site = second } }, kind, view: view);
        var expected = new[] { first, second }.OrderBy(value => value, StringComparer.Ordinal).ToArray();
        foreach (var limit in new[] { 1, 20 }) {
            using var facet = JsonDocument.Parse(await harness.Handler.FacetAsync("{\"column\":\"site\",\"limit\":" + limit + ",\"query\":{\"revision\":\"r1\"}}"));
            Assert.Equal(2, facet.RootElement.GetProperty("totalValues").GetInt32());
            var items = facet.RootElement.GetProperty("items").EnumerateArray().ToArray();
            Assert.Equal(expected.Take(limit), items.Select(item => item.GetProperty("value").GetString()));
            Assert.All(items, item => Assert.Equal(1, item.GetProperty("count").GetInt32()));
        }
    }
    [Theory]
    [InlineData(ProviderKind.Reference)]
    [InlineData(ProviderKind.Linq)]
    public async Task BooleanColumnsIgnoreStringCategoryRanks(ProviderKind kind) {
        var view = Fleet.View(); var column = view.GetColumn("online");
        column.ValueOrder.Add("true"); column.ValueOrder.Add("false");
        column.ValueLabels.Add("true", "String true");
        var harness = new Harness(new[] { new Host { Id = 1, Online = true }, new Host { Id = 2, Online = false } }, kind, view: view);
        var result = await harness.Ids(Harness.Where("", sort: "[{\"column\":\"online\",\"direction\":\"asc\"}]"));
        Assert.Equal(new[] { "2", "1" }, result.Ids);
        using var facets = JsonDocument.Parse(await harness.Handler.FacetAsync("{\"column\":\"online\",\"limit\":20,\"query\":{\"revision\":\"r1\"}}"));
        Assert.Equal(JsonValueKind.False, facets.RootElement.GetProperty("items")[0].GetProperty("value").ValueKind);
    }
    [Theory]
    [InlineData(ProviderKind.Reference, false)]
    [InlineData(ProviderKind.Reference, true)]
    [InlineData(ProviderKind.Linq, false)]
    [InlineData(ProviderKind.Linq, true)]
    public async Task CaseDistinctTokensAreIndependentOnlyForDeclaredCategories(ProviderKind kind, bool configured) {
        var view = Fleet.View(); var column = view.GetColumn("site");
        if (configured) { column.ValueLabels.Add("A", "Upper category"); column.ValueLabels.Add("a", "Lower category"); column.ValueOrder.Add("a"); column.ValueOrder.Add("A"); }
        var harness = new Harness(new[] { new Host { Id = 1, Name = "Upper", Site = "A" }, new Host { Id = 2, Name = "Lower", Site = "a" } }, kind, view: view);
        var filter = "{\"column\":\"site\",\"operator\":\"eq\",\"values\":[\"A\"]}";
        var result = await harness.Ids(Harness.Where(filter));
        Assert.Equal(configured ? new[] { "1" } : new[] { "2", "1" }, result.Ids);
        using var facets = JsonDocument.Parse(await harness.Handler.FacetAsync("{\"column\":\"site\",\"limit\":20,\"query\":{\"revision\":\"r1\"}}"));
        var items = facets.RootElement.GetProperty("items");
        Assert.Equal(configured ? 2 : 1, items.GetArrayLength());
        Assert.Equal(configured ? "a" : "A", items[0].GetProperty("value").GetString());
        Assert.Equal(configured ? 1 : 2, items[0].GetProperty("count").GetInt32());
    }
}
