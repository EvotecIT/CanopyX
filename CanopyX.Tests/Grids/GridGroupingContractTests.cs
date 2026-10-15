using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

/// <summary>Runtime multi-level grouping, the new aggregate operations and detail rows on the wire.</summary>
public sealed class GridGroupingContractTests {
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("orders", "Orders") { Source = CanopyGridSource.HostedOffset(),
            Reporting = new CanopyGridReporting { Groupable = true } };
        view.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true });
        view.Columns.Add(new CanopyColumn("status", "Status") { Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("region"));
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("status", descending: true));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("total", "amount", CanopyGridAggregateOperation.Sum, "Total amount"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("statuses", "status", CanopyGridAggregateOperation.DistinctCount, "Statuses"));
        return view;
    }

    private static CanopyGridGroup Group(string key, string value, int offset, int count, double total, double statuses) {
        var group = new CanopyGridGroup(key, value, offset, count);
        group.Aggregates.Add("total", total); group.Aggregates.Add("statuses", statuses);
        return group;
    }

    private static CanopyGridSummary Summary(CanopyDataGridView view) {
        var summary = new CanopyGridSummary(new CanopyGridQuery(view.Id) { Revision = "r1" }, 5);
        summary.Aggregates.Add("total", 50); summary.Aggregates.Add("statuses", 2);
        var north = Group("north", "North", 0, 3, 30, 2);
        north.Groups.Add(Group("north/open", "Open", 0, 2, 20, 1));
        north.Groups.Add(Group("north/closed", "Closed", 2, 1, 10, 1));
        var south = Group("south", "South", 3, 2, 20, 1);
        south.Groups.Add(Group("south/open", "Open", 3, 2, 20, 1));
        summary.Groups.Add(north); summary.Groups.Add(south);
        return summary;
    }

    [Fact]
    public void Definition_WritesLevelsGroupableDistinctAndCustomAggregatesAndDetailRows() {
        var view = View();
        view.Reporting!.Aggregates.Add(new CanopyGridAggregate("median", "amount", "median", "Median amount"));
        var lines = new CanopyDataGridView("lines", "Lines");
        lines.Columns.Add(new CanopyColumn("product", "Product"));
        view.Reporting.Detail = new CanopyGridDetail { View = lines, Print = false, Label = "Order lines" };
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "grouped detail view");
        using var document = JsonDocument.Parse(json);
        var reporting = document.RootElement.GetProperty("reporting");
        Assert.Equal("status", reporting.GetProperty("groupBy")[1].GetProperty("column").GetString());
        Assert.Equal("desc", reporting.GetProperty("groupBy")[1].GetProperty("direction").GetString());
        Assert.True(reporting.GetProperty("groupable").GetBoolean());
        Assert.Equal("distinctCount", reporting.GetProperty("aggregates")[1].GetProperty("operation").GetString());
        Assert.Equal("median", reporting.GetProperty("aggregates")[2].GetProperty("operation").GetString());
        Assert.Equal(CanopyGridAggregateOperation.Custom, view.Reporting.Aggregates[2].Operation);
        Assert.Equal("lines", reporting.GetProperty("detail").GetProperty("view").GetProperty("id").GetString());
        Assert.False(reporting.GetProperty("detail").GetProperty("print").GetBoolean());
    }

    [Fact]
    public void Query_CarriesItsLevelsOrTheDeclaredOnesAndLeadsTheSortWithThem() {
        var view = View();
        var query = new CanopyGridQuery(view.Id); query.Sort.Add(new CanopyGridSort("amount", true)); query.Sort.Add(new CanopyGridSort("region"));
        using (var request = JsonDocument.Parse(query.ToJson(view))) {
            ProtocolSchema.AssertValid(request.RootElement.GetRawText(), "grouped query");
            Assert.Equal(new[] { "region", "status", "amount" }, request.RootElement.GetProperty("sort").EnumerateArray().Select(sort => sort.GetProperty("column").GetString()));
            Assert.Equal("desc", request.RootElement.GetProperty("sort")[1].GetProperty("direction").GetString());
            Assert.Equal(2, request.RootElement.GetProperty("groupBy").GetArrayLength());
        }
        query.GroupBy = new List<CanopyGridGroupLevel> { new CanopyGridGroupLevel("status", true, "total") };
        using (var request = JsonDocument.Parse(query.ToJson(view))) {
            // A level ordered by an aggregate keeps its records together by value; the summary orders the groups.
            Assert.Equal("asc", request.RootElement.GetProperty("sort")[0].GetProperty("direction").GetString());
            Assert.Equal("total", request.RootElement.GetProperty("groupBy")[0].GetProperty("aggregate").GetString());
        }
        query.GroupBy.Add(new CanopyGridGroupLevel("status"));
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
        // An empty list is an ungrouped query: no levels lead the sort and an ungrouped summary has no groups.
        query.GroupBy = new List<CanopyGridGroupLevel>();
        using (var request = JsonDocument.Parse(query.ToJson(view))) {
            Assert.Equal(0, request.RootElement.GetProperty("groupBy").GetArrayLength());
            Assert.Equal("amount", request.RootElement.GetProperty("sort")[0].GetProperty("column").GetString());
        }
        var ungrouped = new CanopyGridSummary(new CanopyGridQuery(view.Id) { Revision = "r1", GroupBy = new List<CanopyGridGroupLevel>() }, 0);
        ungrouped.Aggregates.Add("total", null); ungrouped.Aggregates.Add("statuses", 0);
        ProtocolSchema.AssertValid(ungrouped.ToJson(view), "ungrouped runtime summary");
    }

    [Fact]
    public void NestedSummary_CoversEveryLevelInContiguousOrderedRangesWithGlobalKeys() {
        var view = View(); var json = Summary(view).ToJson(view);
        ProtocolSchema.AssertValid(json, "nested summary");
        using var document = JsonDocument.Parse(json);
        var inner = document.RootElement.GetProperty("groups")[0].GetProperty("groups");
        Assert.Equal(new[] { "Open", "Closed" }, inner.EnumerateArray().Select(group => group.GetProperty("value").GetString()));
        Assert.Equal(2, inner[1].GetProperty("offset").GetInt32());
        Assert.Equal(2, document.RootElement.GetProperty("query").GetProperty("groupBy").GetArrayLength());
    }

    [Fact]
    public void NestedSummary_RejectsGapsMissingInnerLevelsRepeatedKeysAndOutOfOrderGroups() {
        var view = View(); var summary = Summary(view);
        summary.Groups[0].Groups[1] = Group("north/closed", "Closed", 3, 1, 10, 1);
        Assert.Throws<InvalidOperationException>(() => summary.ToJson(view));
        summary = Summary(view); summary.Groups[1].Groups.Clear();
        Assert.Throws<InvalidOperationException>(() => summary.ToJson(view));
        summary = Summary(view); summary.Groups[1].Groups[0] = Group("north/open", "Open", 3, 2, 20, 1);
        Assert.Throws<InvalidOperationException>(() => summary.ToJson(view));
        summary = Summary(view); (summary.Groups[0], summary.Groups[1]) = (summary.Groups[1], summary.Groups[0]);
        Assert.Throws<InvalidOperationException>(() => summary.ToJson(view));
        summary = Summary(view); summary.Groups[0].Groups[0].Aggregates["statuses"] = 3;
        Assert.Throws<InvalidOperationException>(() => summary.ToJson(view));
        summary = Summary(view); summary.Groups[0].Groups[0].Groups.Add(Group("deeper", "x", 0, 2, 20, 1));
        Assert.Throws<InvalidOperationException>(() => summary.ToJson(view));
    }

    [Fact]
    public void AggregateOrderedLevels_OrderGroupsByTheAggregateWithMissingValuesLast() {
        var view = View(); view.Reporting!.GroupBy.Clear(); view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("region", true, "total"));
        var summary = new CanopyGridSummary(new CanopyGridQuery(view.Id) { Revision = "r1" }, 5);
        summary.Aggregates.Add("total", 50); summary.Aggregates.Add("statuses", 2);
        summary.Groups.Add(Group("south", "South", 0, 3, 40, 1)); summary.Groups.Add(Group("north", "North", 3, 2, 10, 2));
        ProtocolSchema.AssertValid(summary.ToJson(view), "aggregate-ordered summary");
        summary.Groups[0].Aggregates["total"] = 5;
        Assert.Throws<InvalidOperationException>(() => summary.ToJson(view));
    }

    [Fact]
    public void RowDetails_WriteTablesNestedRowsAndTreesAndCheckNestedColumns() {
        var view = View(); view.Source = CanopyGridSource.Inline();
        var lines = new CanopyDataGridView("lines", "Lines"); lines.Columns.Add(new CanopyColumn("product", "Product"));
        view.Reporting!.Detail = new CanopyGridDetail { View = lines };
        var row = new CanopyGridRow("o1"); row.Cells["region"] = "North"; row.Cells["status"] = "Open"; row.Cells["amount"] = 10;
        var detail = new CanopyGridRowsDetail(); var line = new CanopyGridRow("o1-l1"); line.Cells["product"] = "Desk"; detail.Rows.Add(line);
        row.Detail = detail; view.Rows.Add(row);
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "nested detail rows");
        using (var document = JsonDocument.Parse(json)) {
            var payload = document.RootElement.GetProperty("rows")[0].GetProperty("detail");
            Assert.Equal("grid", payload.GetProperty("type").GetString());
            Assert.Equal("Desk", payload.GetProperty("rows")[0].GetProperty("cells").GetProperty("product").GetString());
        }
        line.Cells["unknown"] = "x";
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        line.Cells.Remove("unknown");
        view.Reporting.Detail = new CanopyGridDetail();
        var tree = new CanopyTreeDetail(); tree.Roots.Add(new CanopyNode("n1", "Node"));
        row.Detail = new CanopyPropertiesDetail { Items = { new CanopyProperty("Owner", "Ops") } };
        ProtocolSchema.AssertValid(view.ToJson(), "properties detail");
        row.Detail = tree;
        ProtocolSchema.AssertValid(view.ToJson(), "tree detail payload");
    }

    [Fact]
    public void Policies_RejectFixedPlusRuntimeGroupingTooManyLevelsUnknownAggregatesAndMixedDetailSources() {
        var view = View(); view.Reporting!.Grouping = new CanopyGridGrouping("region");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view = View(); foreach (var id in new[] { "amount", "region", "status" }) view.Reporting!.GroupBy.Add(new CanopyGridGroupLevel(id));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view = View(); view.Reporting!.GroupBy.Add(new CanopyGridGroupLevel("amount", aggregate: "missing"));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view = View(); view.Reporting!.Detail = new CanopyGridDetail { Template = "order-detail", Renderer = "order-lines" };
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        Assert.Throws<ArgumentException>(() => new CanopyGridAggregate("x", "amount", "sum", "Clashes with a built-in name"));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridAggregate("x", "amount", CanopyGridAggregateOperation.Custom, "Needs a name"));
        view = View(); view.Reporting!.Aggregates.Add(new CanopyGridAggregate("avg", "status", CanopyGridAggregateOperation.Average, "Text average"));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void StaticFallback_PrintsDetailRowsUnderTheirRecordsUnlessExcluded() {
        var view = View(); view.Source = CanopyGridSource.Inline();
        var lines = new CanopyDataGridView("lines", "Lines"); lines.Columns.Add(new CanopyColumn("product", "Product"));
        view.Reporting!.Detail = new CanopyGridDetail { View = lines };
        var row = new CanopyGridRow("o1"); row.Cells["region"] = "North"; row.Cells["status"] = "Open"; row.Cells["amount"] = 10;
        var detail = new CanopyGridRowsDetail(); var line = new CanopyGridRow("o1-l1"); line.Cells["product"] = "<Desk>"; detail.Rows.Add(line);
        row.Detail = detail; view.Rows.Add(row);
        var html = CanopyX.Rendering.CanopyStaticHtml.RenderGrid(view);
        Assert.Contains("&lt;Desk&gt;", html); Assert.Contains(">Product<", html);
        view.Reporting.Detail.Print = false;
        Assert.DoesNotContain("Desk", CanopyX.Rendering.CanopyStaticHtml.RenderGrid(view));
    }
}