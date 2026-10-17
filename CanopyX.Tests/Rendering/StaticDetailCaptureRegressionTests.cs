using System.Xml.Linq;
using CanopyX.Rendering;

namespace CanopyX.Tests.Rendering;

public sealed class StaticDetailCaptureRegressionTests {
    [Theory]
    [InlineData("table", true)]
    [InlineData("properties", true)]
    [InlineData("html", true)]
    [InlineData("table", false)]
    [InlineData("properties", false)]
    [InlineData("html", false)]
    public void GridDetails_CaptureDocumentOrderAndHonorPrintWithoutChangingOuterCount(string kind, bool print) {
        var view = Grid();
        view.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { Print = print } };
        view.Rows[0].Detail = Detail(kind);

        var result = CanopyStaticHtml.RenderGridWithResult(view);

        Assert.Equal(2L, result.TotalRows);
        Assert.False(result.HasUnknownTotal);
        Assert.True(result.IsComplete);
        Assert.Equal(print ? 3 : 2, result.Rows.Count);
        Assert.Equal("First record", Assert.Single(result.Rows[0]));
        Assert.Equal("Second record", Assert.Single(result.Rows[result.Rows.Count - 1]));
        if (print) {
            Assert.Equal(DetailText(kind), Assert.Single(result.Rows[1]));
            Assert.Throws<NotSupportedException>(() => ((IList<string>)result.Rows[1])[0] = "Changed");
            view.Rows[0].Detail = new CanopyHtmlDetail("Later mutation");
            Assert.Equal(DetailText(kind), result.Rows[1][0]);
        } else {
            Assert.DoesNotContain("Detail value", result.Html);
        }
        Assert.DoesNotContain("Showing", result.Html);
        Assert.DoesNotContain("Outer caption", string.Join(" ", result.Rows.SelectMany(row => row)));
        Assert.DoesNotContain("Outer header", string.Join(" ", result.Rows.SelectMany(row => row)));
        if (print && kind == "html") Assert.Contains("&lt;b&gt;Detail value&lt;/b&gt;", result.Html);
    }

    [Theory]
    [InlineData(false, 1)]
    [InlineData(false, 2)]
    [InlineData(false, 3)]
    [InlineData(false, 4)]
    [InlineData(true, 1)]
    [InlineData(true, 2)]
    [InlineData(true, 3)]
    [InlineData(true, 4)]
    public void NestedRows_ShareGlobalBudgetWithoutCountingDetailWrappersAsOuterRecords(bool tree, int limit) {
        var view = Nested(tree);
        var options = new CanopyStaticHtmlOptions { MaxRows = limit, OverflowNote = "LIMIT {shown}/{total}" };
        var before = view.ToJson();

        var result = CanopyStaticHtml.RenderGridWithResult(view, options: options);

        Assert.Equal(2L, result.TotalRows);
        Assert.Equal(limit == 4 ? 3 : 2, result.Rows.Count);
        Assert.Equal(limit == 4, result.IsComplete);
        Assert.Equal("First record", Assert.Single(result.Rows[0]));
        var detail = Assert.Single(result.Rows[1]);
        Assert.Contains("Nested caption Nested header", detail);
        Assert.Equal(limit >= 2, detail.Contains("Nested first"));
        Assert.Equal(limit >= 3, detail.Contains("Nested second"));
        Assert.DoesNotContain("Hidden payload", result.Html);
        Assert.DoesNotContain("LIMIT", detail);
        if (limit < 4) Assert.Contains("LIMIT 1/2", result.Html);
        else {
            Assert.Equal("Second record", Assert.Single(result.Rows[2]));
            Assert.DoesNotContain("LIMIT", result.Html);
        }
        Assert.Equal(before, view.ToJson());
        Assert.Equal(limit, options.MaxRows);
    }

    [Theory]
    [InlineData("offset", 10L)]
    [InlineData("known-cursor", 10L)]
    [InlineData("unknown-cursor", 5L)]
    public void AcceptedPages_CaptureDetailsWithoutInflatingShownOrMatchingCounts(string mode, long expectedTotal) {
        var view = Grid(); view.Rows.Clear();
        view.Source = mode == "offset" ? CanopyGridSource.HostedOffset() : CanopyGridSource.HostedCursor();
        view.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail() };
        var first = new CanopyGridRow("a") { Cells = { ["record"] = "Accepted first" }, Detail = Detail("properties") };
        var second = new CanopyGridRow("b") { Cells = { ["record"] = "Accepted second" } };
        var options = new CanopyStaticHtmlOptions { MaxRows = 1 };
        CanopyStaticHtmlResult result;
        if (mode == "offset") {
            var page = new CanopyGridPage(view.Id, "accepted", 3, 20, 10);
            page.Rows.Add(first); page.Rows.Add(second);
            result = CanopyStaticHtml.RenderGridWithResult(view, page, options);
        } else {
            var page = new CanopyGridCursorPage(view.Id, "accepted", 3) { PreviousCursor = "previous", NextCursor = "next" };
            if (mode == "known-cursor") page.Matched = 10;
            page.Rows.Add(first); page.Rows.Add(second);
            result = CanopyStaticHtml.RenderGridWithResult(view, page, options);
        }
        Assert.Equal(2, result.Rows.Count);
        Assert.Equal("Accepted first", Assert.Single(result.Rows[0]));
        Assert.Equal(DetailText("properties"), Assert.Single(result.Rows[1]));
        Assert.Equal(expectedTotal, result.TotalRows);
        Assert.Equal(mode == "unknown-cursor", result.HasUnknownTotal);
        Assert.False(result.IsComplete);
        Assert.Contains(mode == "unknown-cursor" ? "Showing 1 of unknown rows." : "Showing 1 of 10 rows.", result.Html);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void NestedDetailPayloads_RenderRecursivelyAndTreeDetailLeavesReplaceOrdinaryCells(bool tree) {
        var view = Nested(tree);
        if (tree) {
            var detail = (CanopyTreeDetail)view.Rows[0].Detail!;
            detail.Roots[0].Detail = Detail("properties");
        } else {
            view.Reporting!.Detail!.View!.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail() };
            ((CanopyGridRowsDetail)view.Rows[0].Detail!).Rows[0].Detail = Detail("properties");
        }
        _ = view.ToJson(); // Supported payload and nested definition must pass the actual protocol validator.

        var result = CanopyStaticHtml.RenderGridWithResult(view);

        Assert.Contains("Detail value", result.Html);
        Assert.True(result.IsComplete);
        Assert.Contains(DetailText("properties"), Assert.Single(result.Rows[1]));
        Assert.Equal(!tree, result.Html.Contains("Nested first"));
        Assert.Contains("Nested second", result.Rows[1][0]);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void NestedTree_HonorsDepthAndExpansionLimitsUsingStandaloneProjection(bool onlyExpanded) {
        var view = Nested(true);
        var detail = (CanopyTreeDetail)view.Rows[0].Detail!;
        detail.Roots.RemoveAt(1);
        detail.Roots[0].Children.Add(new CanopyNode("child", "Hidden child"));
        var options = new CanopyStaticHtmlOptions { MaxDepth = onlyExpanded ? 10 : 1, OnlyExpanded = onlyExpanded };

        var result = CanopyStaticHtml.RenderGridWithResult(view, options: options);

        Assert.DoesNotContain("Hidden child", result.Html);
        Assert.False(result.IsComplete);
        Assert.Contains("Nested first (+1)", result.Rows[1][0]);
        Assert.DoesNotContain("Showing", result.Rows[1][0]);
        Assert.Contains("Showing 1 of 2 rows.", result.Html);
        Assert.Equal(2L, result.TotalRows);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void FormattedGridRows_CaptureVisibleFormattingAndPresentersButExcludeLegend(bool nested) {
        var view = Grid();
        var target = view;
        if (nested) { view = Nested(false); target = view.Reporting!.Detail!.View!; }
        var column = target.Columns[0]; column.Presenter = CanopyGridPresenter.Boolean();
        var rows = nested ? ((CanopyGridRowsDetail)view.Rows[0].Detail!).Rows : view.Rows;
        rows[0].Cells[column.Id] = new CanopyCell(true) { Badges = { new CanopyBadge("Cell badge") } };
        target.Formatting = new CanopyFormatOptions { Legend = true };
        var rule = CanopyFormatRule.ForCell("status", column.Id,
            new CanopyFormatStyle { Tone = CanopyTone.Warning, Icon = "!", Badge = "Rule badge", Cue = "Rule cue" });
        rule.Label = "Legend excluded"; target.FormatRules.Add(rule);

        var result = CanopyStaticHtml.RenderGridWithResult(view);

        var text = nested ? Assert.Single(result.Rows[1]) : Assert.Single(result.Rows[0]);
        Assert.Contains("! ✓ Cell badge Rule badge Rule cue", text);
        Assert.DoesNotContain("Legend excluded", text);
        Assert.Contains("Legend excluded", result.Html);
        Assert.True(result.IsComplete);
        Assert.Contains("Rule badge", XElement.Parse(result.Html).Value);
    }

    [Theory]
    [InlineData(2, true)]
    [InlineData(3, true)]
    [InlineData(4, true)]
    [InlineData(2, false)]
    public void RecursiveNestedGrid_SharesRemainingBudgetAndHonorsInnerPrint(int limit, bool print) {
        var view = Nested(false);
        var child = new CanopyDataGridView("grandchild", "Grandchild template");
        child.Columns.Add(new CanopyColumn("value", "Grandchild header"));
        var nested = view.Reporting!.Detail!.View!;
        nested.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = child, Print = print } };
        var nestedRows = (CanopyGridRowsDetail)view.Rows[0].Detail!;
        nestedRows.Rows[0].Detail = new CanopyGridRowsDetail { Rows = {
            new CanopyGridRow("deep") { Cells = { ["value"] = "Deep record" } }
        } };
        var before = view.ToJson();

        var result = CanopyStaticHtml.RenderGridWithResult(view, options: new CanopyStaticHtmlOptions { MaxRows = limit });

        Assert.Equal(print && limit >= 3, result.Html.Contains("Deep record"));
        Assert.Equal(print && limit >= 3, result.Rows[1][0].Contains("Deep record"));
        Assert.Equal(print && limit >= 4, result.Rows[1][0].Contains("Nested second"));
        Assert.DoesNotContain("Showing", result.Rows[1][0]);
        Assert.DoesNotContain("Second record", result.Html);
        Assert.Equal(2L, result.TotalRows);
        Assert.Equal(before, view.ToJson());
        Assert.False(result.IsComplete);
    }

    private static CanopyDetail Detail(string kind) => kind switch {
        "table" => new CanopyTableDetail("Detail caption").AddColumns("Key", "Value").AddRow("Setting", "Detail value"),
        "properties" => new CanopyPropertiesDetail().Add("Setting", "Detail value"),
        _ => new CanopyHtmlDetail("<b>Detail value</b>")
    };

    private static string DetailText(string kind) => kind switch {
        "table" => "Detail caption Key Value Setting Detail value",
        "properties" => "Setting Detail value",
        _ => "<b>Detail value</b>"
    };

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("outer", "Outer caption");
        view.Columns.Add(new CanopyColumn("record", "Outer header"));
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["record"] = "First record" } });
        view.Rows.Add(new CanopyGridRow("b") { Cells = { ["record"] = "Second record" } });
        return view;
    }

    private static CanopyDataGridView Nested(bool useTree) {
        var view = Grid();
        if (useTree) {
            var tree = new CanopyTreeView("nested-tree", "Template caption");
            tree.Columns.Add(new CanopyColumn("name", "Nested header"));
            tree.Columns.Add(new CanopyColumn("hidden", "Hidden header") { Hidden = true });
            view.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { TreeView = tree, Label = "Nested caption" } };
            view.Rows[0].Detail = new CanopyTreeDetail { Roots = {
                new CanopyNode("first", "Nested first") { Cells = { ["hidden"] = "Hidden payload" } },
                new CanopyNode("second", "Nested second")
            } };
        } else {
            var grid = new CanopyDataGridView("nested-grid", "Template caption");
            grid.Columns.Add(new CanopyColumn("name", "Nested header"));
            grid.Columns.Add(new CanopyColumn("hidden", "Hidden header") { Hidden = true });
            view.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = grid, Label = "Nested caption" } };
            view.Rows[0].Detail = new CanopyGridRowsDetail { Rows = {
                new CanopyGridRow("first") { Cells = { ["name"] = "Nested first", ["hidden"] = "Hidden payload" } },
                new CanopyGridRow("second") { Cells = { ["name"] = "Nested second" } }
            } };
        }
        return view;
    }
}
