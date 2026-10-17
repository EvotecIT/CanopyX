using System.Text.Json;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>Typed conditional formatting authoring: the JSON schema the browser reads, validation, the parts a grid carries, and labels.</summary>
public sealed class GridFormattingTests {
    [Theory]
    [InlineData("(a+)+$")]
    [InlineData("^(a|aa)+$")]
    [InlineData("^a+a+$")]
    [InlineData("a+$")]
    [InlineData("^(a+)\\1$")]
    [InlineData("a{10000000}")]
    [InlineData("^[\\B]+$")]
    [InlineData("^[\\q]+$")]
    [InlineData("\\-")]
    public void UnsafePatterns_AreRejectedBeforeWritingTheView(string pattern) {
        var view = View();
        view.FormatRules.Add(CanopyFormatRule.ForCell("pattern", "name", CanopyFormatStyle.Highlight(CanopyTone.Info),
            CanopyFormatCondition.All(new CanopyFormatPredicate("name", CanopyFormatOperator.Matches, pattern))));
        Assert.Throws<InvalidOperationException>(() => view.Validate());
    }
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("servers", "Servers");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("status", "Status"));
        view.Columns.Add(new CanopyColumn("cpu", "CPU") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("seen", "Seen") { Kind = CanopyColumnKind.DateTime });
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["name"] = "web-1", ["status"] = "Down", ["cpu"] = 91, ["seen"] = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc) } });
        return view;
    }

    [Fact]
    public void TypedRules_WriteTheSchemaTheBrowserReads() {
        var view = View();
        view.Formatting = new CanopyFormatOptions { Legend = true, Editor = true };
        var down = new CanopyFormatRule("down", CanopyFormatStyle.Highlight(CanopyTone.Danger)) {
            Label = "Server down", Description = "The server is down", Target = CanopyFormatTarget.Row, StopIfTrue = true,
            When = CanopyFormatCondition.Any(new CanopyFormatPredicate("status", CanopyFormatOperator.Equal, "Down"), new CanopyFormatPredicate("status", CanopyFormatOperator.Like, "off*") { CaseSensitive = true })
        };
        down.When.Groups.Add(CanopyFormatCondition.None(new CanopyFormatPredicate("cpu", CanopyFormatOperator.Between, 0, 10) { ValueType = CanopyFormatValueType.Number, Culture = "de-DE" }));
        view.FormatRules.Add(down);
        view.FormatRules.Add(CanopyFormatRule.ForCell("cpu", "cpu", CanopyFormatStyle.DataBar(CanopyTone.Info, 0, 100)));
        var scale = CanopyFormatRule.ForCell("scale", "cpu", CanopyFormatStyle.ColorScale(CanopyFormatColorScale.ThreeColor(CanopyTone.Success, CanopyTone.Warning, CanopyTone.Danger)));
        scale.Details = false; scale.Enabled = false;
        view.FormatRules.Add(scale);
        var bands = new CanopyFormatRule("bands", CanopyFormatStyle.ThresholdBands(new CanopyFormatBand(50, CanopyTone.Success, "Fine"), new CanopyFormatBand(null, CanopyTone.Named("critical")) { Icon = "!" })) {
            Column = "cpu", Target = CanopyFormatTarget.Columns, Columns = { "name", "cpu" } };
        view.FormatRules.Add(bands);
        var css = CanopyFormatRule.ForCell("css", "seen", new CanopyFormatStyle { Emphasis = CanopyFormatEmphasis.Strong, Tone = CanopyTone.Muted, Icon = CanopyFormatIcons.Clock, Badge = "old", Cue = "stale", ClassName = "stale" },
            new CanopyFormatCondition(CanopyFormatJunction.All, CanopyFormatPredicate.CompareColumns("cpu", CanopyFormatOperator.GreaterThan, "cpu")) {
                Predicates = { new CanopyFormatPredicate("seen", CanopyFormatOperator.OlderThanDays, 7) } });
        css.Style.Css["font-style"] = "italic";
        view.FormatRules.Add(css);
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "formatted grid");
        using var document = JsonDocument.Parse(json);
        var rules = document.RootElement.GetProperty("formatRules");
        Assert.Equal(5, rules.GetArrayLength());
        var first = rules[0];
        Assert.Equal("row", first.GetProperty("target").GetString());
        Assert.True(first.GetProperty("stopIfTrue").GetBoolean());
        Assert.Equal("or", first.GetProperty("when").GetProperty("operator").GetString());
        Assert.Equal("like", first.GetProperty("when").GetProperty("filters")[1].GetProperty("operator").GetString());
        Assert.True(first.GetProperty("when").GetProperty("filters")[1].GetProperty("caseSensitive").GetBoolean());
        var nested = first.GetProperty("when").GetProperty("groups")[0];
        Assert.Equal("none", nested.GetProperty("operator").GetString());
        Assert.Equal("de-DE", nested.GetProperty("filters")[0].GetProperty("culture").GetString());
        Assert.Equal("number", nested.GetProperty("filters")[0].GetProperty("type").GetString());
        Assert.Equal(100, rules[1].GetProperty("style").GetProperty("bar").GetProperty("maximum").GetDouble());
        Assert.False(rules[2].GetProperty("enabled").GetBoolean());
        Assert.False(rules[2].GetProperty("details").GetBoolean());
        Assert.Equal("percent", rules[2].GetProperty("style").GetProperty("scale").GetProperty("stops")[1].GetProperty("type").GetString());
        Assert.False(rules[3].GetProperty("style").GetProperty("bands")[1].TryGetProperty("upperBound", out _));
        Assert.Equal("critical", rules[3].GetProperty("style").GetProperty("bands")[1].GetProperty("tone").GetString());
        Assert.Equal("cpu", rules[4].GetProperty("when").GetProperty("filters")[0].GetProperty("valueColumn").GetString());
        Assert.Equal("italic", rules[4].GetProperty("style").GetProperty("css").GetProperty("font-style").GetString());
        Assert.Equal("strong", rules[4].GetProperty("style").GetProperty("emphasis").GetString());
        Assert.True(document.RootElement.GetProperty("formatting").GetProperty("editor").GetBoolean());
    }

    [Fact]
    public void Validation_RejectsRulesTheBrowserWouldReject() {
        void Rejects(Action<CanopyDataGridView> arrange) {
            var view = View(); arrange(view);
            Assert.ThrowsAny<Exception>(() => view.ToJson());
        }
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "missing", CanopyFormatStyle.Highlight(CanopyTone.Danger))));
        Rejects(view => { view.FormatRules.Add(CanopyFormatRule.ForCell("a", "cpu", CanopyFormatStyle.Highlight(CanopyTone.Danger))); view.FormatRules.Add(CanopyFormatRule.ForCell("a", "cpu", CanopyFormatStyle.Highlight(CanopyTone.Info))); });
        Rejects(view => view.FormatRules.Add(new CanopyFormatRule("row", CanopyFormatStyle.DataBar(CanopyTone.Info)) { Target = CanopyFormatTarget.Row, When = CanopyFormatCondition.Where("cpu", CanopyFormatOperator.IsNotNull) }));
        Rejects(view => view.FormatRules.Add(new CanopyFormatRule("cell", new CanopyFormatStyle { Tone = CanopyTone.Info })));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "cpu", new CanopyFormatStyle())));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "cpu", new CanopyFormatStyle { Icon = CanopyFormatIcons.None })));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "cpu", new CanopyFormatStyle { Icon = "too long" })));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "cpu", CanopyFormatStyle.Highlight(CanopyTone.Info), CanopyFormatCondition.Where("cpu", CanopyFormatOperator.Equal, "many"))));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "cpu", CanopyFormatStyle.Highlight(CanopyTone.Info), CanopyFormatCondition.Where("cpu", CanopyFormatOperator.Between, 9, 1))));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "name", CanopyFormatStyle.Highlight(CanopyTone.Info), CanopyFormatCondition.Where("name", CanopyFormatOperator.Matches, "(unclosed"))));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "name", CanopyFormatStyle.Highlight(CanopyTone.Info),
            new CanopyFormatCondition(CanopyFormatJunction.All, new CanopyFormatPredicate("name", CanopyFormatOperator.Equal, "x") { Culture = "not a culture!" }))));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "seen", CanopyFormatStyle.Highlight(CanopyTone.Info), CanopyFormatCondition.Where("seen", CanopyFormatOperator.WithinLastDays, 40000))));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "cpu", CanopyFormatStyle.ThresholdBands(new CanopyFormatBand(null, CanopyTone.Info), new CanopyFormatBand(5, CanopyTone.Danger)))));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "cpu", CanopyFormatStyle.ThresholdBands(new CanopyFormatBand(9, CanopyTone.Info), new CanopyFormatBand(5, CanopyTone.Danger)))));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "cpu", new CanopyFormatStyle { Scale = new CanopyFormatColorScale(CanopyFormatScaleStop.Minimum(CanopyTone.Info)) })));
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "cpu", new CanopyFormatStyle { Bar = new CanopyFormatDataBar { Minimum = 5, Maximum = 5 } })));
        Rejects(view => { var rule = CanopyFormatRule.ForCell("a", "cpu", CanopyFormatStyle.Highlight(CanopyTone.Info)); rule.Style.Css["background"] = "url(x)"; view.FormatRules.Add(rule); });
        Rejects(view => view.FormatRules.Add(new CanopyFormatRule("a", CanopyFormatStyle.Highlight(CanopyTone.Info)) { Target = CanopyFormatTarget.Columns }));
        Rejects(view => { var rule = CanopyFormatRule.ForCell("a", "cpu", CanopyFormatStyle.Highlight(CanopyTone.Info)); rule.Style.Css["color"] = "red\" onmouseover=\"x"; view.FormatRules.Add(rule); });
        Rejects(view => { var rule = CanopyFormatRule.ForCell("a", "cpu", CanopyFormatStyle.Highlight(CanopyTone.Info)); rule.Style.Css["background"] = "image-set(x 1x)"; view.FormatRules.Add(rule); });
        Rejects(view => view.FormatRules.Add(CanopyFormatRule.ForCell("a", "name", CanopyFormatStyle.Highlight(CanopyTone.Info), CanopyFormatCondition.Where("name", CanopyFormatOperator.Matches, "(?i)web"))));
        Assert.Throws<ArgumentException>(() => CanopyFormatPredicate.CompareColumns("name", CanopyFormatOperator.Like, "status"));
        Assert.Throws<ArgumentException>(() => new CanopyFormatRule("-bad", CanopyFormatStyle.Highlight(CanopyTone.Info)));
        Assert.Throws<ArgumentException>(() => new CanopyFormatPredicate("cpu", CanopyFormatOperator.Between, 1));
        Assert.Throws<ArgumentException>(() => CanopyFormatPredicate.CompareColumns("cpu", CanopyFormatOperator.In, "cpu"));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyFormatScaleStop.Percent(120, CanopyTone.Info));
        var many = View();
        for (var i = 0; i < 65; i++) many.FormatRules.Add(CanopyFormatRule.ForCell("r" + i, "cpu", CanopyFormatStyle.Highlight(CanopyTone.Info)));
        Assert.Throws<InvalidOperationException>(() => many.Validate());
    }

    [Fact]
    public void GridsCarryTheFormattingParts_OnlyWhenTheyFormat() {
        var plain = View();
        Assert.DoesNotContain("formatting", CanopyHtmlAssets.GetRequiredParts(plain).Select(part => part.Name));
        var formatted = View();
        formatted.FormatRules.Add(CanopyFormatRule.ForCell("hot", "cpu", CanopyFormatStyle.Highlight(CanopyTone.Danger)));
        Assert.Equal(new[] { "filter-editor", "export", "formatting" }, CanopyHtmlAssets.GetRequiredParts(formatted).Select(part => part.Name));
        formatted.Formatting = new CanopyFormatOptions { Editor = true };
        Assert.Equal(new[] { "filter-editor", "export", "formatting", "format-editor" }, CanopyHtmlAssets.GetRequiredParts(formatted).Select(part => part.Name));
        var fragment = formatted.ToHtmlFragment();
        Assert.Contains("application/x-canopyx-formatting", fragment);
        Assert.Contains("application/x-canopyx-format-editor", fragment);
        Assert.DoesNotContain("x-canopyx-format", plain.ToHtmlFragment());
        var legendOnly = View();
        legendOnly.Formatting = new CanopyFormatOptions { Legend = true };
        Assert.DoesNotContain("format-editor", CanopyHtmlAssets.GetRequiredParts(legendOnly).Select(part => part.Name));
        var tree = new CanopyTreeView("tree", "Tree"); tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(tree), part => part.Name.StartsWith("format", StringComparison.Ordinal));
    }

    [Fact]
    public void FormatLabels_TravelWithGridsAndStayOutOfTrees() {
        var grid = View(); grid.Labels = CanopyLabels.Polish();
        grid.FormatRules.Add(CanopyFormatRule.ForCell("hot", "cpu", CanopyFormatStyle.Highlight(CanopyTone.Danger)));
        using var gridJson = JsonDocument.Parse(grid.ToJson());
        Assert.Equal("Formatowanie warunkowe", gridJson.RootElement.GetProperty("labels").GetProperty("formatRules").GetString());
        var tree = new CanopyTreeView("tree", "Drzewo") { Labels = CanopyLabels.Polish() };
        tree.Columns.Add(new CanopyColumn("name", "Nazwa")); tree.Roots.Add(new CanopyNode("a", "A"));
        using var treeJson = JsonDocument.Parse(tree.ToJson());
        Assert.False(treeJson.RootElement.GetProperty("labels").TryGetProperty("formatRules", out _));
        Assert.Equal("Mise en forme conditionnelle", CanopyLabels.French().FormatRules);
        Assert.Equal("Formattazione condizionale", CanopyLabels.Italian().FormatRules);
        Assert.Equal("Conditional formatting", new CanopyLabels().FormatRules);
    }
}
