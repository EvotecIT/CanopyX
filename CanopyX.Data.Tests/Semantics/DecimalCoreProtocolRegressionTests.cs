using CanopyX.Rendering;
using System.Globalization;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class DecimalCoreProtocolRegressionTests {
    [Theory]
    [InlineData("10000000000000.099609375", "10000000000000.1")]
    [InlineData("-10000000000000.099609375", "-10000000000000.1")]
    public void NumericGroupComparer_TiesMatchTheEmittedWireCells(string first, string second) {
        var view = View(first, second);
        using var json = JsonDocument.Parse(view.ToJson());
        var rows = json.RootElement.GetProperty("rows");
        Assert.Equal(rows[0].GetProperty("cells").GetProperty("amount").GetDouble(), rows[1].GetProperty("cells").GetProperty("amount").GetDouble());
        Assert.Equal(0, new CanopyGridGrouping("amount").CreateComparer(view).Compare(view.Rows[0].Cells["amount"]!, view.Rows[1].Cells["amount"]!));
    }

    [Fact]
    public void NumericFacetResponse_RejectsBucketsThatEmitTheSameWireNumber() {
        var view = View("10000000000000.099609375", "10000000000000.1");
        view.Reporting = new CanopyGridReporting(); view.Reporting.FacetColumns.Add("amount");
        var page = new CanopyGridFacetPage(view.Id, "r1", "amount", 2, 2);
        page.Items.Add(new CanopyGridFacetValue(view.Rows[0].Cells["amount"], 1));
        page.Items.Add(new CanopyGridFacetValue(view.Rows[1].Cells["amount"], 1));
        Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
    }

    [Fact]
    public void StaticNumericPredicates_HighlightAndFormatWireEqualDecimals() {
        var view = View("10000000000000.099609375", "10000000000000.1");
        var operand = decimal.Parse("10000000000000.1", CultureInfo.InvariantCulture);
        view.HighlightRules.Add(new CanopyGridHighlightRule(new CanopyGridFilter("amount", CanopyGridFilterOperator.Equal, operand), className: "wire-equal"));
        view.FormatRules.Add(CanopyFormatRule.ForCell("same", "amount", new CanopyFormatStyle { ClassName = "format-equal" },
            CanopyFormatCondition.All(new CanopyFormatPredicate("amount", CanopyFormatOperator.Equal, operand))));
        var html = CanopyStaticHtml.RenderGrid(view);
        Assert.Equal(2, Occurrences(html, "class=\"wire-equal\""));
        Assert.Equal(2, Occurrences(html, "format-equal"));
    }

    [Fact]
    public void StaticTextFormatting_ReadsTheWireNumberTextOfDecimalCells() {
        var view = View("10000000000000.099609375", "10000000000000.1");
        view.FormatRules.Add(CanopyFormatRule.ForCell("text", "amount", new CanopyFormatStyle { ClassName = "text-equal" },
            CanopyFormatCondition.All(new CanopyFormatPredicate("amount", CanopyFormatOperator.Equal, "10000000000000.1") { ValueType = CanopyFormatValueType.Text })));
        Assert.Equal(2, Occurrences(CanopyStaticHtml.RenderGrid(view), "text-equal"));
    }

    private static int Occurrences(string text, string match) {
        var count = 0; var start = 0;
        while ((start = text.IndexOf(match, start, StringComparison.Ordinal)) >= 0) { count++; start += match.Length; }
        return count;
    }
    private static CanopyDataGridView View(string first, string second) {
        var view = new CanopyDataGridView("numbers", "Numbers");
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Rows.Add(new CanopyGridRow("first") { Cells = { ["amount"] = new CanopyCell(decimal.Parse(first, CultureInfo.InvariantCulture)) } });
        view.Rows.Add(new CanopyGridRow("second") { Cells = { ["amount"] = new CanopyCell(decimal.Parse(second, CultureInfo.InvariantCulture)) } });
        return view;
    }
}
