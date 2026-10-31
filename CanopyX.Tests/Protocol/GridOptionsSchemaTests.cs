using CanopyX.Tests.Grids;

namespace CanopyX.Tests.Protocol;

public sealed class GridOptionsSchemaTests {
    private static CanopyDataGridView View() {
        var view = GridOptionsContractTests.View();
        view.Presentation = CanopyGridPresentation.Paged;
        view.GetColumn("name").ClassName = null;
        view.GetColumn("name").Alignment = null;
        view.GetColumn("name").SortComparator = null;
        view.GetColumn("name").OrderData.Clear();
        view.GetColumn("name").OrderSequence.Clear();
        var defaults = new CanopyGridColumnDefaults { ClassName = "amount", Alignment = "end", OrderData = new List<string> { "amount" } };
        defaults.Targets.Add("*"); view.ColumnDefaults.Add(defaults);
        view.PreSort.Add(new CanopyGridSort("rank"));
        var footer = new CanopyGridFooter("total", "Matching totals");
        footer.Aggregates.Add(new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Sum, "Sum"));
        view.Footers.Add(footer);
        view.Reporting = new CanopyGridReporting { Grouping = new CanopyGridGrouping("name") { HeaderTemplate = "<b>{value}</b>: {count}" } };
        return view;
    }

    [Fact]
    public void SelectOnClick_IsAnOptionalBooleanInTheGridDocument() {
        var view = View();
        Assert.DoesNotContain("selectOnClick", view.ToJson());
        view.SelectOnClick = true;
        var json = view.ToJson();
        Assert.True(System.Text.Json.Nodes.JsonNode.Parse(json)!["selectOnClick"]!.GetValue<bool>());
        ProtocolSchema.AssertValid(json, "pointer selection without reporting checkboxes");
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, document => document["selectOnClick"] = "true")).IsValid);
    }

    [Fact]
    public void WriterOptions_QueryHooksAndAcceptedFooterValuesMatchTheProtocolSchema() {
        var view = View();
        ProtocolSchema.AssertValid(view.ToJson(), "grid options with explicit null and empty default overrides");
        var query = new CanopyGridQuery(view.Id);
        query.Filters.Add(new CanopyGridFilter("amount", "multiple", new CanopyCell(2)));
        query.Sort.Add(new CanopyGridSort("name"));
        ProtocolSchema.AssertValid(query.ToJson(view), "named filter with fixed and visible sort identities");
        var page = new CanopyGridPage(view.Id, "r1", 0, 0, 0);
        page.FooterValues["total"] = new Dictionary<string, double?> { ["sum"] = null };
        ProtocolSchema.AssertValid(page.ToJson(view), "empty accepted footer values");
    }

    [Theory]
    [InlineData("className", "money;display:none")]
    [InlineData("alignment", "left")]
    [InlineData("sortComparator", "run()")]
    public void SchemaRejectsInvalidColumnExtensionValues(string field, string value) {
        var json = ProtocolSchema.Mutate(View().ToJson(), document => document["columns"]![0]![field] = value);
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
    }

    [Fact]
    public void SchemaRejectsUnknownFooterScopeAndImpossibleOrderingCycles() {
        var source = View().ToJson();
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(source, document => document["footers"]![0]!["scope"] = "viewport")).IsValid);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(source, document => document["columns"]![0]!["orderSequence"] = System.Text.Json.Nodes.JsonNode.Parse("[\"asc\",\"asc\"]"))).IsValid);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" \t\r\n ")]
    public void SchemaRejectsBlankGroupHeaderTemplates(string template) {
        var json = ProtocolSchema.Mutate(View().ToJson(), document => document["reporting"]!["grouping"]!["headerTemplate"] = template);
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
    }
}
