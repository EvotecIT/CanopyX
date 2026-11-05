using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class ChartAuthoringTests {
    [Fact]
    public void ChartIntentAndNumericPresentersSerializeAgainstThePublicSchema() {
        var view = new CanopyDataGridView("analysis", "Analysis") { Reporting = new CanopyGridReporting { Chartable = true } };
        var presenters = new[] { CanopyGridPresenter.SparklineArea(), CanopyGridPresenter.SparklineColumns(), CanopyGridPresenter.SparklineWinLoss(), CanopyGridPresenter.Bullet(6) };
        var row = new CanopyGridRow("one");
        for (var index = 0; index < presenters.Length; index++) {
            var id = "value" + index;
            view.Columns.Add(new CanopyColumn(id, "Measure " + index) { Kind = CanopyColumnKind.Number, Presenter = presenters[index] });
            row.Cells[id] = 3;
        }
        view.Rows.Add(row);
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "chart analysis and chart cells");
        using var parsed = JsonDocument.Parse(json);
        Assert.True(parsed.RootElement.GetProperty("reporting").GetProperty("chartable").GetBoolean());
        Assert.Equal(6, parsed.RootElement.GetProperty("columns")[3].GetProperty("presenter").GetProperty("target").GetDouble());
        var parts = CanopyHtmlAssets.GetRequiredParts(view).Select(part => part.Name).ToArray();
        Assert.Contains("charts", parts); Assert.Contains("chart-cells", parts); Assert.Contains("chart-renderer", parts);
        Assert.Contains("detail-rows", parts);
        Assert.Contains("link", parts);
        Assert.Single(parts, name => name == "chart-renderer");
    }

    [Fact]
    public void OrdinaryGridsCarryNoRendererAndBulletTargetsRejectNonfiniteValues() {
        var view = new CanopyDataGridView("ordinary", "Ordinary");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name is "charts" or "chart-cells" or "chart-renderer");
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Bullet(double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Bullet(double.PositiveInfinity));
        view.Columns[0].Presenter = CanopyGridPresenter.Bullet(6);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }
}
