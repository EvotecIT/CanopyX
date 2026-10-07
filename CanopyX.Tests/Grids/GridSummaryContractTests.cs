using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridSummaryContractTests {
    private static CanopyGridView View() {
        var view = new CanopyGridView("inventory", "Inventory") { Source = CanopyGridSourceKind.Host,
            Reporting = new CanopyGridReporting { Grouping = new CanopyGridGrouping("category") } };
        view.Columns.Add(new CanopyColumn("category", "Category") { Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Sum, "Total amount"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("count", "amount", CanopyGridAggregateOperation.Count, "Amounts present"));
        return view;
    }
    private static CanopyGridSummary Summary(CanopyGridView view) {
        var result = new CanopyGridSummary(new CanopyGridQuery(view.Id) { Revision = "revision" }, 3);
        result.Aggregates.Add("sum", 12); result.Aggregates.Add("count", 2);
        var group = new CanopyGridGroup("stable-a", new CanopyCell("<A>") { Text = "Ignored display" }, 0, 3);
        group.Aggregates.Add("sum", 12); group.Aggregates.Add("count", 2); result.Groups.Add(group);
        return result;
    }
    [Fact]
    public void CompleteSummary_CarriesRawGroupsCountsAggregatesAndLeadingGroupOrder() {
        var view = View(); ProtocolSchema.AssertValid(view.ToJson(), "summary-capable view");
        var query = new CanopyGridQuery(view.Id); query.Sort.Add(new CanopyGridSort("amount", true));
        using var request = JsonDocument.Parse(query.ToJson(view));
        Assert.Equal("category", request.RootElement.GetProperty("sort")[0].GetProperty("column").GetString());
        Assert.Equal("amount", request.RootElement.GetProperty("sort")[1].GetProperty("column").GetString());
        var json = Summary(view).ToJson(view); ProtocolSchema.AssertValid(json, "full-query summary");
        using var result = JsonDocument.Parse(json);
        Assert.Equal("<A>", result.RootElement.GetProperty("groups")[0].GetProperty("value").GetString());
        Assert.Equal(3, result.RootElement.GetProperty("matched").GetInt32());
        Assert.DoesNotContain("<A>", json); Assert.DoesNotContain("Ignored display", json);
    }
    [Fact]
    public void Summary_RejectsIncompleteRangesMissingAggregatesAndImpossibleNonmissingCounts() {
        var view = View(); var result = Summary(view);
        result.Groups.Clear(); Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
        result = Summary(view); result.Groups.Add(new CanopyGridGroup("duplicate", "Other", 3, 1));
        Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
        result = Summary(view); result.Aggregates.Remove("sum"); Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
        result = Summary(view); result.Groups[0].Aggregates["count"] = 3.5; Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
        result = Summary(view); result.Aggregates["sum"] = double.PositiveInfinity; Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
    }
    [Fact]
    public void GroupDisplayCells_PreservePresenterMetadataAndRejectUndeclaredOrMistypedValues() {
        var view = View(); var result = Summary(view);
        result.Groups[0].Cells["category"] = new CanopyCell("Failing") { Tone = CanopyTone.Danger, Text = "Needs attention" };
        var json = result.ToJson(view); ProtocolSchema.AssertValid(json, "group display cells");
        using var document = JsonDocument.Parse(json);
        var cell = document.RootElement.GetProperty("groups")[0].GetProperty("cells").GetProperty("category");
        Assert.Equal("Failing", cell.GetProperty("value").GetString());
        Assert.Equal("danger", cell.GetProperty("tone").GetString());
        Assert.Equal("Needs attention", cell.GetProperty("text").GetString());
        result.Groups[0].Cells["amount"] = "wrong";
        Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
        result.Groups[0].Cells.Remove("amount"); result.Groups[0].Cells["unknown"] = "value";
        Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
    }
    [Fact]
    public void Summary_PoliciesRejectWrongKindsDuplicateIdentitiesAndCursorGrouping() {
        var view = View(); view.Reporting!.Aggregates.Add(new CanopyGridAggregate("sum", "category", CanopyGridAggregateOperation.Sum, "Invalid"));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view = View(); view.Reporting!.Grouping = new CanopyGridGrouping("amount"); view.Columns[1].Sortable = false;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view = View(); view.Navigation = CanopyGridNavigation.Cursor; view.Presentation = CanopyGridPresentation.Paged;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view = View(); view.Reporting!.Grouping = null;
        var result = new CanopyGridSummary(new CanopyGridQuery(view.Id) { Revision = "snapshot" }, 0); result.Aggregates.Add("sum", null); result.Aggregates.Add("count", 0);
        ProtocolSchema.AssertValid(result.ToJson(view), "empty ungrouped totals");
    }

    [Fact]
    public void GroupComparer_UsesRawTypedTiesMissingLastAndUtcMillisecondPrecision() {
        var view = View();
        view.Reporting!.Ordering.Add("category", new CanopyGridOrdering(CanopyGridTextOrder.FoldedNatural));
        var compare = view.Reporting.Grouping!.CreateComparer(view);
        var values = new[] { "item2", "Item02", "item02", "ITEM2", "item10" }.Select(value => new CanopyCell(value)).ToList();
        values.Sort(compare);
        Assert.Equal(new[] { "ITEM2", "Item02", "item02", "item2", "item10" }, values.Select(cell => cell.Value));
        Assert.True(compare.Compare(new CanopyCell(true), new CanopyCell("true")) < 0);
        Assert.True(compare.Compare(null!, new CanopyCell("last")) > 0);
        view.Columns.Add(new CanopyColumn("when", "When") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        var dateOrder = new CanopyGridGrouping("when", true).CreateComparer(view);
        var instant = new DateTime(2026, 10, 4, 12, 0, 0, DateTimeKind.Utc);
        Assert.Equal(0, dateOrder.Compare(new CanopyCell(instant), new CanopyCell(instant.AddTicks(9999))));
        Assert.True(dateOrder.Compare(new CanopyCell(instant.AddMilliseconds(1)), new CanopyCell(instant)) < 0);
        Assert.True(dateOrder.Compare(null!, new CanopyCell(instant)) > 0);
        var numeric = new CanopyGridGrouping("amount").CreateComparer(view);
        Assert.Throws<InvalidOperationException>(() => numeric.Compare(new CanopyCell(9007199254740992L), new CanopyCell(0)));
    }

    [Fact]
    public void Summary_RejectsMutatedOwnershipIncompleteEchoAndEmptyNumericTotals() {
        var view = View(); var result = Summary(view);
        result.Query.Revision = "changed"; Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
        result = Summary(view); result.Query.Offset = 1; Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
        result = Summary(view); result.Query.Limit = view.PageSize + 1; Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
        var valid = Summary(view).ToJson(view);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(valid, json => json["query"]!.AsObject().Remove("filters"))).IsValid);
        view.Reporting!.Grouping = null;
        result = new CanopyGridSummary(new CanopyGridQuery(view.Id) { Revision = "empty", Limit = view.PageSize }, 0);
        result.Aggregates.Add("count", 0); result.Aggregates.Add("sum", 0);
        Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
    }
}
