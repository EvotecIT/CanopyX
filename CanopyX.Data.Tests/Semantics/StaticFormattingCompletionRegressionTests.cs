using System.Text.Json;
using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Data.Tests.Semantics;

public sealed class StaticFormattingCompletionRegressionTests {
    [Theory]
    [InlineData("^\\d$", "٥", false)]
    [InlineData("^\\d$", "5", true)]
    [InlineData("^.$", "😀", true)]
    [InlineData("^.$", "\r", false)]
    [InlineData("^[😀]$", "😀", true)]
    [InlineData("^😀{2}$", "😀😀", true)]
    [InlineData("^\\D$", "٥", true)]
    [InlineData("^\\w$", "٥", false)]
    [InlineData("^\\s$", "\u00a0", true)]
    [InlineData("^\\s$", "\u0085", false)]
    [InlineData("^\\S$", "\ufeff", false)]
    [InlineData("^foo$", "foo\n", false)]
    public void RegularPatterns_FollowBrowserUnicodeAtoms(string pattern, string value, bool expected) {
        var view = Grid(); view.Rows.Add(Row("row", value));
        view.FormatRules.Add(Rule(CanopyFormatOperator.Matches, pattern));
        Assert.Equal(expected, HasHit(CanopyStaticHtml.RenderGridWithResult(view), 0));
    }

    [Theory]
    [InlineData("^s$", "ſ", false, true)]
    [InlineData("^s$", "ſ", true, false)]
    [InlineData("^σ$", "ς", false, true)]
    [InlineData("^𐐀$", "𐐨", false, true)]
    [InlineData("^i$", "ı", false, false)]
    [InlineData("^i$", "İ", false, false)]
    [InlineData("^[A-z]$", "_", false, true)]
    [InlineData("^[Σ-σ]$", "Α", false, true)]
    [InlineData("^[^Σ-σ]$", "Α", false, false)]
    [InlineData("^[𐐀-𐐧]$", "𐐨", false, true)]
    [InlineData("^\\bſ\\b$", "ſ", false, true)]
    [InlineData("^\\bſ\\b$", "ſ", true, false)]
    [InlineData("^[\u0001-􏿿]$", "😀", false, true)]
    [InlineData("^[Ā-􏿿]$", "S", false, true)]
    [InlineData("^𐵐$", "𐵰", false, true)]
    [InlineData("^𐕰$", "𐖗", false, true)]
    [InlineData("^\ua7ce$", "\ua7cf", false, true)]
    [InlineData("^𖺠$", "𖺻", false, true)]
    [InlineData("^\u1fd3$", "\u0390", false, true)]
    [InlineData("^\u1fe3$", "\u03b0", false, true)]
    [InlineData("^\ufb06$", "\ufb05", false, true)]
    public void RegularPatterns_CaseClassesAndBoundariesMatchUnicodeBrowserFlags(string pattern, string value, bool exact, bool expected) {
        var view = Grid(); view.Rows.Add(Row("row", value));
        var predicate = new CanopyFormatPredicate("value", CanopyFormatOperator.Matches, pattern) { CaseSensitive = exact };
        view.FormatRules.Add(CanopyFormatRule.ForCell("hit", "name", new CanopyFormatStyle { Cue = "Hit" }, CanopyFormatCondition.All(predicate)));
        Assert.Equal(expected, HasHit(CanopyStaticHtml.RenderGridWithResult(view), 0));
    }

    [Theory]
    [InlineData("foo", "foo", true)]
    [InlineData("foo", "foo\n", false)]
    [InlineData("?", "😀", false)]
    [InlineData("??", "😀", true)]
    public void Wildcards_RequireWholeUtf16Input(string pattern, string value, bool expected) {
        var view = Grid(); view.Rows.Add(Row("row", value)); view.FormatRules.Add(Rule(CanopyFormatOperator.Like, pattern));
        Assert.Equal(expected, HasHit(CanopyStaticHtml.RenderGridWithResult(view), 0));
    }

    [Theory]
    [InlineData("ΟΣ", "ΟΣ", false, null, false)]
    [InlineData("ΟΣ", "ΟΣ", true, null, true)]
    [InlineData("Σ", "Σ", false, null, true)]
    [InlineData("ΟΣ", "ος", false, null, true)]
    [InlineData("ΟΣ", "οσ", false, null, false)]
    [InlineData("ΟΣ", "ΟΣ", false, "el-GR", true)]
    [InlineData("İ", "İ", false, null, true)]
    [InlineData("İ", "İ", false, "en-US", true)]
    [InlineData("İ", "İ", false, "tr-TR", false)]
    [InlineData("I", "I", false, "tr-TR", false)]
    public void Wildcards_KeepBrowserSourceLowercaseAndReaderFolding(string pattern, string value, bool exact, string? culture, bool expected) {
        var view = Grid(); view.Rows.Add(Row("row", value));
        var predicate = new CanopyFormatPredicate("value", CanopyFormatOperator.Like, pattern) { CaseSensitive = exact, Culture = culture };
        view.FormatRules.Add(CanopyFormatRule.ForCell("hit", "name", new CanopyFormatStyle { Cue = "Hit" }, CanopyFormatCondition.All(predicate)));
        Assert.Equal(expected, HasHit(CanopyStaticHtml.RenderGridWithResult(view), 0));
    }

    [Theory]
    [InlineData("tr-TR", "I\u0307", "i")]
    [InlineData("az-Latn-AZ", "I\u0307", "i")]
    [InlineData("tr-TR", "I\u0301\u0307", "ı\u0301\u0307")]
    [InlineData("lt-LT", "I\u0301", "i\u0307\u0301")]
    [InlineData("lt-LT", "J\u0323\u0301", "j\u0307\u0323\u0301")]
    [InlineData("lt-LT", "Ì", "i\u0307\u0300")]
    [InlineData("lt-LT", "Í", "i\u0307\u0301")]
    [InlineData("lt-LT", "Ĩ", "i\u0307\u0303")]
    [InlineData("en-US", "ΟΣ", "ος")]
    [InlineData("en-US", "Ο\u0301Σ", "ο\u0301ς")]
    [InlineData("en-US", "ΟΣ\u0301Α", "οσ\u0301α")]
    [InlineData("en-US", "𐵐Σ", "𐵰ς")]
    [InlineData("en-US", "𐕰", "𐖗")]
    [InlineData("en-US", "𖺠", "𖺻")]
    public void CultureText_UsesUnicodeFullLowercaseContexts(string culture, string raw, string lowercase) {
        var view = Grid(); view.Rows.Add(Row("row", raw));
        var predicate = new CanopyFormatPredicate("value", CanopyFormatOperator.Equal, lowercase) { Culture = culture };
        view.FormatRules.Add(CanopyFormatRule.ForCell("hit", "name", new CanopyFormatStyle { Cue = "Hit" }, CanopyFormatCondition.All(predicate)));
        Assert.True(HasHit(CanopyStaticHtml.RenderGridWithResult(view), 0));
    }

    [Theory]
    [InlineData(0, "2026-10-01T00:00:00Z")]
    [InlineData(125, "2026-10-01T00:00:00.125Z")]
    public void ExplicitDateText_UsesActualScalarWireSpelling(int milliseconds, string expected) {
        var view = Grid(); view.Columns[1].Kind = CanopyColumnKind.DateTime;
        view.Rows.Add(new CanopyGridRow("row") { Cells = { ["name"] = "Date", ["value"] = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc).AddMilliseconds(milliseconds) } });
        var predicate = new CanopyFormatPredicate("value", CanopyFormatOperator.Equal, expected) { ValueType = CanopyFormatValueType.Text, CaseSensitive = true };
        view.FormatRules.Add(CanopyFormatRule.ForCell("date", "name", new CanopyFormatStyle { Cue = "Hit" }, CanopyFormatCondition.All(predicate)));
        using var document = JsonDocument.Parse(view.ToJson());
        Assert.Equal(expected, document.RootElement.GetProperty("rows")[0].GetProperty("cells").GetProperty("value").GetString());
        Assert.True(HasHit(CanopyStaticHtml.RenderGridWithResult(view), 0));
    }

    [Theory]
    [InlineData(CanopyFormatOperator.GreaterThan, "0", true)]
    [InlineData(CanopyFormatOperator.GreaterThanOrEqual, "2", false)]
    [InlineData(CanopyFormatOperator.LessThan, "2", true)]
    [InlineData(CanopyFormatOperator.LessThanOrEqual, "0", false)]
    [InlineData(CanopyFormatOperator.GreaterThan, "not-number", false)]
    [InlineData(CanopyFormatOperator.GreaterThanOrEqual, "not-number", true)]
    [InlineData(CanopyFormatOperator.GreaterThan, "", true)]
    [InlineData(CanopyFormatOperator.LessThan, "0x2", true)]
    [InlineData(CanopyFormatOperator.LessThan, "0b10", true)]
    [InlineData(CanopyFormatOperator.LessThan, "0o2", true)]
    [InlineData(CanopyFormatOperator.GreaterThan, "-1e400", true)]
    [InlineData(CanopyFormatOperator.LessThan, "1e400", true)]
    [InlineData(CanopyFormatOperator.GreaterThan, "1e-99999999999999", true)]
    [InlineData(CanopyFormatOperator.GreaterThan, "0e99999999999999", true)]
    [InlineData(CanopyFormatOperator.GreaterThan, "١e400", false)]
    [InlineData(CanopyFormatOperator.LessThan, "1e٤٠٠", false)]
    [InlineData(CanopyFormatOperator.GreaterThan, "0e١", false)]
    [InlineData(CanopyFormatOperator.Equal, "1", false)]
    public void MixedBooleanTextOrder_UsesJavaScriptRelationalCoercion(CanopyFormatOperator op, string operand, bool expected) {
        var view = Grid(); view.Rows.Add(new CanopyGridRow("row") { Cells = { ["value"] = true } });
        view.FormatRules.Add(Rule(op, operand));
        Assert.Equal(expected, HasHit(CanopyStaticHtml.RenderGridWithResult(view), 0));
    }

    [Theory]
    [InlineData(CanopyFormatOperator.Matches, "^0")]
    [InlineData(CanopyFormatOperator.StartsWith, "0.000001")]
    [InlineData(CanopyFormatOperator.Contains, "0.000001")]
    public void NumericTextOperators_UseActualJavaScriptNumberSpelling(CanopyFormatOperator op, string operand) {
        var view = Grid(); view.Columns[1].Kind = CanopyColumnKind.Number;
        view.Rows.Add(new CanopyGridRow("row") { Cells = { ["value"] = 0.000001 } });
        view.FormatRules.Add(Rule(op, operand));
        Assert.True(HasHit(CanopyStaticHtml.RenderGridWithResult(view), 0));
    }

    [Theory]
    [InlineData(false, "50%")]
    [InlineData(true, "100%")]
    public void AcceptedPage_BoundsUseFullInlineRowsOrSuppliedHostedRows(bool hosted, string width) {
        var view = Grid(); view.Columns[1].Kind = CanopyColumnKind.Number;
        for (var index = 0; index < 3; index++) view.Rows.Add(new CanopyGridRow("row-" + index) { Cells = { ["value"] = index * 50 } });
        var page = new CanopyGridPage(view.Id, "accepted", 0, 3, 1); page.Rows.Add(view.Rows[1]);
        if (hosted) { view.Rows.Clear(); view.Source = CanopyGridSource.HostedOffset(); }
        view.FormatRules.Add(CanopyFormatRule.ForCell("bar", "value", CanopyFormatStyle.DataBar(CanopyTone.Info)));

        var result = CanopyStaticHtml.RenderGridWithResult(view, page);

        Assert.Contains("width:" + width + ";", result.Html);
        Assert.Single(result.Rows);
    }

    private static CanopyFormatRule Rule(CanopyFormatOperator op, string operand) =>
        CanopyFormatRule.ForCell("hit", "name", new CanopyFormatStyle { Cue = "Hit" }, CanopyFormatCondition.Where("value", op, operand));

    private static bool HasHit(CanopyStaticHtmlResult result, int row) => result.Rows[row][0].Contains("Hit");

    private static CanopyGridRow Row(string id, string value) => new(id) { Cells = { ["value"] = value } };

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("completion", "Completion");
        view.Columns.Add(new CanopyColumn("name", "Record")); view.Columns.Add(new CanopyColumn("value", "Value")); return view;
    }
}
