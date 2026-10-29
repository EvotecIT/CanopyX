using CanopyX.Rendering;

namespace CanopyX.Tests.Rendering;

public sealed class StaticStackTests {
    [Fact]
    public void StackStatic_EscapesHostTextAndCapturesOrderedStatesAndBadges() {
        var view = Grid();
        view.Stack!.Layers[0].Label = "<context>";
        view.Stack.Layers[0].Enforced = true;
        view.Stack.Layers[0].Reason = "<script>alert(1)</script>";
        view.Stack.Layers[0].Badges.Add(new CanopyBadge("<reviewed>") { Title = "\" onmouseover=\"bad" });
        view.Stack.Layers[1].Filtered = true;
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Equal(3, result.TotalRows); Assert.True(result.IsComplete); Assert.False(result.HasUnknownTotal);
        Assert.Equal(new[] { "1", "2", "3" }, result.Rows.Select(row => row[0]));
        Assert.Equal("<context>", result.Rows[0][2]);
        Assert.Equal("<script>alert(1)</script>", result.Rows[0][3]);
        Assert.Contains(view.Labels.StackEnforced, result.Rows[0][4]);
        Assert.Contains(view.Labels.StackFiltered, result.Rows[1][4]);
        Assert.Contains(view.Labels.StackWinner, result.Rows[2][4]);
        Assert.Equal("<reviewed>", result.Rows[0][5]);
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;", result.Html);
        Assert.Contains("&lt;context&gt;", result.Html); Assert.Contains("&lt;reviewed&gt;", result.Html);
        Assert.Contains("&quot; onmouseover=&quot;bad", result.Html);
        Assert.DoesNotContain("<script", result.Html); Assert.DoesNotContain("class=", result.Html);
        Assert.DoesNotContain("<style", result.Html); Assert.DoesNotContain("<button", result.Html);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void StackStatic_ReservesWinnerWithinRowBudgetAndDisclosesLayerTruncation(int budget) {
        var view = Grid();
        var result = CanopyStaticHtml.RenderGridWithResult(view, options: new CanopyStaticHtmlOptions {
            MaxRows = budget, FullReportUrl = "https://example.com/?a=1&b=2"
        });
        Assert.Equal(budget, result.Rows.Count); Assert.Equal(3, result.TotalRows); Assert.False(result.IsComplete);
        Assert.Equal("3", result.Rows.Last()[0]); Assert.Equal("Winning reason", result.Rows.Last()[3]);
        if (budget == 2) Assert.Equal("1", result.Rows[0][0]);
        Assert.Equal(budget, result.Html.Split("<li value=", StringSplitOptions.None).Length - 1);
        Assert.Contains("value=\"3\"", result.Html);
        Assert.Contains("winning layer is always included", result.Html);
        Assert.Contains(budget + " of 3 layers", result.Html);
        Assert.Contains("href=\"https://example.com/?a=1&amp;b=2\"", result.Html);
    }

    [Fact]
    public void StackStatic_UsesTitleDefaultsAndCountsRepeatedRecordLayers() {
        var view = Grid();
        view.Columns.Insert(0, new CanopyColumn("other", "Other"));
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.All(result.Rows, row => Assert.Equal("Shared <defaults>", row[1]));
        Assert.Equal(3, result.Rows.Count);
        view.Columns[1].RowHeader = false;
        view.Rows[0].Cells["other"] = "First visible";
        Assert.All(CanopyStaticHtml.RenderGridWithResult(view).Rows, row => Assert.Equal("First visible", row[1]));
        view.Stack!.TitleColumn = "title";
        Assert.All(CanopyStaticHtml.RenderGridWithResult(view).Rows, row => Assert.Equal("Shared <defaults>", row[1]));
    }

    [Fact]
    public void StackStatic_EmptyStateIsCompleteAndSharedOverflowRejectsUnsafeLinks() {
        var view = Grid(); view.Stack!.Layers.Clear();
        var empty = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Empty(empty.Rows); Assert.Equal(0, empty.TotalRows); Assert.True(empty.IsComplete);
        Assert.Contains(view.Labels.StackEmpty, empty.Html);
        view = Grid();
        var partial = CanopyStaticHtml.RenderGridWithResult(view, options: new CanopyStaticHtmlOptions {
            MaxRows = 1, FullReportUrl = "javascript:alert(1)", OverflowNote = "Only {shown}/{total} layers."
        });
        Assert.Contains("Only 1/3 layers.", partial.Html); Assert.DoesNotContain("href=", partial.Html);
    }

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("stack-static", "Configuration <layers>") { Stack = new CanopyStack() };
        view.Columns.Add(new CanopyColumn("title", "Configuration") { RowHeader = true });
        view.Rows.Add(new CanopyGridRow("r") { Cells = { ["title"] = "Shared <defaults>" } });
        view.Stack.Layers.Add(new CanopyStackLayer("first", "r", "Starting reason"));
        view.Stack.Layers.Add(new CanopyStackLayer("second", "r", "Filtered reason"));
        view.Stack.Layers.Add(new CanopyStackLayer("third", "r", "Winning reason") { Winner = true });
        return view;
    }
}
