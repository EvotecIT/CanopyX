using System.Text.Json;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridToolbarTests {
    [Fact]
    public void Toolbar_DefaultSwitches_WriteNothingAndKeepTheOrdinaryRuntime() {
        var view = View();
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "default toolbar");
        Assert.DoesNotContain("\"toolbar\"", json);
        Assert.Equal(CanopyRuntime.DataGrid, CanopyHtmlAssets.GetRuntime(view));
    }

    [Fact]
    public void Toolbar_SwitchedOffControls_WriteOnlyTheirFalseSwitches() {
        var view = View();
        view.Toolbar.Filters = false; view.Toolbar.Columns = false; view.Toolbar.Views = false;
        view.Toolbar.Export = false; view.Toolbar.More = false; view.Toolbar.Count = false;
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "every toolbar switch off");
        using var document = JsonDocument.Parse(json);
        var toolbar = document.RootElement.GetProperty("toolbar");
        Assert.Equal(new[] { "filters", "columns", "views", "export", "more", "count" }, toolbar.EnumerateObject().Select(property => property.Name));
        Assert.All(toolbar.EnumerateObject(), property => Assert.Equal(JsonValueKind.False, property.Value.ValueKind));
        Assert.True(document.RootElement.GetProperty("search").GetBoolean());
    }

    [Fact]
    public void Toolbar_OneSwitchOff_WritesThatSwitchAlone() {
        var view = View();
        view.Toolbar.Export = false;
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "export switched off");
        Assert.Contains("\"toolbar\":{\"export\":false}", json);
    }

    [Theory]
    [InlineData("{\"search\":false}")]
    [InlineData("{\"chips\":false}")]
    [InlineData("{\"export\":\"no\"}")]
    public void ToolbarSchema_RejectsUnknownOrNonBooleanSwitches(string toolbar) {
        var json = ProtocolSchema.Mutate(View().ToJson(), document => document["toolbar"] = System.Text.Json.Nodes.JsonNode.Parse(toolbar));
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
    }

    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        return view;
    }
}
