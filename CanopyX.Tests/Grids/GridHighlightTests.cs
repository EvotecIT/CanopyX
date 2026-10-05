using System.Text.Json;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridHighlightTests {
    [Fact]
    public void RowDefaultsAndOrderedTypedRulesRoundTripAndRenderWithoutScripts() {
        var view = new CanopyGridView("highlights", "Highlighted records");
        view.Columns.Add(new CanopyColumn("status", "Status") { Wrap = true });
        view.Columns.Add(new CanopyColumn("score", "Score") { Kind = CanopyColumnKind.Number });
        var row = new CanopyGridRow("one") { Tone = CanopyTone.Info, ClassName = "host-row" };
        row.Cells["status"] = new CanopyCell("FaIlEd") { Text = "Passed display text" }; row.Cells["score"] = 5;
        view.Rows.Add(row);
        view.HighlightRules.Add(new CanopyGridHighlightRule(new CanopyGridFilter("status", CanopyGridFilterOperator.Equal, "failed"), CanopyTone.Danger, "critical"));
        view.HighlightRules.Add(new CanopyGridHighlightRule(new CanopyGridFilter("status", CanopyGridFilterOperator.Contains, "fail"), CanopyTone.Success, "later"));
        view.HighlightRules.Add(new CanopyGridHighlightRule(new CanopyGridFilter("score", CanopyGridFilterOperator.GreaterThanOrEqual, 5),
            CanopyTone.Warning, "high-score", CanopyGridHighlightTarget.Cell));
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "grid highlight rules");
        using var document = JsonDocument.Parse(json);
        Assert.Equal("info", document.RootElement.GetProperty("rows")[0].GetProperty("tone").GetString());
        Assert.Equal("ge", document.RootElement.GetProperty("highlightRules")[2].GetProperty("operator").GetString());
        Assert.Equal("cell", document.RootElement.GetProperty("highlightRules")[2].GetProperty("target").GetString());
        var html = CanopyStaticHtml.RenderGrid(view);
        Assert.Contains("class=\"host-row critical\"", html); Assert.DoesNotContain("later", html);
        Assert.Contains("class=\"high-score\"", html); Assert.Contains("Passed display text", html);
        Assert.Contains("white-space:pre-wrap", html); Assert.DoesNotContain("<script", html);
    }

    [Fact]
    public void RuleValidationUsesTheFilterContractAndRejectsUndeclaredOrUndecoratedRules() {
        var filter = new CanopyGridFilter("name", CanopyGridFilterOperator.Equal, "A");
        Assert.Throws<ArgumentException>(() => new CanopyGridHighlightRule(filter));
        Assert.Throws<ArgumentException>(() => new CanopyGridHighlightRule(filter, className: "bad\nclass"));
        var view = new CanopyGridView("rules", "Rules"); view.Columns.Add(new CanopyColumn("name", "Name"));
        view.HighlightRules.Add(new CanopyGridHighlightRule(new CanopyGridFilter("missing", CanopyGridFilterOperator.IsNull), CanopyTone.Warning));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.HighlightRules.Clear();
        view.HighlightRules.Add(new CanopyGridHighlightRule(new CanopyGridFilter("name", CanopyGridFilterOperator.GreaterThan, "B"), CanopyTone.Warning));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }
}
