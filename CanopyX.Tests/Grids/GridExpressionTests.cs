using System.Text.Json;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridExpressionTests {
    [Fact]
    public void SearchAndGroups_SerializeIndependentlyOfDisplayAndTypedValues() {
        var view = View();
        view.SearchColumns.Add("name");
        var row = new CanopyGridRow("a");
        row.Cells["name"] = new CanopyCell("raw") { Text = "Visible", SearchText = "alternate keyword" };
        view.Rows.Add(row);
        view.Query = new CanopyGridQuery(view.Id) {
            Search = "\"alternate keyword\"", SearchMode = CanopyGridSearchMode.Words,
            FilterGroup = new CanopyGridFilterGroup(CanopyGridFilterJunction.Any,
                new CanopyGridFilter("name", CanopyGridFilterOperator.Equal, "raw")) {
                Groups = { new CanopyGridFilterGroup(CanopyGridFilterJunction.All,
                    new CanopyGridFilter("amount", CanopyGridFilterOperator.GreaterThanOrEqual, 10)) }
            }
        };
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "word search, aliases and nested typed filters");
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal("name", root.GetProperty("searchColumns")[0].GetString());
        Assert.Equal("raw", root.GetProperty("rows")[0].GetProperty("cells").GetProperty("name").GetProperty("value").GetString());
        Assert.Equal("Visible", root.GetProperty("rows")[0].GetProperty("cells").GetProperty("name").GetProperty("text").GetString());
        Assert.Equal("alternate keyword", root.GetProperty("rows")[0].GetProperty("cells").GetProperty("name").GetProperty("searchText").GetString());
        var query = root.GetProperty("query");
        Assert.Equal("words", query.GetProperty("searchMode").GetString());
        Assert.Equal("or", query.GetProperty("filterGroup").GetProperty("operator").GetString());
        Assert.Equal(10, query.GetProperty("filterGroup").GetProperty("groups")[0].GetProperty("filters")[0].GetProperty("values")[0].GetInt32());
    }

    [Fact]
    public void ExpressionBounds_ApplyAcrossFlatAndNestedPredicatesAndRejectCycles() {
        var view = View();
        var query = new CanopyGridQuery(view.Id);
        for (var i = 0; i < 64; i++) query.Filters.Add(Predicate());
        ProtocolSchema.AssertValid(query.ToJson(view), "64 flat predicates");
        query.FilterGroup = new CanopyGridFilterGroup(CanopyGridFilterJunction.All, Predicate());
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
        query.Filters.Clear();
        var group = query.FilterGroup;
        for (var i = 1; i < 8; i++) {
            group.Groups.Add(new CanopyGridFilterGroup(CanopyGridFilterJunction.All, Predicate()));
            group = group.Groups[0];
        }
        ProtocolSchema.AssertValid(query.ToJson(view), "eight group levels");
        group.Groups.Add(new CanopyGridFilterGroup(CanopyGridFilterJunction.All, Predicate()));
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
        group.Groups.Clear();
        group.Groups.Add(query.FilterGroup);
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
    }

    [Fact]
    public void NestedExpressions_RejectEmptyUnknownAndMistypedPredicates() {
        var view = View();
        var query = new CanopyGridQuery(view.Id) { FilterGroup = new CanopyGridFilterGroup(CanopyGridFilterJunction.Any) };
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
        query.FilterGroup.Filters.Add(new CanopyGridFilter("unknown", CanopyGridFilterOperator.Equal, "a"));
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
        query.FilterGroup.Filters.Clear();
        query.FilterGroup.Filters.Add(new CanopyGridFilter("amount", CanopyGridFilterOperator.Equal, "10"));
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
        query.FilterGroup.Filters.Clear();
        query.FilterGroup.Filters.Add(Predicate());
        var json = query.ToJson(view);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, root => root["filterGroup"]!["operator"] = "xor")).IsValid);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, root => root["filterGroup"]!["filters"] = System.Text.Json.Nodes.JsonNode.Parse("[]"))).IsValid);
    }

    [Fact]
    public void SearchPolicy_RejectsUnknownColumnsAndModesWithoutChangingLegacyDefaults() {
        var view = View();
        var query = new CanopyGridQuery(view.Id);
        using var document = JsonDocument.Parse(query.ToJson(view));
        Assert.False(document.RootElement.TryGetProperty("searchMode", out _));
        query.SearchMode = (CanopyGridSearchMode)99;
        Assert.Throws<ArgumentOutOfRangeException>(() => query.ToJson(view));
        view.SearchColumns.Add("unknown");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.SearchColumns.Clear();
        view.SearchColumns.Add("name");
        view.SearchColumns.Add("name");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    private static CanopyGridFilter Predicate() => new("name", CanopyGridFilterOperator.IsNotNull);
    private static CanopyDataGridView View() => new("inventory", "Inventory") {
        Columns = { new CanopyColumn("name", "Name"), new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number } }
    };
}
