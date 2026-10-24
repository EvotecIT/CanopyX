using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class CategoryFacetLabelSearchTests {
    [Theory]
    [InlineData(ProviderKind.Reference)]
    [InlineData(ProviderKind.Linq)]
    public async Task HostedFacetSearchFindsDisplayLabelsBeforeApplyingTheLimit(ProviderKind kind) {
        var view = Fleet.View(); var column = view.GetColumn("site");
        column.ValueLabels.Add("fail", "Needs review"); column.ValueLabels.Add("pass", "Verified");
        var harness = new Harness(Enumerable.Range(1, 205).Select(i => new Host { Id = i, Site = i == 205 ? "fail" : "category-" + i.ToString("D3") }).ToArray(), kind, view: view);
        using var response = JsonDocument.Parse(await harness.Handler.FacetAsync("{\"column\":\"site\",\"search\":\"review\",\"limit\":1,\"query\":{\"revision\":\"r1\"}}"));
        var result = response.RootElement;
        Assert.Equal(205, result.GetProperty("matched").GetInt32());
        Assert.Equal(1, result.GetProperty("totalValues").GetInt32());
        var item = Assert.Single(result.GetProperty("items").EnumerateArray());
        Assert.Equal("fail", item.GetProperty("value").GetString());
        Assert.Equal(1, item.GetProperty("count").GetInt32());
    }

}
