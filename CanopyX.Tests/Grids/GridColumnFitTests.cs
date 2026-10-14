using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridColumnFitTests {
    [Fact]
    public void SizingPriorityAndPinOptions_WriteTheDocumentedWireFieldsAndStayInTheOrdinaryRuntime() {
        var view = new CanopyDataGridView("rules", "Rules") { RowAction = CanopyGridRowAction.Link, AutoHeight = false, RowAccents = true };
        view.Columns.Add(new CanopyColumn("rule", "Rule") { RowHeader = true, Sizing = CanopyColumnSizing.Flex(2, 120, 480) });
        view.Columns.Add(new CanopyColumn("worst", "Worst") { ResponsivePriority = 0, Pinned = CanopyGridColumnPin.Right });
        view.Columns.Add(new CanopyColumn("weight", "Weight") { Kind = CanopyColumnKind.Number, ResponsivePriority = 10001, Sizing = CanopyColumnSizing.Content(measure: CanopyColumnAutoSize.Header) });
        view.Columns.Add(new CanopyColumn("code", "Code") { Sizing = CanopyColumnSizing.Fixed(90), Pinned = CanopyGridColumnPin.None });
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "column sizing, priority and pins");
        Assert.Contains("\"rowHeader\":true", json);
        Assert.Contains("\"minWidth\":120,\"maxWidth\":480", json);
        Assert.Contains("\"flex\":2", json);
        Assert.Contains("\"priority\":0", json);
        Assert.Contains("\"pinned\":\"right\"", json);
        Assert.Contains("\"priority\":10001", json);
        Assert.Contains("\"autoSize\":\"header\"", json);
        Assert.Contains("\"fixed\":true", json);
        Assert.Contains("\"pinned\":null", json);
        Assert.Contains("\"rowAction\":\"link\"", json);
        Assert.Contains("\"autoHeight\":false", json);
        Assert.Contains("\"rowAccents\":true", json);
        Assert.Equal(CanopyRuntime.DataGrid, CanopyHtmlAssets.GetRuntime(view));
    }

    [Fact]
    public void Defaults_WriteNoLayoutFields() {
        var view = new CanopyDataGridView("rules", "Rules");
        view.Columns.Add(new CanopyColumn("rule", "Rule"));
        var json = view.ToJson();
        foreach (var name in new[] { "rowHeader", "minWidth", "maxWidth", "flex", "priority", "pinned", "autoSize", "fixed", "rowAction", "autoHeight", "rowAccents" })
            Assert.DoesNotContain("\"" + name + "\"", json);
    }

    [Fact]
    public void InvalidLayoutCombinations_AreRejected() {
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyColumnSizing.Content(39));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyColumnSizing.Flex(101));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyColumn("a", "A") { ResponsivePriority = -1 });
        foreach (var invalid in new Action<CanopyDataGridView>[] {
            view => { view.Columns[0].RowHeader = true; view.Columns[1].RowHeader = true; },
            view => view.RowAction = (CanopyGridRowAction)9
        }) {
            var view = new CanopyDataGridView("rules", "Rules");
            view.Columns.Add(new CanopyColumn("a", "A")); view.Columns.Add(new CanopyColumn("b", "B"));
            invalid(view);
            Assert.ThrowsAny<Exception>(() => view.ToJson());
        }
    }

    [Fact]
    public void QuietTones_ApplyToEnumAndStatePresentersOnly() {
        var view = new CanopyDataGridView("targets", "Targets");
        view.Columns.Add(new CanopyColumn("state", "State") { Presenter = CanopyGridPresenter.Enum().WithQuietTones(CanopyTone.Success, CanopyTone.Named("up")) });
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "quiet tones");
        Assert.Contains("\"quietTones\":[\"success\",\"up\"]", json);
        Assert.Throws<InvalidOperationException>(() => CanopyGridPresenter.Link().WithQuietTones(CanopyTone.Success));
        Assert.Throws<ArgumentException>(() => CanopyGridPresenter.State().WithQuietTones(CanopyTone.None));

        // Quiet values in the normal text colour.
        view.Columns[0].Presenter = CanopyGridPresenter.Enum().WithQuietTones(CanopyTone.Neutral).WithQuietStyle(CanopyGridQuietStyle.Plain);
        json = view.ToJson();
        ProtocolSchema.AssertValid(json, "quiet style");
        Assert.Contains("\"quietStyle\":\"plain\"", json);
        Assert.DoesNotContain("quietStyle", new CanopyDataGridView("plain", "Plain") { Columns = { new CanopyColumn("state", "State") { Presenter = CanopyGridPresenter.Enum().WithQuietStyle(CanopyGridQuietStyle.Muted) } } }.ToJson());
        Assert.Throws<InvalidOperationException>(() => CanopyGridPresenter.Link().WithQuietStyle(CanopyGridQuietStyle.Plain));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Enum().WithQuietStyle((CanopyGridQuietStyle)7));
    }
}
