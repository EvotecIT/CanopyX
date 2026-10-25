using System.Text.Json;
using Xunit;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests;

public sealed class AggregateDisplayTests {
    private static JsonDocument Vectors() => JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "aggregate-display.json")));
    public static IEnumerable<object[]> Cases() {
        using var vectors = Vectors();
        foreach (var item in vectors.RootElement.EnumerateArray()) yield return new object[] { item.GetProperty("id").GetString()! };
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void SharedDisplayVectorsMatch(string id) {
        using var vectors = Vectors();
        var item = vectors.RootElement.EnumerateArray().Single(vector => vector.GetProperty("id").GetString() == id);
        double?[] Read(JsonElement array) => array.EnumerateArray().Select(value => value.ValueKind == JsonValueKind.Null ? (double?)null : value.GetDouble()).ToArray();
        double? Scalar(string name) => item.TryGetProperty(name, out var value) ? value.GetDouble() : null;
        var expected = Read(item.GetProperty("expected"));
        var mode = Enum.Parse<CanopyShowAs>(item.GetProperty("mode").GetString()!, true);
        var actual = CanopyAggregateDisplay.Evaluate(Read(item.GetProperty("values")), mode, Scalar("grand"), Scalar("parent"),
            item.TryGetProperty("rows", out var rows) ? Read(rows) : null, item.TryGetProperty("columns", out var columns) ? Read(columns) : null);
        Assert.Equal(expected.Length, actual.Count);
        for (var index = 0; index < expected.Length; index++) {
            if (!expected[index].HasValue) Assert.Null(actual[index]);
            else { Assert.NotNull(actual[index]); Assert.Equal(expected[index]!.Value, actual[index]!.Value, 12); }
        }
        Assert.Equal(CanopyAggregateDisplay.IsPercentage(mode) ? "0.00%" : mode == CanopyShowAs.Rank ? "0" : "0.00", CanopyAggregateDisplay.NumberFormat(mode));
    }

    [Fact]
    public void SummaryDisplayUsesTheCorrectParentAndKeepsRawAggregates() {
        var view = new CanopyDataGridView("shares", "Shares") { Reporting = new CanopyGridReporting { Groupable = true } };
        view.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true });
        view.Columns.Add(new CanopyColumn("category", "Category") { Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number });
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("region")); view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("category"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("total", "amount", CanopyGridAggregateOperation.Sum, "Total").ShowValuesAs(CanopyShowAs.PercentParent));
        CanopyGridGroup Group(string key, string value, int offset, int count, double amount) {
            var group = new CanopyGridGroup(key, new CanopyCell(value), offset, count); group.Aggregates["total"] = amount; return group;
        }
        var summary = new CanopyGridSummary(new CanopyGridQuery(view.Id) { Revision = "r1" }, 3);
        var north = Group("north", "North", 0, 2, 30); north.Groups.Add(Group("north-a", "A", 0, 1, 10)); north.Groups.Add(Group("north-b", "B", 1, 1, 20));
        var south = Group("south", "South", 2, 1, 20); south.Groups.Add(Group("south-a", "A", 2, 1, 20));
        summary.Groups.Add(north); summary.Groups.Add(south); summary.Aggregates["total"] = 50;
        var shown = CanopyAggregateDisplay.FromSummary(view, summary);
        ProtocolSchema.AssertValid(view.ToJson(), "aggregate display definition");
        Assert.Equal(0.6, shown.Groups["north"]["total"].Value);
        Assert.Equal(1d / 3, shown.Groups["north-a"]["total"].Value);
        Assert.Equal(1, shown.Groups["south-a"]["total"].Value);
        Assert.Equal("0.00%", shown.Groups["north-a"]["total"].NumberFormat);
        Assert.Equal(30, north.Aggregates["total"]); Assert.Equal(50, summary.Aggregates["total"]);
        var html = CanopyStaticHtml.RenderGridSummary(view, summary);
        Assert.Contains("as % of parent", html); Assert.Contains("33.33", html); Assert.DoesNotContain("<script", html);
        var rank = CanopyAggregateDisplay.FromSummary(view, summary, new Dictionary<string, CanopyShowAs> { ["total"] = CanopyShowAs.Rank });
        Assert.Equal(1, rank.Groups["north"]["total"].Value); Assert.Equal(2, rank.Groups["south"]["total"].Value);
    }
}
