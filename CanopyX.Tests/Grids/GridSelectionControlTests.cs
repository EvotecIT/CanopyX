using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json.Nodes;
using Json.Schema;

namespace CanopyX.Tests.Grids;

public sealed class GridSelectionControlTests {
    [Fact]
    public void SelectionControls_AreExplicitAndUseTheReportingRuntime() {
        var view = new CanopyDataGridView("records", "Records") {
            Selection = CanopySelectionMode.Multiple, Reporting = new CanopyGridReporting { SelectionControls = true }
        };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        ProtocolSchema.AssertValid(view.ToJson(), "reporting record selection");
        Assert.Contains("\"selectionControls\":true", view.ToJson());
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        view.Reporting.SelectionControls = false;
        Assert.DoesNotContain("selectionControls", view.ToJson());
    }

    [Fact]
    public void SelectionLabels_AreTranslatedAndChooseTheReportingRuntime() {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Labels.GridSelectMatching = "Select matching inventory";
        view.Labels.GridSelectionQueryCount = "{count} records, {excluded} exclusions";
        ProtocolSchema.AssertValid(view.ToJson(), "translated selection controls");
        Assert.Contains("Select matching inventory", view.ToJson());
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
    }

    [Fact]
    public void QuerySelectionSchema_RequiresAcceptedIdentityAndBoundedDistinctExclusions() {
        var root = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Schema", "canopyx-2.schema.json")))!;
        root["$id"] = "https://evotec.xyz/canopyx/tests/grid-selection";
        root["oneOf"] = JsonNode.Parse("[{\"$ref\":\"#/$defs/gridSelection\"}]");
        var schema = JsonSchema.FromText(root.ToJsonString());
        var selection = JsonNode.Parse("""
            {"kind":"query","revision":"v1","matched":null,"excludedIds":["a"],
             "query":{"protocol":"canopyx/2","type":"gridCursorQuery","view":"records","revision":"v1","limit":50,"search":"","sort":[],"filters":[]}}
            """)!;
        bool Valid() => schema.Evaluate(System.Text.Json.JsonSerializer.SerializeToElement(selection)).IsValid;
        Assert.True(Valid());
        selection["query"]!.AsObject().Remove("revision"); Assert.False(Valid());
        selection["query"]!["revision"] = "v1";
        selection["excludedIds"] = new JsonArray("a", "a"); Assert.False(Valid());
        selection["excludedIds"] = new JsonArray(Enumerable.Range(0, 10001).Select(i => (JsonNode?)JsonValue.Create("id" + i)).ToArray());
        Assert.False(Valid());
    }
}
