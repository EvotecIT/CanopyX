using Xunit;

namespace CanopyX.Data.Tests;

public sealed class Wave1SchemaSnapshotTests {
    [Fact]
    public void Schema_CapturesColumnQueryExportAndAdvertisedMetadata() {
        var view = new CanopyDataGridView("snapshot", "Snapshot") {
            Source = CanopyGridSource.HostedOffset(), PageSize = 25, Reporting = new CanopyGridReporting { Groupable = true }
        };
        var column = new CanopyColumn("name", "Name") {
            Sortable = true, Ordering = new CanopyGridOrdering(CanopyGridTextOrder.Natural)
        };
        var hidden = new CanopyColumn("secret", "Secret") { Hidden = true };
        view.Columns.Add(column); view.Columns.Add(hidden);
        view.SearchColumns.Add("name");
        view.Reporting.FacetColumns.Add("name");
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("name"));
        var schema = new CanopyDataSchema(view);
        var advertised = schema.ToJson();
        column.Kind = CanopyColumnKind.Number; column.Sortable = false; column.Hidden = true; column.Ordering = null;
        hidden.Hidden = false;
        view.PageSize = 200;
        view.Reporting.Groupable = false; view.Reporting.GroupBy.Clear(); view.Reporting.FacetColumns.Clear();
        view.SearchColumns.Clear(); view.Columns.Clear();
        var request = CanopyRequestParser.ParseQuery("{\"sort\":[{\"column\":\"name\"}],\"filters\":[{\"column\":\"name\",\"operator\":\"eq\",\"values\":[\"server2\"]}]}", schema);
        Assert.Equal(25, request.Limit);
        Assert.Equal(CanopyColumnKind.Text, schema.GetColumn("name").Kind);
        Assert.True(schema.GetColumn("name").Sortable);
        Assert.Equal(CanopyGridTextOrder.Natural, schema.GetColumn("name").Ordering!.Order);
        Assert.Single(schema.SearchColumns);
        Assert.True(schema.GetColumn("name").Facetable);
        Assert.Single(schema.GroupBy);
        Assert.True(schema.Groupable);
        Assert.Equal(advertised, schema.ToJson());
        var typed = CanopyRequestParser.FromQuery(new CanopyGridQuery("snapshot"), schema);
        Assert.Equal("snapshot", typed.Schema.ViewId);
        var export = CanopyRequestParser.ParseExport("{\"query\":{\"view\":\"snapshot\",\"revision\":\"r1\"},\"revision\":\"r1\"}", schema);
        Assert.Equal(new[] { "name" }, export.Columns.Select(item => item.Id));
    }

    [Fact]
    public void Schema_CapturesNestedEditorAndValidationStateAndPublicCopiesCannotMutateIt() {
        var view = new CanopyDataGridView("snapshot", "Snapshot") { Source = CanopyGridSource.HostedOffset() };
        var editor = CanopyCellEditor.Select("Open", "Closed");
        var validation = new CanopyCellValidation { Required = true, MinLength = 2, MaxLength = 10, Pattern = "[A-Z][a-z]*", Message = "Original message" };
        var column = new CanopyColumn("state", "State") { Editable = true, Editor = editor, Validation = validation };
        view.Columns.Add(column);
        var schema = new CanopyDataSchema(view);
        var captured = schema.GetColumn("state");
        editor.Options.Clear(); editor.Options.Add(new CanopyEditorOption("New")); editor.Placeholder = "Changed";
        validation.Required = false; validation.MaxLength = 100; validation.Pattern = "changed"; validation.Message = "Changed";
        column.Editable = false;
        var publicDefinition = captured.Definition;
        publicDefinition.Editable = false; publicDefinition.Kind = CanopyColumnKind.Number;
        publicDefinition.Editor!.Options.Clear(); publicDefinition.Validation!.Required = false;
        captured.Editor!.Options.Clear(); captured.Validation!.MaxLength = 200;
        Assert.True(captured.Editable);
        Assert.Equal(CanopyColumnKind.Text, captured.Kind);
        Assert.Equal(new[] { "Open", "Closed" }, captured.Editor!.Options.Select(option => option.Value));
        Assert.True(captured.Validation!.Required);
        Assert.Equal(10, captured.Validation!.MaxLength);
        Assert.Equal("[A-Z][a-z]*", captured.Validation!.Pattern);
        Assert.Equal("Original message", captured.Validation!.Message);
        Assert.Null(captured.Editor!.Placeholder);
        Assert.Single(CanopyRequestParser.ParseCommit("{\"protocol\":\"canopyx/2\",\"type\":\"gridCommit\",\"view\":\"snapshot\",\"revision\":\"r1\",\"rows\":[{\"id\":\"a\",\"values\":{\"state\":\"Open\"},\"original\":{\"state\":\"Closed\"}}]}", schema).Rows);
    }
}
