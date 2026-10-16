using System.Xml.Linq;
using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Data.Tests.Semantics;

public sealed class StaticFormattingParityRegressionTests {
    [Theory]
    [InlineData(CanopyFormatTarget.Cell, "id")]
    [InlineData(CanopyFormatTarget.Row, "id")]
    [InlineData(CanopyFormatTarget.Columns, "id")]
    [InlineData(CanopyFormatTarget.Cell, "label")]
    [InlineData(CanopyFormatTarget.Row, "label")]
    [InlineData(CanopyFormatTarget.Columns, "label")]
    [InlineData(CanopyFormatTarget.Cell, "description")]
    [InlineData(CanopyFormatTarget.Row, "description")]
    [InlineData(CanopyFormatTarget.Columns, "description")]
    public void AccessibleDescriptions_UseDescriptionThenLabelThenIdForEveryTarget(CanopyFormatTarget target, string source) {
        var view = Grid();
        view.Formatting = new CanopyFormatOptions { Legend = true };
        view.Rows.Add(new CanopyGridRow("row") { Cells = {
            ["name"] = new CanopyCell("Record") { Title = "Own tooltip" }, ["value"] = "Value"
        } });
        var rule = new CanopyFormatRule("fallback-id", new CanopyFormatStyle { Cue = "Visible cue" }) { Target = target };
        if (target == CanopyFormatTarget.Cell) rule.Column = "name";
        if (target == CanopyFormatTarget.Columns) { rule.Columns.Add("name"); rule.Columns.Add("value"); }
        if (source != "id") rule.Label = "Readable <&> label";
        if (source == "description") rule.Description = "Explicit <&> description";
        view.FormatRules.Add(rule);

        var result = CanopyStaticHtml.RenderGridWithResult(view);

        var cells = Cells(result.Html, 0);
        var expected = source == "description" ? rule.Description : source == "label" ? rule.Label : rule.Id;
        Assert.Equal("Own tooltip, " + expected, cells[0].Attribute("title")!.Value);
        if (target == CanopyFormatTarget.Columns) Assert.Equal(expected, cells[1].Attribute("title")!.Value);
        else Assert.Null(cells[1].Attribute("title"));
        Assert.Equal(source != "id", result.Html.Contains("Formatting legend:"));
        Assert.Contains("Visible cue", result.Rows[0][0]);
        Assert.DoesNotContain("Own tooltip", string.Join(" ", result.Rows[0]));
    }

    [Theory]
    [InlineData(CanopyFormatOperator.Matches)]
    [InlineData(CanopyFormatOperator.NotMatches)]
    [InlineData(CanopyFormatOperator.Like)]
    [InlineData(CanopyFormatOperator.NotLike)]
    public void Patterns_TestFirst4096Utf16UnitsIncludingExactAndSupplementaryBoundaries(CanopyFormatOperator op) {
        var view = Grid();
        var within = string.Concat(Enumerable.Repeat("😀", 2047)) + "aZ";
        var beyond = string.Concat(Enumerable.Repeat("😀", 2048)) + "Z";
        view.Rows.Add(new CanopyGridRow("within") { Cells = { ["name"] = "Within", ["value"] = within + "tail" } });
        view.Rows.Add(new CanopyGridRow("beyond") { Cells = { ["name"] = "Beyond", ["value"] = beyond } });
        view.Rows.Add(new CanopyGridRow("exact") { Cells = { ["name"] = "Exact", ["value"] = within } });
        var wildcard = op == CanopyFormatOperator.Like || op == CanopyFormatOperator.NotLike;
        view.FormatRules.Add(CanopyFormatRule.ForCell("pattern", "name", new CanopyFormatStyle { Badge = "Pattern hit" },
            CanopyFormatCondition.Where("value", op, wildcard ? "*Z" : "Z$")));

        var result = CanopyStaticHtml.RenderGridWithResult(view);

        var positive = op == CanopyFormatOperator.Like || op == CanopyFormatOperator.Matches;
        Assert.Equal(positive, result.Rows[0][0].Contains("Pattern hit"));
        Assert.Equal(!positive, result.Rows[1][0].Contains("Pattern hit"));
        Assert.Equal(positive, result.Rows[2][0].Contains("Pattern hit"));
        Assert.Equal(within + "tail", result.Rows[0][1]); // The limit applies to matching, never the displayed payload.
    }

    [Fact]
    public void OrdinaryTextConditions_StillReadTextPastPatternBudget() {
        var view = Grid();
        view.Rows.Add(new CanopyGridRow("row") { Cells = { ["value"] = new string('a', 4096) + "needle" } });
        view.FormatRules.Add(CanopyFormatRule.ForCell("contains", "name", new CanopyFormatStyle { Cue = "Found" },
            CanopyFormatCondition.Where("value", CanopyFormatOperator.Contains, "needle")));
        Assert.Contains("Found", CanopyStaticHtml.RenderGridWithResult(view).Rows[0][0]);
    }

    [Theory]
    [InlineData("bar", true)]
    [InlineData("scale", true)]
    [InlineData("bands", true)]
    [InlineData("bar", false)]
    [InlineData("scale", false)]
    [InlineData("bands", false)]
    public void MatchingStopRule_StopsLaterRulesEvenWhenNumericPaintCannotResolve(string kind, bool stop) {
        var view = Grid();
        foreach (var id in new[] { "missing", "null", "text", "number", "unmatched" })
            view.Rows.Add(new CanopyGridRow(id) { Cells = { ["name"] = id == "unmatched" ? "Other" : "Matched" } });
        view.Rows[1].Cells["value"] = new CanopyCell((string?)null);
        view.Rows[2].Cells["value"] = "Non-numeric";
        view.Rows[3].Cells["value"] = "25";
        var style = kind == "bar" ? CanopyFormatStyle.DataBar(CanopyTone.Info, 0, 100)
            : kind == "scale" ? CanopyFormatStyle.ColorScale(CanopyFormatColorScale.TwoColor(CanopyTone.Success, CanopyTone.Danger))
            : CanopyFormatStyle.ThresholdBands(new CanopyFormatBand(50, CanopyTone.Success, "Low"), new CanopyFormatBand(null, CanopyTone.Danger, "High"));
        view.FormatRules.Add(CanopyFormatRule.ForCell("before", "name", new CanopyFormatStyle { Badge = "Before" }));
        var rule = CanopyFormatRule.ForCell("stop", "value", style, CanopyFormatCondition.Where("name", CanopyFormatOperator.Equal, "Matched"));
        rule.StopIfTrue = stop; rule.Label = "Numeric source"; view.FormatRules.Add(rule);
        view.FormatRules.Add(CanopyFormatRule.ForCell("after", "name", new CanopyFormatStyle { Cue = "After" }));

        var result = CanopyStaticHtml.RenderGridWithResult(view);

        for (var index = 0; index < 4; index++) {
            Assert.Contains("Before", result.Rows[index][0]);
            Assert.Equal(!stop, result.Rows[index][0].Contains("After"));
        }
        Assert.Contains("After", result.Rows[4][0]); // A condition that does not match must not stop the row.
        Assert.NotNull(Cells(result.Html, 3)[1].Attribute("title")); // The valid numeric paint still resolves.
        for (var index = 0; index < 3; index++) Assert.Null(Cells(result.Html, index)[1].Attribute("title"));
    }

    private static XElement[] Cells(string html, int row) => XElement.Parse(html).Elements("tbody").First().Elements("tr").ElementAt(row).Elements("td").ToArray();

    [Fact]
    public void MatchingStopRule_WithValueAboveEveryFiniteBandStillStopsLaterRules() {
        var view = Grid();
        view.Rows.Add(new CanopyGridRow("row") { Cells = { ["name"] = "Record", ["value"] = "150" } });
        var rule = CanopyFormatRule.ForCell("finite-bands", "value",
            CanopyFormatStyle.ThresholdBands(new CanopyFormatBand(50, CanopyTone.Success, "Low")));
        rule.StopIfTrue = true; view.FormatRules.Add(rule);
        view.FormatRules.Add(CanopyFormatRule.ForCell("after", "name", new CanopyFormatStyle { Cue = "After" }));

        var result = CanopyStaticHtml.RenderGridWithResult(view);

        Assert.Equal(new[] { "Record", "150" }, Assert.Single(result.Rows));
        Assert.Null(Cells(result.Html, 0)[1].Attribute("title"));
    }

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("formatting", "Formatting parity");
        view.Columns.Add(new CanopyColumn("name", "Record")); view.Columns.Add(new CanopyColumn("value", "Value"));
        return view;
    }
}
