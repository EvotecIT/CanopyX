using System.Text.Json;
using CanopyX.Html;
using Xunit;

namespace CanopyX.Tests.Grids;

public sealed class GridOptionsContractTests {
    internal static CanopyDataGridView View() {
        var view = new CanopyDataGridView("options", "Inventory") { PageSize = 2, Presentation = CanopyGridPresentation.Paged };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("rank", "Rank") { Kind = CanopyColumnKind.Number, Sortable = true });
        return view;
    }

    [Fact]
    public void FooterDescriptors_ReuseAggregatesAndOnlyAllScopeRequestsSummary() {
        var view = View();
        var sum = new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Sum, "Total");
        var page = new CanopyGridFooter("page", "This page", CanopyGridFooterScope.Page);
        page.Aggregates.Add(sum); view.Footers.Add(page);
        Assert.Empty(view.GetSummaryAggregates());
        var all = new CanopyGridFooter("all", "Matching records"); all.Aggregates.Add(sum); view.Footers.Add(all);
        Assert.Same(sum, Assert.Single(view.GetSummaryAggregates()));
        using var json = JsonDocument.Parse(view.ToJson());
        Assert.Equal("page", json.RootElement.GetProperty("footers")[0].GetProperty("scope").GetString());
        Assert.Equal("all", json.RootElement.GetProperty("footers")[1].GetProperty("scope").GetString());
        Assert.Equal("sum", json.RootElement.GetProperty("footers")[1].GetProperty("aggregates")[0].GetProperty("operation").GetString());
        view.Reporting = new CanopyGridReporting(); view.Reporting.Aggregates.Add(sum);
        Assert.Single(view.GetSummaryAggregates());
        view.Reporting.Aggregates[0] = new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Maximum, "Other");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void ColumnDefaults_FirstPerSettingMatchPreservesExplicitBooleansAndAuthoredSelectors() {
        var view = View();
        view.Columns[0].Sortable = false; view.Columns[0].Filterable = true; view.Columns[0].Hidden = false;
        view.Columns[1].ClassName = "money important";
        var money = new CanopyGridColumnDefaults { Alignment = "end", Filterable = false, SortComparator = "natural" };
        money.Targets.Add(".money"); view.ColumnDefaults.Add(money);
        var wildcard = new CanopyGridColumnDefaults { ClassName = "derived", Alignment = "center", Hidden = true, Sortable = true, Filterable = false };
        wildcard.Targets.Add("*"); view.ColumnDefaults.Add(wildcard);
        var derived = new CanopyGridColumnDefaults { SortComparator = "shouldNotApply" }; derived.Targets.Add(".derived"); view.ColumnDefaults.Add(derived);
        var index = new CanopyGridColumnDefaults { OrderSequence = new List<string> { "desc", "none" } }; index.Targets.Add("index:2"); view.ColumnDefaults.Add(index);
        using var json = JsonDocument.Parse(view.ToJson());
        Assert.False(view.Columns[0].Sortable); Assert.True(view.Columns[0].Filterable); Assert.False(view.Columns[0].Hidden);
        Assert.Equal("end", view.Columns[1].Alignment); Assert.Equal("natural", view.Columns[1].SortComparator);
        Assert.Equal("derived", view.Columns[0].ClassName); Assert.Null(view.Columns[0].SortComparator);
        Assert.Equal(new[] { "desc", "none" }, view.Columns[2].OrderSequence);
        var column = json.RootElement.GetProperty("columns")[0];
        Assert.False(column.GetProperty("sortable").GetBoolean()); Assert.True(column.GetProperty("filterable").GetBoolean()); Assert.False(column.GetProperty("hidden").GetBoolean());
        Assert.False(column.TryGetProperty("className", out _));
        Assert.Equal("money important", json.RootElement.GetProperty("columns")[1].GetProperty("className").GetString());
        Assert.Equal(".money", json.RootElement.GetProperty("columnDefaults")[0].GetProperty("targets")[0].GetString());
    }

    [Fact]
    public void ColumnDefaults_RevalidateMutableRulesWithoutMakingInheritedValuesExplicit() {
        var view = View();
        var rule = new CanopyGridColumnDefaults { Alignment = "center", OrderData = new List<string> { "rank" } };
        rule.Targets.Add("#name"); view.ColumnDefaults.Add(rule);
        view.Validate(); Assert.Equal("center", view.Columns[0].Alignment); Assert.Equal(new[] { "rank" }, view.Columns[0].OrderData);
        rule.Alignment = "end"; rule.OrderData[0] = "amount";
        view.Validate(); Assert.Equal("end", view.Columns[0].Alignment); Assert.Equal(new[] { "amount" }, view.Columns[0].OrderData);
        view.Columns[0].Alignment = "start"; view.Columns[0].OrderData.Add("rank");
        rule.OrderData.Clear(); rule.OrderData.Add("name");
        view.Validate(); Assert.Equal("start", view.Columns[0].Alignment); Assert.Equal(new[] { "amount", "rank" }, view.Columns[0].OrderData);
        view.ColumnDefaults.Clear(); view.Validate(); Assert.Null(view.Columns[1].Alignment);
    }

    [Theory]
    [InlineData("money\" onclick=\"x")]
    [InlineData("money;display:none")]
    [InlineData("money\nother")]
    [InlineData(" money")]
    public void ColumnClasses_RejectUnsafeTokens(string value) => Assert.Throws<ArgumentException>(() => new CanopyColumn("c", "C") { ClassName = value });

    [Fact]
    public void ColumnOptions_ValidateReferencesAndWriteSafeAlignmentAndPluginNames() {
        var view = View(); var column = view.Columns[0];
        column.ClassName = "record _primary"; column.Alignment = "center"; column.SortComparator = "natural2";
        column.OrderData.Add("rank"); column.OrderData.Add("amount"); column.OrderSequence.Add("desc"); column.OrderSequence.Add("none");
        using var json = JsonDocument.Parse(view.ToJson()); var wire = json.RootElement.GetProperty("columns")[0];
        Assert.Equal("center", wire.GetProperty("alignment").GetString()); Assert.Equal("natural2", wire.GetProperty("sortComparator").GetString());
        Assert.Equal(new[] { "rank", "amount" }, wire.GetProperty("orderData").EnumerateArray().Select(value => value.GetString()));
        Assert.Equal("none", wire.GetProperty("orderSequence")[1].GetString());
        Assert.Throws<ArgumentException>(() => column.Alignment = "left;position:fixed");
        Assert.Throws<ArgumentException>(() => column.SortComparator = "not-a-function()");
        column.OrderData.Add("unknown"); Assert.Throws<InvalidOperationException>(() => view.ToJson());
        column.OrderData.Remove("unknown"); column.OrderSequence.Add("none"); Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void Query_GroupingThenFixedSortKeepsReaderAliasAndAvoidsDuplicateKeys() {
        var view = View(); view.Reporting = new CanopyGridReporting { Grouping = new CanopyGridGrouping("rank") };
        view.PreSort.Add(new CanopyGridSort("amount", true)); view.Columns[0].OrderData.Add("rank"); view.Columns[0].OrderData.Add("name");
        var query = new CanopyGridQuery(view.Id); query.Sort.Add(new CanopyGridSort("amount")); query.Sort.Add(new CanopyGridSort("name", true));
        using var json = JsonDocument.Parse(query.ToJson(view)); var sort = json.RootElement.GetProperty("sort");
        Assert.Equal(new[] { "rank", "amount", "name" }, sort.EnumerateArray().Select(key => key.GetProperty("column").GetString()));
        Assert.Equal(new[] { "asc", "desc", "desc" }, sort.EnumerateArray().Select(key => key.GetProperty("direction").GetString()));
        Assert.Equal(2, query.Sort.Count);
    }

    [Fact]
    public void Query_OrderDataKeepsTheVisibleAliasOnTheWire() {
        var view = View(); view.Columns[0].OrderData.Add("rank");
        var query = new CanopyGridQuery(view.Id); query.Sort.Add(new CanopyGridSort("name", true));
        using var json = JsonDocument.Parse(query.ToJson(view));
        Assert.Equal("name", Assert.Single(json.RootElement.GetProperty("sort").EnumerateArray()).GetProperty("column").GetString());
    }

    [Fact]
    public void NamedFilters_PreserveOperatorTypedOperandAndBuiltinContracts() {
        var view = View(); var query = new CanopyGridQuery(view.Id);
        query.Filters.Add(new CanopyGridFilter("amount", "isEven", new CanopyCell(2)));
        query.Filters.Add(new CanopyGridFilter("name", CanopyGridFilterOperator.Contains, new CanopyCell("hello")));
        using var json = JsonDocument.Parse(query.ToJson(view)); var filters = json.RootElement.GetProperty("filters");
        Assert.Equal("isEven", filters[0].GetProperty("operator").GetString()); Assert.Equal(2, filters[0].GetProperty("values")[0].GetInt32());
        Assert.Equal("contains", filters[1].GetProperty("operator").GetString());
        Assert.Throws<ArgumentException>(() => new CanopyGridFilter("amount", "isEven"));
        Assert.Throws<ArgumentException>(() => new CanopyGridFilter("amount", "bad-name", new CanopyCell(2)));
        Assert.Throws<ArgumentException>(() => new CanopyGridFilter("amount", "eq", new CanopyCell(2)));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridFilter("amount", CanopyGridFilterOperator.Custom, new CanopyCell(2)));
        query.Filters[0] = new CanopyGridFilter("amount", "isEven", new CanopyCell("wrong"));
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
    }

    [Fact]
    public void NamedFilterHighlight_IsRejectedBecauseStaticAndBrowserHighlightsHaveNoPluginContext() {
        var filter = new CanopyGridFilter("amount", "isEven", new CanopyCell(2));
        Assert.Throws<ArgumentException>(() => new CanopyGridHighlightRule(filter, CanopyTone.Danger));
    }

    [Fact]
    public void ExplicitNullAndEmptyColumnOverrides_SerializeToSuppressDefaults() {
        var view = View(); var rule = new CanopyGridColumnDefaults {
            ClassName = "inherited", Alignment = "end", SortComparator = "natural", OrderData = new List<string> { "rank" }, OrderSequence = new List<string> { "desc" }
        };
        rule.Targets.Add("*"); view.ColumnDefaults.Add(rule);
        var column = view.Columns[0]; column.ClassName = null; column.Alignment = null; column.SortComparator = null;
        column.OrderData.Clear(); column.OrderSequence.Clear();
        using var json = JsonDocument.Parse(view.ToJson()); var wire = json.RootElement.GetProperty("columns")[0];
        foreach (var name in new[] { "className", "alignment", "sortComparator" }) Assert.Equal(JsonValueKind.Null, wire.GetProperty(name).ValueKind);
        Assert.Empty(wire.GetProperty("orderData").EnumerateArray()); Assert.Empty(wire.GetProperty("orderSequence").EnumerateArray());
        Assert.Null(column.ClassName); Assert.Null(column.Alignment); Assert.Null(column.SortComparator); Assert.Empty(column.OrderData); Assert.Empty(column.OrderSequence);
    }

    [Fact]
    public void GridOptionsPart_IsCarriedByFootersAndNestedNamedFiltersInSingleFilePages() {
        var view = View();
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "grid-options");
        var footer = new CanopyGridFooter("totals", "Totals");
        footer.Aggregates.Add(new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Sum, "Sum"));
        view.Footers.Add(footer);
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "grid-options");
        view.Footers.Clear();
        view.Query = new CanopyGridQuery(view.Id) { FilterGroup = new CanopyGridFilterGroup(CanopyGridFilterJunction.All) };
        view.Query.FilterGroup.Groups.Add(new CanopyGridFilterGroup(CanopyGridFilterJunction.Any, new CanopyGridFilter("amount", "isEven", new CanopyCell(2))));
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "grid-options");
        Assert.Contains("application/x-canopyx-grid-options\"", view.ToHtmlFragment());
    }

    [Fact]
    public void GroupHeaderTemplate_IsPlainHtmlSafeTextOnTheWire() {
        var view = View(); view.Reporting = new CanopyGridReporting { Grouping = new CanopyGridGrouping("name") { HeaderTemplate = "<b>{value}</b> {column}: {count} ${literal}" } };
        var text = view.ToJson(); using var json = JsonDocument.Parse(text);
        Assert.DoesNotContain("<b>", text); Assert.DoesNotContain("${literal}", text);
        Assert.Equal("<b>{value}</b> {column}: {count} ${literal}", json.RootElement.GetProperty("reporting").GetProperty("grouping").GetProperty("headerTemplate").GetString());
    }

    [Theory]
    [InlineData(CanopyGridAggregateOperation.Count, 3)]
    [InlineData(CanopyGridAggregateOperation.DistinctCount, 2)]
    [InlineData(CanopyGridAggregateOperation.Sum, 14)]
    [InlineData(CanopyGridAggregateOperation.Average, 14d / 3)]
    [InlineData(CanopyGridAggregateOperation.Minimum, 2)]
    [InlineData(CanopyGridAggregateOperation.Maximum, 10)]
    public void AggregateEvaluation_UsesRawValuesAndSkipsMissingCells(CanopyGridAggregateOperation operation, double expected) {
        var aggregate = new CanopyGridAggregate("a", "amount", operation, "Value");
        Assert.Equal(expected, aggregate.Evaluate(new CanopyCell?[] { new CanopyCell(2) { Text = "999" }, null, new CanopyCell(), new CanopyCell(2), new CanopyCell(10) }));
        Assert.Equal(operation == CanopyGridAggregateOperation.Count || operation == CanopyGridAggregateOperation.DistinctCount ? 0d : (double?)null, aggregate.Evaluate(Array.Empty<CanopyCell>()));
    }

    [Fact]
    public void AggregateEvaluation_PreservesCompensatedSumsAndRejectsUnsupportedOrUnsafeValues() {
        var sum = new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Sum, "Sum");
        Assert.Equal(0.5, sum.Evaluate(new[] { new CanopyCell(9007199254740991d), new CanopyCell(0.5), new CanopyCell(-9007199254740991d) }));
        Assert.Throws<InvalidOperationException>(() => sum.Evaluate(new[] { new CanopyCell(9007199254740991d), new CanopyCell(9007199254740991d) }));
        var custom = new CanopyGridAggregate("custom", "amount", "median", "Median");
        Assert.Throws<InvalidOperationException>(() => custom.Evaluate(new[] { new CanopyCell(2) }));
    }

    [Fact]
    public void AggregateEvaluation_UsesProtocolNumericDistinctnessAndTreatsNonfiniteCellsAsMissing() {
        var distinct = new CanopyGridAggregate("distinct", "amount", CanopyGridAggregateOperation.DistinctCount, "Distinct");
        Assert.Equal(2, distinct.Evaluate(new[] { new CanopyCell(2L), new CanopyCell(2.0m), new CanopyCell(2d), new CanopyCell(0d), new CanopyCell(-0d), new CanopyCell(double.NaN) }));
        var count = new CanopyGridAggregate("count", "amount", CanopyGridAggregateOperation.Count, "Count");
        Assert.Equal(1, count.Evaluate(new[] { new CanopyCell(double.PositiveInfinity), new CanopyCell(2d) }));
    }
}
