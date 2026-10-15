using System.Net;
using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>
/// Conditional formatting in script-free output: the static renderer evaluates the rules with the browser part's semantics
/// (conditions, typed values, cultures, patterns, merge order, bars, scales, bands, the legend). Runs on .NET and .NET Framework.
/// </summary>
public sealed class GridFormattingEvaluationTests {
    private static CanopyDataGridView Health() {
        var view = new CanopyDataGridView("health", "Health") { Formatting = new CanopyFormatOptions { Legend = true } };
        view.Columns.Add(new CanopyColumn("name", "Server"));
        view.Columns.Add(new CanopyColumn("status", "Status"));
        view.Columns.Add(new CanopyColumn("cpu", "CPU") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("latency", "Latency") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("seen", "Seen") { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("load", "Load text"));
        var statuses = new[] { "Healthy", "Down", "Degraded", "Healthy" };
        for (var i = 0; i < 4; i++) {
            var row = new CanopyGridRow("r" + i);
            row.Cells["name"] = "web-" + i;
            row.Cells["status"] = statuses[i];
            row.Cells["cpu"] = i * 30;
            row.Cells["latency"] = 100 + i * 100;
            row.Cells["seen"] = DateTime.UtcNow.AddDays(-i * 10);
            row.Cells["load"] = i == 2 ? "1 234,5" : "12,5";
            view.Rows.Add(row);
        }
        return view;
    }

    private static string Row(string html, int index) {
        var body = html.Substring(html.IndexOf("<tbody>", StringComparison.Ordinal));
        var start = 0;
        for (var i = 0; i <= index; i++) start = body.IndexOf("<tr", start + 1, StringComparison.Ordinal);
        return body.Substring(start, body.IndexOf("</tr>", start, StringComparison.Ordinal) - start);
    }

    [Fact]
    public void RowAndCellRules_PaintTintsAccentsIconsAndDescriptions() {
        var view = Health();
        view.FormatRules.Add(new CanopyFormatRule("down", CanopyFormatStyle.Highlight(CanopyTone.Danger)) {
            Label = "Server down", Target = CanopyFormatTarget.Row, When = CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "down")
        });
        view.FormatRules.Add(CanopyFormatRule.ForCell("degraded", "status", new CanopyFormatStyle { Tone = CanopyTone.Warning, Badge = "check" },
            CanopyFormatCondition.Where("status", CanopyFormatOperator.In, "Degraded", "Maintenance")));
        var html = CanopyStaticHtml.RenderGrid(view);
        var down = Row(html, 1);
        Assert.Contains("background:#f9eeee;", down);
        Assert.Contains("border-left:3px solid #b8292a;", down);
        Assert.Contains("✕", down);
        Assert.Contains("title=\"Server down\"", down);
        var degraded = Row(html, 2);
        Assert.Contains("check</span>", degraded);
        Assert.DoesNotContain("⚠", degraded);
        Assert.DoesNotContain("border-left", Row(html, 0));
        Assert.Contains("Formatting legend: <span", html);
    }

    [Fact]
    public void BarsScalesAndBands_ReadTheRuleColumnWithAutomaticBounds() {
        var view = Health();
        view.FormatRules.Add(CanopyFormatRule.ForCell("cpu", "cpu", CanopyFormatStyle.DataBar(CanopyTone.Info)));
        view.FormatRules.Add(CanopyFormatRule.ForCell("latency", "latency", CanopyFormatStyle.ColorScale(CanopyFormatColorScale.TwoColor(CanopyTone.Success, CanopyTone.Danger))));
        var bands = CanopyFormatStyle.ThresholdBands(new CanopyFormatBand(30, CanopyTone.Success, "Low"), new CanopyFormatBand(60, CanopyTone.Warning, "Busy"), new CanopyFormatBand(null, CanopyTone.Danger, "Hot"));
        view.FormatRules.Add(new CanopyFormatRule("bands", bands) { Column = "cpu", Target = CanopyFormatTarget.Columns, Columns = { "name" } });
        var html = CanopyStaticHtml.RenderGrid(view);
        Assert.Contains("width:0%;", Row(html, 0));
        Assert.Contains("width:100%;", Row(html, 3));
        Assert.Contains("width:33.3%;", Row(html, 1));
        Assert.NotEqual(Background(Row(html, 0), 3), Background(Row(html, 3), 3));
        Assert.Contains("title=\"Low\"", Row(html, 0));
        Assert.Contains("title=\"Busy\"", Row(html, 2));
        Assert.Contains("title=\"Hot\"", Row(html, 3));
    }

    private static string Background(string row, int cell) {
        var start = 0;
        for (var i = 0; i <= cell; i++) start = row.IndexOf("<td", start + 1, StringComparison.Ordinal);
        var td = row.Substring(start, row.IndexOf('>', start) - start);
        var at = td.IndexOf("background:", StringComparison.Ordinal);
        return at < 0 ? "" : td.Substring(at, 18);
    }

    [Fact]
    public void Conditions_FollowOperatorsTypesCulturesAndCase() {
        var view = Health();
        void Rule(string id, CanopyFormatCondition when) => view.FormatRules.Add(new CanopyFormatRule(id, new CanopyFormatStyle { Cue = "x" }) { Column = "name", Label = id, When = when });
        Rule("like", CanopyFormatCondition.Where("name", CanopyFormatOperator.Like, "WEB-?"));
        Rule("exact", new CanopyFormatCondition(CanopyFormatJunction.All, new CanopyFormatPredicate("name", CanopyFormatOperator.Equal, "WEB-0") { CaseSensitive = true }));
        Rule("between", CanopyFormatCondition.Where("cpu", CanopyFormatOperator.Between, 30, 60));
        Rule("outside", CanopyFormatCondition.Where("cpu", CanopyFormatOperator.NotIn, 0, 30, 60));
        Rule("polish", new CanopyFormatCondition(CanopyFormatJunction.All, new CanopyFormatPredicate("load", CanopyFormatOperator.GreaterThan, 1000) { ValueType = CanopyFormatValueType.Number, Culture = "pl-PL" }));
        Rule("columns", new CanopyFormatCondition(CanopyFormatJunction.All, CanopyFormatPredicate.CompareColumns("latency", CanopyFormatOperator.GreaterThan, "cpu")));
        Rule("old", CanopyFormatCondition.Where("seen", CanopyFormatOperator.OlderThanDays, 15));
        Rule("none", CanopyFormatCondition.None(new CanopyFormatPredicate("status", CanopyFormatOperator.Equal, "Healthy"), new CanopyFormatPredicate("status", CanopyFormatOperator.Equal, "Down")));
        Rule("pattern", CanopyFormatCondition.Where("status", CanopyFormatOperator.Matches, "^de"));
        var html = WebUtility.HtmlDecode(CanopyStaticHtml.RenderGrid(view));
        // Every matched rule adds its description: the cell title lists them in rule order.
        string Cues(int row) { var cell = Row(html, row); var at = cell.IndexOf("title=\"", StringComparison.Ordinal) + 7; return cell.Substring(at, cell.IndexOf('"', at) - at).Replace(", ", ","); }
        Assert.Equal("like,columns", Cues(0));
        Assert.Equal("like,between,columns", Cues(1));
        Assert.Equal("like,between,polish,columns,old,none,pattern", Cues(2));
        Assert.Equal("like,outside,columns,old", Cues(3));
    }

    [Fact]
    public void Merge_TakesEachAspectFromTheFirstRule_AndStopIfTrueEndsTheRow() {
        var view = Health();
        view.FormatRules.Add(CanopyFormatRule.ForCell("first", "status", new CanopyFormatStyle { Tone = CanopyTone.Danger, Icon = CanopyFormatIcons.Flag }));
        view.FormatRules.Add(CanopyFormatRule.ForCell("second", "status", new CanopyFormatStyle { Tone = CanopyTone.Success, Cue = "later" }));
        view.FormatRules.Add(new CanopyFormatRule("stop", new CanopyFormatStyle { Cue = "stop" }) { Column = "name", StopIfTrue = true, When = CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "Down") });
        view.FormatRules.Add(CanopyFormatRule.ForCell("after", "name", new CanopyFormatStyle { Badge = "after" }));
        view.FormatRules.Add(new CanopyFormatRule("off", new CanopyFormatStyle { Badge = "off" }) { Column = "name", Enabled = false });
        var html = WebUtility.HtmlDecode(CanopyStaticHtml.RenderGrid(view));
        Assert.Contains("⚑", Row(html, 0));
        Assert.Contains(">later</span>", Row(html, 0));
        Assert.Contains("#b8292a", Row(html, 0));
        Assert.DoesNotContain("#177345", Row(html, 0));
        Assert.Contains(">stop</span>", Row(html, 1));
        Assert.DoesNotContain(">after</span>", Row(html, 1));
        Assert.Contains(">after</span>", Row(html, 0));
        Assert.DoesNotContain(">off</span>", html);
    }

    [Fact]
    public void FilterGroups_AreConditions() {
        var group = new CanopyGridFilterGroup(CanopyGridFilterJunction.Any, new CanopyGridFilter("status", CanopyGridFilterOperator.Equal, "Down"));
        group.Groups.Add(new CanopyGridFilterGroup(CanopyGridFilterJunction.All, new CanopyGridFilter("cpu", CanopyGridFilterOperator.GreaterThanOrEqual, 60)));
        var condition = CanopyFormatCondition.FromFilterGroup(group);
        Assert.Equal(CanopyFormatJunction.Any, condition.Junction);
        Assert.Equal(CanopyFormatOperator.Equal, condition.Predicates[0].Operator);
        Assert.Equal(CanopyFormatOperator.GreaterThanOrEqual, condition.Groups[0].Predicates[0].Operator);
        var view = Health();
        view.FormatRules.Add(CanopyFormatRule.ForCell("filter", "name", new CanopyFormatStyle { Cue = "match" }, condition));
        var html = CanopyStaticHtml.RenderGrid(view);
        Assert.DoesNotContain(">match</span>", Row(html, 0));
        Assert.Contains(">match</span>", Row(html, 1));
        Assert.Contains(">match</span>", Row(html, 2));
    }
}
