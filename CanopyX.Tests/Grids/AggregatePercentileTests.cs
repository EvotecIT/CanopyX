using System.Text.Json;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;
using Xunit;

namespace CanopyX.Tests;

/// <summary>Medians and percentiles: tests/fixtures/aggregate-percentile.json holds the vectors the browser checks too
/// (grid-percentile.spec.mjs); both must produce the same binary64 value.</summary>
public sealed class AggregatePercentileTests {
    private static JsonDocument Vectors() => JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "aggregate-percentile.json")));
    public static IEnumerable<object[]> Cases() {
        using var vectors = Vectors();
        foreach (var item in vectors.RootElement.EnumerateArray()) yield return new object[] { item.GetProperty("id").GetString()! };
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void SharedVectorsMatchExactly(string id) {
        using var vectors = Vectors();
        var item = vectors.RootElement.EnumerateArray().Single(vector => vector.GetProperty("id").GetString() == id);
        var aggregate = item.GetProperty("operation").GetString() == "median"
            ? new CanopyGridAggregate("value", "amount", CanopyGridAggregateOperation.Median, "Amount")
            : CanopyGridAggregate.AtPercentile("value", "amount", item.GetProperty("percentile").GetDouble(), "Amount");
        var cells = item.GetProperty("values").EnumerateArray().Select(value => value.ValueKind == JsonValueKind.Null ? null : new CanopyCell(value.GetDouble())).ToArray();
        var expected = item.GetProperty("expected");
        var actual = aggregate.Evaluate(cells);
        if (expected.ValueKind == JsonValueKind.Null) Assert.Null(actual);
        else Assert.Equal(expected.GetDouble(), actual);
    }

    [Theory]
    [InlineData(0d)]
    [InlineData(100d)]
    [InlineData(-1d)]
    [InlineData(double.NaN)]
    public void PercentileIsBetweenZeroAndOneHundredExclusive(double percentile) {
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridAggregate.AtPercentile("p", "amount", percentile, "Amount"));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridAggregate("p", "amount", CanopyGridAggregateOperation.Percentile, "Amount"));
    }

    [Fact]
    public void DefinitionWritesThePercentileAndStaticOutputNamesIt() {
        var view = new CanopyDataGridView("latency", "Latency") { Reporting = new CanopyGridReporting { Groupable = true } };
        view.Columns.Add(new CanopyColumn("service", "Service") { Sortable = true, Filterable = true });
        view.Columns.Add(new CanopyColumn("duration", "Duration") { Kind = CanopyColumnKind.Number, Format = CanopyGridNumberFormat.Fixed(1) });
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("service"));
        view.Reporting.Aggregates.Add(CanopyGridAggregate.AtPercentile("p95", "duration", 95, "Duration"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("median", "duration", CanopyGridAggregateOperation.Median, "Duration"));
        var footer = new CanopyGridFooter("totals", "Totals"); footer.Aggregates.Add(CanopyGridAggregate.AtPercentile("p95", "duration", 95, "P95")); view.Footers.Add(footer);
        for (var i = 1; i <= 20; i++) {
            var row = new CanopyGridRow("r" + i);
            row.Cells["service"] = new CanopyCell(i % 2 == 0 ? "api" : "web"); row.Cells["duration"] = new CanopyCell((double)i);
            view.Rows.Add(row);
        }
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "percentile aggregates");
        using var document = JsonDocument.Parse(json);
        var aggregates = document.RootElement.GetProperty("reporting").GetProperty("aggregates");
        Assert.Equal("percentile", aggregates[0].GetProperty("operation").GetString());
        Assert.Equal(95, aggregates[0].GetProperty("percentile").GetDouble());
        Assert.Equal("median", aggregates[1].GetProperty("operation").GetString());
        Assert.False(aggregates[1].TryGetProperty("percentile", out _));
        // The column's format applies: P95 of 1..20 is 19.05, shown with one fraction digit.
        Assert.Contains("P95: 19.1", CanopyStaticHtml.RenderGrid(view), StringComparison.Ordinal);
        var pivot = new CanopyGridPivot { Rows = { new("service") }, Values = { "p95", "median" } };
        string Pivot() => System.Net.WebUtility.HtmlDecode(CanopyStaticHtml.RenderGridPivot(view, CanopyPivot.Compute(view, pivot, view.Rows)));
        Assert.Contains("Duration · P95", Pivot(), StringComparison.Ordinal);
        Assert.Contains("Duration · Median", Pivot(), StringComparison.Ordinal);
        view.Labels = CanopyLabels.Polish();
        Assert.Contains("Duration · Mediana", Pivot(), StringComparison.Ordinal);
    }

    [Fact]
    public void AnIdentityCannotChangeItsPercentile() {
        var view = new CanopyDataGridView("latency", "Latency") { Reporting = new CanopyGridReporting() };
        view.Columns.Add(new CanopyColumn("duration", "Duration") { Kind = CanopyColumnKind.Number });
        view.Reporting.Aggregates.Add(CanopyGridAggregate.AtPercentile("tail", "duration", 95, "Duration"));
        var footer = new CanopyGridFooter("totals", "Totals"); footer.Aggregates.Add(CanopyGridAggregate.AtPercentile("tail", "duration", 99, "Duration")); view.Footers.Add(footer);
        Assert.Throws<InvalidOperationException>(() => view.GetSummaryAggregates());
    }
}
