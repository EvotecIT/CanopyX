using CanopyX.Rendering;

namespace CanopyX.Tests.Rendering;

public sealed class StaticPathTests {
    [Fact]
    public void PathStatic_EncodesOrderedTitlesLabelsFlagsAndBadgesWithoutScripts() {
        var view = Grid();
        var chain = new CanopyPathChain("approval", "Route <&>");
        chain.Hops.Add(new CanopyPathHop("b", "Review <script>") {
            Flags = { CanopyPathFlag.Foreign, CanopyPathFlag.Disabled },
            Badges = { new CanopyBadge("Two <&>", CanopyTone.Info) { Title = "Explain \"review\"" } }
        });
        chain.Hops.Add(new CanopyPathHop("a"));
        chain.Hops.Add(new CanopyPathHop("b") { Flags = { CanopyPathFlag.Cycle } });
        view.Path!.Chains.Add(chain);
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.True(result.IsComplete);
        Assert.Equal(3L, result.TotalRows);
        Assert.Equal(3, result.Rows.Count);
        Assert.Contains("Review <script>", result.Rows[0][0]);
        Assert.Contains("Foreign", result.Rows[0][0]);
        Assert.Contains("Disabled", result.Rows[0][0]);
        Assert.Contains("Two <&>", result.Rows[0][0]);
        Assert.Contains("First record", result.Rows[1][0]);
        Assert.Contains("Cycle", result.Rows[2][0]);
        Assert.Contains("Route &lt;&amp;&gt;", result.Html);
        Assert.Contains("&lt;script&gt;", result.Html);
        Assert.Contains("&quot;review&quot;", result.Html);
        Assert.Contains("<ol style=", result.Html);
        Assert.DoesNotContain("<script", result.Html);
        Assert.DoesNotContain("onclick", result.Html);
        Assert.DoesNotContain("class=", result.Html);
        Assert.DoesNotContain("<button", result.Html);
        Assert.Equal(result.Html, CanopyStaticHtml.RenderGrid(view));
        Assert.Throws<NotSupportedException>(() => ((IList<string>)result.Rows[0])[0] = "Changed");
    }

    [Fact]
    public void PathStatic_UsesRowHeaderAndSharedPresenterTextWithoutMutatingColumns() {
        var view = Grid();
        view.Columns[0].RowHeader = false;
        view.Columns.Add(new CanopyColumn("identifier", "Identifier") { RowHeader = true, Hidden = true });
        view.Rows[0].Cells["identifier"] = new CanopyCell("raw") { Text = "Displayed title", Badges = { new CanopyBadge("Title badge") } };
        view.Path!.Chains.Add(Chain("route", "a"));
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Contains("Displayed title", result.Html);
        Assert.Contains("Title badge", result.Rows[0][0]);
        Assert.True(view.Columns[1].Hidden);
        Assert.True(view.Columns[1].RowHeader);
        Assert.Null(view.Path.TitleColumn);
        view.Path.TitleColumn = "title";
        Assert.Contains("First record", CanopyStaticHtml.RenderGrid(view));
    }

    [Fact]
    public void PathStatic_CountsOccurrencesAndReportsTruncationWithSafeReportLinks() {
        var view = Grid();
        view.Path!.Chains.Add(Chain("route", "a", "b", "a"));
        var options = new CanopyStaticHtmlOptions { MaxRows = 2, FullReportUrl = "javascript:alert(1)" };
        var result = CanopyStaticHtml.RenderGridWithResult(view, options: options);
        Assert.False(result.IsComplete);
        Assert.Equal(3L, result.TotalRows);
        Assert.Equal(2, result.Rows.Count);
        Assert.Contains("Showing 2 of 3 steps.", result.Html);
        Assert.DoesNotContain("href=", result.Html);
        options.FullReportUrl = "https://example.test/approvals";
        Assert.Contains("href=\"https://example.test/approvals\"", CanopyStaticHtml.RenderGrid(view, options: options));
        options.MaxRows = 3;
        Assert.True(CanopyStaticHtml.RenderGridWithResult(view, options: options).IsComplete);
    }

    [Fact]
    public void PathStatic_DoesNotSpliceAChainWhenItsSnapshotOmitsAReferencedRecord() {
        var view = Grid();
        view.Path!.Chains.Add(Chain("whole", "a", "b", "a"));
        view.Path.Chains.Add(Chain("available", "a"));
        var page = new CanopyGridPage(view.Id, "snapshot", 0, 2, 2);
        page.Rows.Add(view.Rows[0]);
        var result = CanopyStaticHtml.RenderGridWithResult(view, page);
        Assert.False(result.IsComplete);
        Assert.Single(result.Rows);
        Assert.Equal(4L, result.TotalRows);
        Assert.DoesNotContain("whole</h3>", result.Html);
        Assert.Contains("available</h3>", result.Html);
    }

    [Fact]
    public void PathStatic_UsesLocalizedEmptyStateAndAnnotations() {
        var view = Grid();
        view.Labels.PathEmpty = "No supplied routes";
        Assert.Contains("No supplied routes", CanopyStaticHtml.RenderGrid(view));
        view.Labels.PathCycle = "Return step";
        view.Path!.Chains.Add(Chain("repeat", "a", "a"));
        view.Path.Chains[0].Hops[1].Flags.Add(CanopyPathFlag.Cycle);
        Assert.Contains("Return step", CanopyStaticHtml.RenderGrid(view));
    }

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("path", "Approval paths") { Path = new CanopyPath() };
        view.Columns.Add(new CanopyColumn("title", "Step") { RowHeader = true });
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["title"] = "First record" } });
        view.Rows.Add(new CanopyGridRow("b") { Cells = { ["title"] = "Second <record>" } });
        return view;
    }

    private static CanopyPathChain Chain(string id, params string[] records) {
        var chain = new CanopyPathChain(id, id);
        foreach (var record in records) chain.Hops.Add(new CanopyPathHop(record));
        return chain;
    }
}
