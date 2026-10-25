using System.Globalization;
using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class CalculationPipelineTests {
    [Fact]
    public async Task CalculatedDateColumns_TruncateFractionalInputsBeforeDependenciesSortAndFilter() {
        var view = new CanopyDataGridView("dates", "Dates") { Source = CanopyGridSource.HostedOffset() };
        view.Columns.Add(new CanopyColumn("raw", "Raw"));
        view.Columns.Add(new CanopyColumn("date", "Date") { Kind = CanopyColumnKind.DateTime, Sortable = true, Calculation = CanopyCalculation.Parse("[raw]") });
        view.Columns.Add(Number("milliseconds", "DATEDIFF(\"millisecond\", \"2026-10-25T01:30:00Z\", [date])"));
        var inputs = new[] { "2026-10-25T01:30:00.1234567Z", "2026-10-25T01:30:00.1249999Z", "2026-10-25T03:30:00.1234567+02:00" };
        var schema = new CanopyDataSchema(view);
        var provider = new CanopyInMemoryProvider<int>(schema, () => Enumerable.Range(0, inputs.Length), index => index.ToString(CultureInfo.InvariantCulture),
            new Dictionary<string, Func<int, object?>> { ["raw"] = index => inputs[index] });
        var page = await provider.QueryAsync(CanopyRequestParser.ParseQuery("{\"sort\":[{\"column\":\"date\",\"direction\":\"desc\"}]}", schema), CancellationToken.None);
        Assert.Equal(new[] { "1", "0", "2" }, page.Rows.Select(row => row.Id));
        Assert.Equal(new object?[] { 124d, 123d, 123d }, page.Rows.Select(row => row.Cells["milliseconds"].Value));
        Assert.All(page.Rows, row => {
            var date = Assert.IsType<DateTime>(row.Cells["date"].Value);
            Assert.Equal(DateTimeKind.Utc, date.Kind);
            Assert.Equal(0, date.Ticks % TimeSpan.TicksPerMillisecond);
            Assert.Equal(inputs[int.Parse(row.Id, CultureInfo.InvariantCulture)], row.Cells["raw"].Value);
        });
        var filtered = await provider.QueryAsync(CanopyRequestParser.ParseQuery("{\"filters\":[{\"column\":\"date\",\"operator\":\"ge\",\"values\":[\"2026-10-25T01:30:00.124Z\"]}]}", schema), CancellationToken.None);
        Assert.Equal("1", Assert.Single(filtered.Rows).Id);
    }

    [Fact]
    public async Task Calculations_PrecedeSortFilterSearchFacetsGroupsSummaryAndExport() {
        var view = View();
        var schema = new CanopyDataSchema(view);
        var provider = Provider(schema);
        var query = CanopyRequestParser.ParseQuery("{\"sort\":[{\"column\":\"net\",\"direction\":\"desc\"}],\"filters\":[{\"column\":\"net\",\"operator\":\"ge\",\"values\":[15]}]}", schema);
        var page = await provider.QueryAsync(query, CancellationToken.None);
        Assert.Equal(4, page.Total);
        Assert.Equal(2, page.Matched);
        Assert.Equal(new[] { "b", "c" }, page.Rows.Select(row => row.Id));
        Assert.Equal(new object?[] { 30d, 20d }, page.Rows.Select(row => row.Cells["net"].Value));
        Assert.Equal(2, await provider.CountAsync(query, CancellationToken.None));

        var export = new List<CanopyGridRow>();
        await foreach (var row in provider.ReadAsync(query, CancellationToken.None)) export.Add(row);
        Assert.Equal(new[] { "b", "c" }, export.Select(row => row.Id));
        Assert.Equal(new object?[] { 30d, 20d }, export.Select(row => row.Cells["net"].Value));

        var facet = await provider.FacetAsync(CanopyRequestParser.ParseFacet("{\"column\":\"band\",\"query\":{\"revision\":\"r1\"}}", schema), CancellationToken.None);
        Assert.Equal(new object?[] { "high", "low" }, facet.Items.Select(item => item.Value));
        Assert.Equal(new[] { 2, 2 }, facet.Items.Select(item => item.Count));
        var summary = await provider.SummarizeAsync(CanopyRequestParser.ParseSummary("{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"band\",\"direction\":\"asc\"}]}", schema), CancellationToken.None);
        Assert.Equal(60d, summary.Aggregates["sum"]);
        var groups = summary.Groups.OrderBy(group => group.Value as string, StringComparer.Ordinal).ToArray();
        Assert.Equal(new object?[] { "high", "low" }, groups.Select(group => group.Value));
        Assert.Equal(new double?[] { 50d, 10d }, groups.Select(group => group.Aggregates["sum"]));
        var search = await provider.QueryAsync(CanopyRequestParser.ParseQuery("{\"search\":\"high\"}", schema), CancellationToken.None);
        Assert.Equal(new[] { "b", "c" }, search.Rows.Select(row => row.Id));
    }

    [Fact]
    public async Task CapturedSchema_PreservesProgramsKindsAndDependencyInputsOutsideOutputAllowList() {
        var view = View();
        view.Reporting = null;
        var schema = new CanopyDataSchema(view, new[] { "band", "net" });
        view.GetColumn("net").Calculation = CanopyCalculation.Parse("999");
        view.GetColumn("net").Kind = CanopyColumnKind.Text;
        view.GetColumn("base").Kind = CanopyColumnKind.Text;
        var detached = schema.GetColumn("net").Definition;
        detached.Calculation = CanopyCalculation.Parse("888");
        Assert.Equal("[base] * 2 - [fee]", schema.GetColumn("net").Definition.Calculation!.Expression);

        var page = await Provider(schema).QueryAsync(CanopyRequestParser.ParseQuery("{}", schema), CancellationToken.None);

        Assert.Equal(new object?[] { 10d, 30d, 20d, 0d }, page.Rows.Select(row => row.Cells["net"].Value));
        Assert.Equal(new[] { "low", "high", "high", "low" }, page.Rows.Select(row => row.Cells["band"].Value));
        Assert.All(page.Rows, row => Assert.Equal(new[] { "band", "net" }, row.Cells.Keys));
    }

    [Fact]
    public async Task ErrorCells_QueryAsNullKeepTooltipsAndDoNotPoisonIndependentColumns() {
        var view = View();
        view.Labels.GridCalculationError = "Failed: {error}";
        view.Columns.Add(Number("bad", "[base] / 0"));
        view.Columns.Add(Number("dependent", "[bad] + 1"));
        view.Columns.Add(Number("independent", "[base] + 1"));
        view.Reporting!.FacetColumns.Add("bad");
        view.Reporting!.Aggregates.Add(new CanopyGridAggregate("bad-count", "bad", CanopyGridAggregateOperation.Count, "Bad count"));
        var schema = new CanopyDataSchema(view);
        view.Labels.GridCalculationError = "changed {error}";
        var provider = Provider(schema);
        var query = CanopyRequestParser.ParseQuery("{\"filters\":[{\"column\":\"bad\",\"operator\":\"isNull\",\"values\":[]}]}", schema);
        var page = await provider.QueryAsync(query, CancellationToken.None);
        Assert.Equal(4, page.Matched);
        Assert.All(page.Rows, row => {
            Assert.Null(row.Cells["bad"].Value);
            Assert.Equal("#ERROR", row.Cells["bad"].Text);
            Assert.Equal("Failed: divide-by-zero", row.Cells["dependent"].Title);
            Assert.IsType<double>(row.Cells["independent"].Value);
        });
        var summary = await provider.SummarizeAsync(CanopyRequestParser.ParseSummary("{\"revision\":\"r1\"}", schema), CancellationToken.None);
        Assert.Equal(0d, summary.Aggregates["bad-count"]);
        var facet = await provider.FacetAsync(CanopyRequestParser.ParseFacet("{\"column\":\"bad\",\"query\":{\"revision\":\"r1\"}}", schema), CancellationToken.None);
        var missing = Assert.Single(facet.Items);
        Assert.Null(missing.Value);
        Assert.Equal(4, missing.Count);
        await foreach (var row in provider.ReadAsync(query, CancellationToken.None)) {
            Assert.Null(row.Cells["dependent"].Value);
            Assert.Equal("#ERROR", row.Cells["dependent"].Text);
        }
    }

    [Fact]
    public async Task PivotAndScriptFreeSummary_UseTheSameCalculatedRawValues() {
        var view = View(); var schema = new CanopyDataSchema(view); var provider = Provider(schema);
        var definition = new CanopyGridPivot(); definition.Rows.Add(new CanopyGridGroupLevel("band")); definition.Values.Add("sum");
        var actual = await provider.PivotAsync(new CanopyPivotRequest(CanopyRequestParser.ParseQuery("{}", schema), definition), CancellationToken.None);
        var inline = View(); inline.Source = CanopyGridSource.Inline();
        foreach (var input in Records) {
            var row = new CanopyGridRow(input.Id); row.Cells["base"] = input.Base; row.Cells["fee"] = input.Fee;
            inline.Rows.Add(row);
        }
        var expected = CanopyPivot.Compute(inline, definition, inline.Rows);
        Assert.Equal(expected.ToJson(), actual.ToJson());

        var summary = await provider.SummarizeAsync(CanopyRequestParser.ParseSummary("{\"revision\":\"r1\"}", schema), CancellationToken.None);
        var accepted = new CanopyGridSummary(new CanopyGridQuery(view.Id) { Revision = "r1", Limit = view.PageSize }, summary.Matched);
        foreach (var pair in summary.Aggregates) accepted.Aggregates.Add(pair);
        var html = CanopyStaticHtml.RenderGridSummary(view, accepted, new CanopyStaticHtmlOptions { Culture = CultureInfo.InvariantCulture });
        Assert.Contains(">60<", html);
        Assert.DoesNotContain("<script", html);
    }

    [Fact]
    public async Task Provider_RequiresBaseAccessorsButDoesNotInvokeCalculatedAccessors() {
        var view = View(); var schema = new CanopyDataSchema(view);
        var accessors = Accessors();
        accessors.Add("net", _ => throw new InvalidOperationException("Calculated accessors must not run."));
        var provider = new CanopyInMemoryProvider<Input>(schema, () => Records, item => item.Id, accessors);
        var result = await provider.QueryAsync(CanopyRequestParser.ParseQuery("{}", schema), CancellationToken.None);
        Assert.Equal(10d, result.Rows[0].Cells["net"].Value);
        accessors.Remove("base");
        Assert.Throws<ArgumentException>(() => new CanopyInMemoryProvider<Input>(schema, () => Records, item => item.Id, accessors));
    }

    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("grid", "Grid") { Source = CanopyGridSource.HostedOffset(), Reporting = new CanopyGridReporting { Groupable = true, Pivotable = true } };
        // Deliberately place the dependent column before its inputs and use a different schema output order.
        view.Columns.Add(new CanopyColumn("band", "Band") { Sortable = true, Calculation = CanopyCalculation.Parse("IF([net] >= 20, \"high\", \"low\")") });
        view.Columns.Add(Number("net", "[base] * 2 - [fee]"));
        view.Columns.Add(new CanopyColumn("fee", "Fee") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("base", "Base") { Kind = CanopyColumnKind.Number });
        view.Reporting.FacetColumns.Add("band");
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("sum", "net", CanopyGridAggregateOperation.Sum, "Net"));
        return view;
    }

    private static CanopyColumn Number(string id, string expression) => new CanopyColumn(id, id) { Kind = CanopyColumnKind.Number, Sortable = true, Calculation = CanopyCalculation.Parse(expression) };
    private static CanopyInMemoryProvider<Input> Provider(CanopyDataSchema schema) => new CanopyInMemoryProvider<Input>(schema, () => Records, item => item.Id, Accessors(), () => "r1");
    private static Dictionary<string, Func<Input, object?>> Accessors() => new Dictionary<string, Func<Input, object?>> { ["base"] = item => item.Base, ["fee"] = item => item.Fee };
    private static readonly Input[] Records = { new Input("a", 10, 10), new Input("b", 20, 10), new Input("c", 15, 10), new Input("d", 5, 10) };
    private sealed class Input {
        internal Input(string id, long value, long fee) { Id = id; Base = value; Fee = fee; }
        internal string Id { get; }
        internal long Base { get; }
        internal long Fee { get; }
    }
}
