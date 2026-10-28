using System.Text.Json;
using CanopyX.Html;

namespace CanopyX.Tests.Grids;

public sealed class AnalystBoundaryTests {
    [Theory]
    [InlineData("1e16")]
    [InlineData("-1e16")]
    [InlineData("[input] * 2")]
    public void CalculatedNumberOutsideTheWireMagnitude_IsACellErrorAndPropagates(string expression) {
        var view = new CanopyDataGridView("bounds", "Bounds");
        view.Columns.Add(new CanopyColumn("input", "Input") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(Calculated("wide", CanopyColumnKind.Number, expression));
        view.Columns.Add(Calculated("dependent", CanopyColumnKind.Number, "[wide] / 10"));
        view.Columns.Add(Calculated("independent", CanopyColumnKind.Number, "7"));
        var row = new CanopyGridRow("r"); row.Cells["input"] = 8e15; view.Rows.Add(row);
        var result = new CanopyCalculationSet(view.Columns).Apply(row);
        Assert.Null(result.Cells["wide"].Value);
        Assert.Contains("number-range", result.Cells["wide"].Title);
        Assert.Null(result.Cells["dependent"].Value);
        Assert.Contains("number-range", result.Cells["dependent"].Title);
        Assert.Equal(7d, result.Cells["independent"].Value);
        using var json = JsonDocument.Parse(view.ToJson());
        var error = json.RootElement.GetProperty("rows")[0].GetProperty("cells").GetProperty("wide");
        Assert.Equal("#ERROR", error.GetProperty("text").GetString());
        Assert.False(error.TryGetProperty("value", out var raw) && raw.ValueKind != JsonValueKind.Null);
        Assert.Equal(1e16, CanopyCalculation.Parse("1e16").Evaluate(_ => null).Value);
    }

    [Theory]
    [InlineData("2026-10-25", "2026-10-25T00:00:00Z")]
    [InlineData("2026-10-25T01:30:00+02:00", "2026-10-24T23:30:00Z")]
    [InlineData("2026-10-25T01:30:00.1234567Z", "2026-10-25T01:30:00.123Z")]
    public void CalculatedDateAndDependentText_UseTheSameUtcWireRepresentation(string input, string expected) {
        var view = new CanopyDataGridView("dates", "Dates");
        view.Columns.Add(Calculated("when", CanopyColumnKind.DateTime, JsonSerializer.Serialize(input)));
        view.Columns.Add(Calculated("spelling", CanopyColumnKind.Text, "CONCAT([when])"));
        view.Rows.Add(new CanopyGridRow("r"));
        using var json = JsonDocument.Parse(view.ToJson());
        var cells = json.RootElement.GetProperty("rows")[0].GetProperty("cells");
        Assert.Equal(expected, cells.GetProperty("when").GetString());
        Assert.Equal(expected, cells.GetProperty("spelling").GetString());
    }

    [Theory]
    [InlineData("flat")]
    [InlineData("nested")]
    [InlineData("deep")]
    [InlineData("tuple")]
    public void FilterOnlySingleFileHtml_EmbedsTheRequiredBucketEngine(string shape) {
        var view = FilterOnlyView(shape);
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "buckets");
        var html = view.ToHtmlPage();
        Assert.Contains("application/x-canopyx-buckets", html);
        Assert.DoesNotContain("<script src=", html, StringComparison.OrdinalIgnoreCase);
    }

    internal static CanopyDataGridView FilterOnlyView(string shape) {
        var view = new CanopyDataGridView("bucket-filter", "Bucket filter") { Query = new CanopyGridQuery("bucket-filter") };
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number });
        var filter = new CanopyGridFilter("amount", CanopyGridFilterOperator.Equal, new CanopyCell(0d)) { Bucket = CanopyBucket.FixedWidth(10) };
        if (shape == "flat") view.Query.Filters.Add(filter);
        if (shape == "nested" || shape == "deep") {
            view.Query.FilterGroup = new CanopyGridFilterGroup(CanopyGridFilterJunction.All);
            var current = view.Query.FilterGroup;
            for (var level = 1; level < (shape == "deep" ? 8 : 2); level++) {
                var child = new CanopyGridFilterGroup(CanopyGridFilterJunction.Any); current.Groups.Add(child); current = child;
            }
            current.Filters.Add(filter);
        }
        if (shape == "tuple") view.Query.TupleFilters.Add(new CanopyGridTupleFilter(new[] { new CanopyGridTupleColumn("amount", filter.Bucket) }, new[] { new CanopyCell?[] { new CanopyCell(0d) } }));
        var row = new CanopyGridRow("r"); row.Cells["amount"] = 5; view.Rows.Add(row);
        return view;
    }

    private static CanopyColumn Calculated(string id, CanopyColumnKind kind, string expression) => new CanopyColumn(id, id) { Kind = kind, Calculation = CanopyCalculation.Parse(expression) };
}
