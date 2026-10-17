using CanopyX.Rendering;

namespace CanopyX.Tests.Rendering;

public sealed class StaticCompletenessRegressionTests {
    [Theory]
    [InlineData(false, 1, true, false)]
    [InlineData(false, 2, true, false)]
    [InlineData(false, 3, true, true)]
    [InlineData(true, 2, true, false)]
    [InlineData(true, 3, true, true)]
    [InlineData(false, 1, false, true)]
    [InlineData(true, 2, false, true)]
    public void SingleOuterRecord_CompletenessIncludesRecursivePrintablePayloads(bool recursive, int limit, bool print, bool complete) {
        var view = Grid();
        var nested = Grid("nested");
        var payload = new CanopyGridRowsDetail { Rows = { Row("nested-a"), Row("nested-b") } };
        view.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = nested, Print = recursive || print } };
        if (recursive) {
            payload.Rows.RemoveAt(1);
            nested.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = Grid("deep"), Print = print } };
            payload.Rows[0].Detail = new CanopyGridRowsDetail { Rows = { Row("deep") } };
        }
        view.Rows.Add(Row("outer")); view.Rows[0].Detail = payload;

        var result = CanopyStaticHtml.RenderGridWithResult(view, options: new CanopyStaticHtmlOptions { MaxRows = limit });

        Assert.Equal(complete, result.IsComplete);
        Assert.Equal(1L, result.TotalRows);
        Assert.False(result.HasUnknownTotal);
        if (print) Assert.Equal(2, result.Rows.Count);
        Assert.Equal(complete, !result.Html.Contains("Showing"));
    }

    [Theory]
    [InlineData("offset", true, true)]
    [InlineData("offset", false, false)]
    [InlineData("cursor", true, true)]
    [InlineData("unknown-cursor", true, false)]
    public void AcceptedWindow_CompletenessRequiresKnownFullMatchingResult(string mode, bool all, bool complete) {
        var view = Grid();
        view.Source = mode == "offset" ? CanopyGridSource.HostedOffset() : CanopyGridSource.HostedCursor();
        CanopyStaticHtmlResult result;
        if (mode == "offset") {
            var page = new CanopyGridPage(view.Id, "accepted", 0, 10, all ? 2 : 3);
            page.Rows.Add(Row("a")); page.Rows.Add(Row("b"));
            result = CanopyStaticHtml.RenderGridWithResult(view, page);
        } else {
            var page = new CanopyGridCursorPage(view.Id, "accepted", 0);
            if (mode == "cursor") page.Matched = 2;
            page.Rows.Add(Row("a")); page.Rows.Add(Row("b"));
            result = CanopyStaticHtml.RenderGridWithResult(view, page);
        }
        Assert.Equal(complete, result.IsComplete);
        Assert.Equal(mode == "unknown-cursor", result.HasUnknownTotal);
        Assert.Equal(all ? 2L : 3L, result.TotalRows);
    }

    [Theory]
    [InlineData("all", true, 3L, false)]
    [InlineData("rows", false, 3L, false)]
    [InlineData("depth", false, 3L, false)]
    [InlineData("collapsed", false, 3L, false)]
    [InlineData("unloaded", false, 3L, false)]
    [InlineData("unknown", false, 1L, true)]
    [InlineData("empty", true, 0L, false)]
    public void Tree_CompletenessTracksOmittedAndUnloadedContentWithoutChangingCounts(string scenario, bool complete, long total, bool unknown) {
        var view = new CanopyTreeView("tree", "Tree"); view.Columns.Add(new CanopyColumn("name", "Name"));
        var root = new CanopyNode("root", "Root") { Expanded = scenario != "collapsed" };
        root.Children.Add(new CanopyNode("child-a", "Child A")); root.Children.Add(new CanopyNode("child-b", "Child B"));
        view.Roots.Add(root);
        var options = new CanopyStaticHtmlOptions();
        if (scenario == "rows") options.MaxRows = 1;
        if (scenario == "depth") options.MaxDepth = 1;
        if (scenario == "collapsed") options.OnlyExpanded = true;
        if (scenario == "unloaded" || scenario == "unknown") {
            root.Children.Clear(); root.HasChildren = true;
            if (scenario == "unloaded") root.ChildCount = 2;
            view.Source = CanopySource.Remote("children?ref={ref}&cursor={cursor}");
        }
        if (scenario == "empty") view.Roots.Clear();

        var result = CanopyStaticHtml.RenderWithResult(view, options);

        Assert.Equal(complete, result.IsComplete);
        Assert.Equal(total, result.TotalRows);
        Assert.Equal(unknown, result.HasUnknownTotal);
    }

    private static CanopyDataGridView Grid(string id = "outer") {
        var view = new CanopyDataGridView(id, id); view.Columns.Add(new CanopyColumn("name", "Name")); return view;
    }

    private static CanopyGridRow Row(string id) => new(id) { Cells = { ["name"] = id } };
}
