using CanopyX.Html;
using Xunit;

namespace CanopyX.Tests.NetFramework.Html;

/// <summary>The part manifest is read by the package's own reader, which must work on .NET Framework too.</summary>
public sealed class PartManifestTests {
    [Fact]
    public void Parts_AreReadFromTheEmbeddedManifestOnNetFramework() {
        var names = CanopyHtmlAssets.Parts.Select(part => part.Name).ToArray();
        Assert.Equal(new[] { "tree-tools", "filter-editor", "export", "history", "pager", "enhance", "data", "forms", "flow", "flow-host", "flow-checks", "flow-options", "flow-pick", "flow-records", "flow-drafts", "flow-preview", "flow-command", "flow-tasks", "flow-dialog", "flow-links", "flow-endpoint", "flow-consent", "matrix", "changes", "editing", "column-groups", "cell-range", "links", "search", "formatting", "format-editor", "link", "detail-rows", "grouping", "highlight", "layouts", "facets", "live", "record-panel", "calendar", "calendar-recurrence", "calendar-edit", "calendar-ics", "timeline" }, names);
        foreach (var part in CanopyHtmlAssets.Parts) {
            Assert.Matches("^[a-f0-9]{16}$", part.Version);
            Assert.Contains("version:\"" + part.Version + "\"", part.Script);
        }
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }, CanopyHtmlAssets.GetPart("history").Runtimes);
        var tree = new CanopyTreeView("tree", "Tree") { DeepLink = true };
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Equal(new[] { "tree-tools", "export", "links" }, CanopyHtmlAssets.GetRequiredParts(tree).Select(part => part.Name).ToArray());
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid, CanopyRuntime.Flow }, CanopyHtmlAssets.GetPart("flow").Runtimes);
    }

    [Fact]
    public void Flows_RoundTripTheirDocumentOnNetFramework() {
        // The writer formats numbers with "G17" on .NET Framework; the reader and the canonical values must still round-trip.
        var flow = new CanopyFlow("schedule", "Schedule a report");
        flow.Step("when", "When does it run?", step => step
            .Number("ratio", "Ratio", f => f.Default(0.1).Range(0.05, 2.5).Step(0.05))
            .DateTime("until", "Until", f => f.Default(new DateTimeOffset(2027, 6, 30, 12, 0, 0, TimeSpan.FromHours(2))))
            .Duration("window", "Window", f => f.Default(TimeSpan.FromMinutes(90)))
            .Text("name", "Name", f => f.When(CanopyFlowCondition.GreaterThan("ratio", 0.5))));
        var json = flow.ToContract();
        Assert.Equal(json, CanopyFlow.FromContract(json).ToContract());
        Assert.Contains("\"default\":\"2027-06-30T10:00:00Z\"", json);
        Assert.Contains("\"default\":\"PT1H30M\"", json);
        var visible = flow.VisibleValues(new Dictionary<string, object?> { ["ratio"] = 0.75, ["name"] = "Weekly" });
        Assert.Equal(new[] { "ratio", "name" }, visible.Keys.ToArray());
    }
}