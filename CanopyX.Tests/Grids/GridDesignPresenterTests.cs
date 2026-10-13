using CanopyX.Rendering;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridDesignPresenterTests {
    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(double.NegativeInfinity)]
    public void ChangePresenter_NonfiniteDeltaIsMissingInBothWireAndStaticOutput(double delta) {
        var view = new CanopyDataGridView("finite", "Finite changes");
        view.Columns.Add(new CanopyColumn("value", "Value") { Kind = CanopyColumnKind.Number, Presenter = CanopyGridPresenter.Change("delta") });
        view.Columns.Add(new CanopyColumn("delta", "Delta") { Kind = CanopyColumnKind.Number });
        var row = new CanopyGridRow("record");
        row.Cells["value"] = 10;
        row.Cells["delta"] = delta;
        view.Rows.Add(row);
        using var document = JsonDocument.Parse(view.ToJson());
        Assert.Equal(JsonValueKind.Null, document.RootElement.GetProperty("rows")[0].GetProperty("cells").GetProperty("delta").ValueKind);
        var html = System.Net.WebUtility.HtmlDecode(CanopyStaticHtml.RenderGrid(view));
        Assert.Contains(">10</td>", html);
        Assert.DoesNotContain("NaN", html);
        Assert.DoesNotContain("Infinity", html);
        Assert.DoesNotContain("↑", html);
        Assert.DoesNotContain("↓", html);
    }

    [Fact]
    public void BooleanFactory_RetainsTheParameterlessPublicMethod() {
        Func<CanopyGridPresenter> existingFactory = CanopyGridPresenter.Boolean;
        Assert.Equal(CanopyGridPresenterKind.Boolean, existingFactory().Kind);
        Assert.False(existingFactory().Inverted);
        Assert.NotNull(typeof(CanopyGridPresenter).GetMethod(nameof(CanopyGridPresenter.Boolean), Type.EmptyTypes));
        Assert.True(CanopyGridPresenter.Boolean(true).Inverted);
    }

    [Fact]
    public void ColumnPresentersAndHistory_PreserveRawValuesAndStaticTextForms() {
        var view = new CanopyDataGridView("visual", "Visual history") { StatusBar = true, Noun = "records" };
        view.Columns.Add(new CanopyColumn("id", "Name") { Presenter = CanopyGridPresenter.Identifier(mono: true) });
        view.Columns.Add(new CanopyColumn("flag", "Enabled") { Presenter = CanopyGridPresenter.Boolean() });
        view.Columns.Add(new CanopyColumn("state", "History") { Presenter = CanopyGridPresenter.StatusStrip(), Section = "Status" });
        view.Columns.Add(new CanopyColumn("delta", "Delta") { Kind = CanopyColumnKind.Number, Hidden = true });
        view.Columns.Add(new CanopyColumn("value", "Value") { Kind = CanopyColumnKind.Number, Presenter = CanopyGridPresenter.Change("delta"), Aggregatable = true });
        view.Columns.Add(new CanopyColumn("trend", "Trend") { Presenter = CanopyGridPresenter.SparklineLine(new[] { new CanopyGridThreshold(10, CanopyTone.Success) }, 0, 100) });
        var row = new CanopyGridRow("r1"); row.Cells["id"] = new CanopyCell("alpha") { Secondary = "example.test" }; row.Cells["flag"] = true;
        var history = new CanopyCell("Healthy"); history.Series.Add(new CanopyCellPeriod("Oct 1", state: "Healthy", tone: CanopyTone.Success));
        history.Series.Add(new CanopyCellPeriod("Oct 2", state: "Failing", tone: CanopyTone.Danger)); row.Cells["state"] = history;
        row.Cells["delta"] = -6; row.Cells["value"] = 142;
        var trend = new CanopyCell("10"); trend.Series.Add(new CanopyCellPeriod("Oct 1", 10)); row.Cells["trend"] = trend; view.Rows.Add(row);
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "column presenters and visual metadata");
        using var parsed = JsonDocument.Parse(json); Assert.Equal("Healthy", parsed.RootElement.GetProperty("rows")[0].GetProperty("cells").GetProperty("state").GetProperty("value").GetString());
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Equal(new[] { "alpha · example.test", "✓", "Healthy: 1; Failing: 1", "↓ 6 142", "Oct 1: 10" }, Assert.Single(result.Rows));
        var html = System.Net.WebUtility.HtmlDecode(result.Html); Assert.Contains("✓", html); Assert.Contains("Healthy: 1; Failing: 1", html); Assert.Contains("alpha · example.test", html); Assert.Contains("↓ 6 142", html);
    }

    [Fact]
    public void PresenterContracts_RejectInvalidScalesBindingsAndHistory() {
        Assert.Throws<ArgumentException>(() => CanopyGridPresenter.SparklineLine(minimum: 1));
        Assert.Throws<ArgumentException>(() => CanopyGridPresenter.SparklineBars(new[] { new CanopyGridThreshold(20, CanopyTone.Warning), new CanopyGridThreshold(10, CanopyTone.Danger) }));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCellPeriod("Today", double.NaN));
        var view = new CanopyDataGridView("bad", "Bad"); view.Columns.Add(new CanopyColumn("name", "Name") { Presenter = CanopyGridPresenter.Change("missing") });
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }
}
