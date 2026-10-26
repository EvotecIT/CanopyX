using System.Text.Json;
using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Tests.Grids;

public sealed class GridFooterStaticTests {
    private static CanopyDataGridView View() {
        var view = GridOptionsContractTests.View();
        view.Columns[1].ClassName = "money"; view.Columns[1].Alignment = "center";
        view.Columns[1].Format = CanopyGridNumberFormat.Fixed(2, "$ ");
        foreach (var scope in new[] { CanopyGridFooterScope.Page, CanopyGridFooterScope.All }) {
            var footer = new CanopyGridFooter(scope == CanopyGridFooterScope.Page ? "page" : "all", "<Totals>", scope);
            footer.Aggregates.Add(new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Sum, "<Sum>"));
            footer.Aggregates.Add(new CanopyGridAggregate("count", "name", CanopyGridAggregateOperation.Count, "Count"));
            footer.Aggregates.Add(new CanopyGridAggregate("custom", "amount", "median", "Median"));
            view.Footers.Add(footer);
        }
        return view;
    }
    private static CanopyGridRow Row(string id, int amount) {
        var row = new CanopyGridRow(id); row.Cells["name"] = id; row.Cells["amount"] = new CanopyCell(amount) { Text = "999" }; return row;
    }

    [Fact]
    public void InlineFooters_AggregateAcceptedRecordsBeforeStaticTruncationAndEscapeLabels() {
        var view = View(); view.Rows.Add(Row("one", 2)); view.Rows.Add(Row("two", 5));
        var result = CanopyStaticHtml.RenderGridWithResult(view, options: new CanopyStaticHtmlOptions { MaxRows = 1 });
        Assert.Single(result.Rows);
        var footer = result.Html.Substring(result.Html.IndexOf("<tfoot>", StringComparison.Ordinal));
        Assert.Equal(2, footer.Split("$ 7.00").Length - 1);
        Assert.Contains("(Page)", footer); Assert.Contains("(All matching)", footer);
        Assert.Contains("&lt;Totals&gt;", footer); Assert.Contains("&lt;Sum&gt;", footer);
        Assert.DoesNotContain("<Totals>", footer); Assert.Contains("Median: Unavailable", footer);
        Assert.Contains("class=\"money\"", footer); Assert.Contains("text-align:center;", footer);
        Assert.DoesNotContain("<script", result.Html); Assert.DoesNotContain("onclick", result.Html);
    }

    [Fact]
    public void PartialHostedFooters_KeepPageAndAllMatchingTruthAndAcceptExplicitCustomNullValues() {
        var view = View(); view.Source = CanopyGridSource.HostedOffset();
        var page = new CanopyGridPage(view.Id, "r1", 1, 3, 3); page.Rows.Add(Row("two", 5));
        var html = CanopyStaticHtml.RenderGrid(view, page);
        Assert.Contains("&lt;Sum&gt;: $ 5.00", html); Assert.Contains("&lt;Sum&gt;: Unavailable", html);
        page.FooterValues["page"] = new Dictionary<string, double?> { ["custom"] = 4 };
        page.FooterValues["all"] = new Dictionary<string, double?> { ["sum"] = 27, ["count"] = 3, ["custom"] = null };
        html = CanopyStaticHtml.RenderGrid(view, page);
        Assert.Contains("&lt;Sum&gt;: $ 27.00", html); Assert.Contains("Median: $ 4.00", html); Assert.Contains("Median: —", html);
        using var json = JsonDocument.Parse(page.ToJson(view));
        Assert.Equal(27, json.RootElement.GetProperty("footerValues").GetProperty("all").GetProperty("sum").GetDouble());
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("footerValues").GetProperty("all").GetProperty("custom").ValueKind);
    }

    [Fact]
    public void FooterValues_RejectUndeclaredUnsafeAndImpossibleCountsButAllowOmittedValues() {
        var view = View(); view.Source = CanopyGridSource.HostedOffset();
        var page = new CanopyGridPage(view.Id, "r1", 0, 2, 2); page.Rows.Add(Row("one", 2));
        page.FooterValues["page"] = new Dictionary<string, double?> { ["count"] = 2 };
        Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        page.FooterValues["page"]["count"] = 1;
        page.FooterValues["page"]["sum"] = double.NaN; Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        page.FooterValues["page"].Remove("sum"); page.FooterValues["page"]["unknown"] = 1; Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        page.FooterValues["page"].Remove("unknown"); Assert.NotEmpty(page.ToJson(view));
        page.FooterValues["unknown"] = new Dictionary<string, double?>(); Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
    }

    [Fact]
    public void FooterDefinitions_RejectCursorNavigationAndMoreThanSixteenRows() {
        var view = View(); view.Source = CanopyGridSource.HostedCursor();
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Source = CanopyGridSource.HostedOffset();
        for (var index = view.Footers.Count; index < 17; index++) {
            var footer = new CanopyGridFooter("footer" + index, "Totals");
            footer.Aggregates.Add(new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Sum, "Sum")); view.Footers.Add(footer);
        }
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void EmptyFooterScopes_RequireNullForCustomAndNumericValuesAndZeroForCounts() {
        var view = View(); view.Source = CanopyGridSource.HostedOffset();
        var page = new CanopyGridPage(view.Id, "empty", 0, 0, 0);
        page.FooterValues["all"] = new Dictionary<string, double?> { ["custom"] = 0 };
        Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        page.FooterValues["all"]["custom"] = null; page.FooterValues["all"]["sum"] = 0;
        Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        page.FooterValues["all"]["sum"] = null; page.FooterValues["all"]["count"] = null;
        Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        page.FooterValues["all"]["count"] = 0;
        using var json = JsonDocument.Parse(page.ToJson(view));
        Assert.Equal(0, json.RootElement.GetProperty("footerValues").GetProperty("all").GetProperty("count").GetDouble());
        Assert.Contains("Median: —", CanopyStaticHtml.RenderGrid(view, page));
    }

    [Fact]
    public void FooterOnlyView_UsesExistingSummaryProtocolWithoutReportingOptions() {
        var view = View(); var query = new CanopyGridQuery(view.Id) { Revision = "r1", Limit = view.PageSize };
        var summary = new CanopyGridSummary(query, 2);
        summary.Aggregates["sum"] = 7; summary.Aggregates["count"] = 2; summary.Aggregates["custom"] = 3.5;
        using var json = JsonDocument.Parse(summary.ToJson(view));
        Assert.Equal(7, json.RootElement.GetProperty("aggregates").GetProperty("sum").GetDouble());
        Assert.Empty(json.RootElement.GetProperty("groups").EnumerateArray());
    }
}
