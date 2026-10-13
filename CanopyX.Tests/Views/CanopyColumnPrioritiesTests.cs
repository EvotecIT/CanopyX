using CanopyX.Html;

namespace CanopyX.Tests.Views;

public sealed class CanopyColumnPrioritiesTests {
    [Fact]
    public void Constants_MatchTheRuntimeLevels() {
        Assert.Equal(0, CanopyColumnPriorities.Essential);
        Assert.Equal(5000, CanopyColumnPriorities.Normal);
        Assert.Equal(10000, CanopyColumnPriorities.Optional);
    }

    [Fact]
    public void Constants_AgreeWithTheNamedPrioritiesTheGridRuntimePublishes() {
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.Contains("COLUMN_PRIORITIES=Object.freeze({essential:" + CanopyColumnPriorities.Essential + ",normal:" + CanopyColumnPriorities.Normal +
                ",optional:" + CanopyColumnPriorities.Optional + "})", script);
            Assert.Contains("columnPriorities:COLUMN_PRIORITIES", script);
        }
    }

    [Fact]
    public void ResponsivePriority_WritesTheNamedValues() {
        var view = new CanopyDataGridView("rules", "Rules");
        view.Columns.Add(new CanopyColumn("rule", "Rule") { ResponsivePriority = CanopyColumnPriorities.Essential });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { ResponsivePriority = CanopyColumnPriorities.Normal });
        view.Columns.Add(new CanopyColumn("weight", "Weight") { ResponsivePriority = CanopyColumnPriorities.Optional + 1 });
        var json = view.ToJson();

        Assert.Contains("\"priority\":0", json);
        Assert.Contains("\"priority\":5000", json);
        Assert.Contains("\"priority\":10001", json);
    }
}
