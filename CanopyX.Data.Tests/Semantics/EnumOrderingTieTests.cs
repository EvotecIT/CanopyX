using System.Runtime.Serialization;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class EnumOrderingTieTests {
    public enum Category { [EnumMember(Value = "A")] Upper, [EnumMember(Value = "a")] Lower,
        [EnumMember(Value = "item1")] One, [EnumMember(Value = "item01")] LeadingZero }
    public sealed class Row { public int Id { get; set; } public Category Value { get; set; } }

    [Theory]
    [InlineData(CanopyGridTextOrder.FoldedOrdinal, Category.Lower, Category.Upper, "A", "a")]
    [InlineData(CanopyGridTextOrder.Natural, Category.One, Category.LeadingZero, "item01", "item1")]
    public async Task ComparerEqualEnumTextsTieOnIdentityInEveryProviderButKeepDistinctFacets(CanopyGridTextOrder order,
        Category first, Category second, string firstFacet, string secondFacet) {
        var rows = new[] { new Row { Id = 1, Value = first }, new Row { Id = 2, Value = second } };
        foreach (var kind in new[] { "reference", "canonical", "store" }) {
            var view = new CanopyDataGridView("ties", "Enum ties") { Source = CanopyGridSource.HostedOffset(), Reporting = new CanopyGridReporting() };
            var column = new CanopyColumn("category", "Category") { Sortable = true, Ordering = new CanopyGridOrdering(order) };
            column.ValueLabels.Add(firstFacet, "First label"); column.ValueLabels.Add(secondFacet, "Second label");
            view.Columns.Add(column); view.Reporting.FacetColumns.Add("category");
            var map = new CanopyColumnMap<Row>(view).Key(row => row.Id).Column("category", row => row.Value);
            ICanopyDataProvider provider = kind == "reference"
                ? new CanopyInMemoryProvider<Row>(map.Schema, () => rows, row => row.Id.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    new Dictionary<string, Func<Row, object?>> { ["category"] = row => row.Value }, () => "r1")
                : new CanopyQueryableProvider<Row>(rows.AsQueryable(), map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1"),
                    TextComparison = kind == "store" ? CanopyTextComparison.Lowercase : CanopyTextComparison.Canonical });
            var handler = new CanopyRemoteHandler(map.Schema, provider);
            foreach (var direction in new[] { "asc", "desc" }) {
                using var page = JsonDocument.Parse(await handler.QueryAsync("{\"sort\":[{\"column\":\"category\",\"direction\":\"" + direction + "\"}]}"));
                Assert.Equal(new[] { "1", "2" }, page.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetString()));
            }
            using var facet = JsonDocument.Parse(await handler.FacetAsync("{\"column\":\"category\",\"query\":{\"revision\":\"r1\"}}"));
            Assert.Equal(new[] { firstFacet, secondFacet }, facet.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("value").GetString()));
            Assert.Equal(2, facet.RootElement.GetProperty("totalValues").GetInt32());
            Assert.All(facet.RootElement.GetProperty("items").EnumerateArray(), item => Assert.Equal(1, item.GetProperty("count").GetInt32()));
        }
    }
}
