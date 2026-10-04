using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json.Nodes;
using Json.Schema;

namespace CanopyX.Tests.Grids;

public sealed class GridViewStorageTests {
    [Fact]
    public void PreferenceSchema_CoversCurrentAndNamedStateWithoutPersistingDatasetRevisions() {
        var root = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Schema", "canopyx-2.schema.json")))!;
        root["$id"] = "https://evotec.xyz/canopyx/tests/grid-view-settings";
        root["oneOf"] = JsonNode.Parse("[{\"$ref\":\"#/$defs/gridViewSettings\"}]");
        var schema = JsonSchema.FromText(root.ToJsonString());
        var state = JsonNode.Parse("""
            {"version":1,"view":"preferences","columns":[{"id":"name","width":180,"hidden":false,"pin":"left"}],
             "query":{"protocol":"canopyx/2","type":"gridQuery","view":"preferences","offset":0,"limit":100,"search":"","sort":[],"filters":[]},
             "timeZone":"utc","selection":[],"scrollTop":0,"paging":{"pageLength":25,"offset":0}}
            """)!;
        var envelope = new JsonObject { ["version"] = 1, ["view"] = "preferences", ["current"] = state,
            ["views"] = new JsonArray(new JsonObject { ["name"] = "Default", ["state"] = state.DeepClone() }), ["defaultView"] = "Default" };
        bool Valid() => schema.Evaluate(System.Text.Json.JsonSerializer.SerializeToElement(envelope)).IsValid;
        Assert.True(Valid());
        state["query"]!["revision"] = "dataset";
        Assert.False(Valid());
        state["query"]!.AsObject().Remove("revision");
        state["query"]!["type"] = "gridCursorQuery"; state["query"]!.AsObject().Remove("offset");
        Assert.True(Valid());
        state["query"]!["cursor"] = "continuation";
        Assert.False(Valid());
        state["query"]!.AsObject().Remove("cursor"); envelope["version"] = 2;
        Assert.False(Valid());
    }

    [Fact]
    public void DurablePreferences_AreExplicitlyKeyedAndStayInTheReportingRuntime() {
        var view = new CanopyGridView("preferences", "Preferences") { Reporting = new CanopyGridReporting() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain("viewStorage", view.ToJson());
        view.Reporting.ViewStorage = CanopyGridViewStorage.Local;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.StateKey = " ";
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.StateKey = "inventory-reader";
        ProtocolSchema.AssertValid(view.ToJson(), "durable keyed reporting preferences");
        Assert.Contains("\"viewStorage\":\"local\"", view.ToJson());
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        view.Reporting.ViewStorage = (CanopyGridViewStorage)42;
        Assert.Throws<ArgumentOutOfRangeException>(() => view.ToJson());
    }

    [Fact]
    public void SavedViewLabels_SelectAndTravelWithTheReportingRuntime() {
        var view = new CanopyGridView("preferences", "Preferences");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Labels.GridDefaultView = "Use by default";
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        ProtocolSchema.AssertValid(view.ToJson(), "translated default-view control");
        Assert.Contains("Use by default", view.ToJson());
    }
}
