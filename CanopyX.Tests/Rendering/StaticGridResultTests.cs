using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Tests.Rendering;

public sealed class StaticGridResultTests {
    [Theory]
    [InlineData(1)]
    [InlineData(10)]
    public void InlineResult_CapturesDisplayedCellsAndBadgesInDocumentOrder(int limit) {
        var view = new CanopyDataGridView("inline", "Caption outside the rows");
        view.Columns.Add(new CanopyColumn("hidden", "Hidden") { Hidden = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("note", "Note"));
        var amount = new CanopyCell(2) { Text = "<2 KiB>", Title = "Tooltip outside the rows" };
        amount.Badges.Add(new CanopyBadge("Visible <&>"));
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["hidden"] = "Hidden content", ["amount"] = amount } });
        view.Rows.Add(new CanopyGridRow("b") { Cells = { ["amount"] = 3, ["note"] = "Second" } });
        var options = new CanopyStaticHtmlOptions { MaxRows = limit };

        var result = CanopyStaticHtml.RenderGridWithResult(view, options: options);

        Assert.Equal(2L, result.TotalRows);
        Assert.False(result.HasUnknownTotal);
        Assert.Equal(Math.Min(limit, 2), result.Rows.Count);
        Assert.Equal(new[] { "<2 KiB> Visible <&>", "—" }, result.Rows[0]);
        if (limit > 1) Assert.Equal(new[] { "3", "Second" }, result.Rows[1]);
        Assert.Equal(CanopyStaticHtml.RenderGrid(view, options: options), result.Html);
        Assert.Contains("&lt;2 KiB&gt;", result.Html);
        Assert.DoesNotContain("Hidden content", result.Html);
        amount.Text = "Later mutation";
        amount.Badges.Clear();
        Assert.Equal("<2 KiB> Visible <&>", result.Rows[0][0]);
        Assert.Throws<NotSupportedException>(() => ((IList<IReadOnlyList<string>>)result.Rows).Clear());
        Assert.Throws<NotSupportedException>(() => ((IList<string>)result.Rows[0])[0] = "Changed");
    }

    [Fact]
    public void OffsetResult_UsesAcceptedOrderAndMatchingCountRatherThanDatasetSize() {
        var view = Hosted(cursor: false);
        var page = new CanopyGridPage(view.Id, "accepted", 3, 20, 10);
        page.Rows.Add(new CanopyGridRow("second") { Cells = { ["name"] = "Accepted second" } });
        page.Rows.Add(new CanopyGridRow("first") { Cells = { ["name"] = "Accepted first" } });
        var options = new CanopyStaticHtmlOptions { MaxRows = 1 };

        var result = CanopyStaticHtml.RenderGridWithResult(view, page, options);

        Assert.Equal(new[] { "Accepted second" }, Assert.Single(result.Rows));
        Assert.Equal(10L, result.TotalRows);
        Assert.False(result.HasUnknownTotal);
        Assert.Contains("Showing 1 of 10 rows.", result.Html);
        Assert.Equal(CanopyStaticHtml.RenderGrid(view, page, options), result.Html);
        Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.RenderGridWithResult(view));
        Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.RenderGridWithResult(view, new CanopyGridPage("another", "accepted", 0, 0, 0)));
    }

    [Theory]
    [InlineData(false, 27L)]
    [InlineData(true, 30L)]
    public void CursorResult_PreservesAcceptedUnknownCountsBeforeStaticLimits(bool known, long total) {
        var view = Hosted(cursor: true);
        var page = new CanopyGridCursorPage(view.Id, "accepted", 25) { PreviousCursor = "previous", NextCursor = "next", Total = 100 };
        if (known) page.Matched = 30;
        page.Rows.Add(new CanopyGridRow("a") { Cells = { ["name"] = "Accepted <&>" } });
        page.Rows.Add(new CanopyGridRow("b") { Cells = { ["name"] = "Omitted by static limit" } });
        var options = new CanopyStaticHtmlOptions { MaxRows = 1 };

        var result = CanopyStaticHtml.RenderGridWithResult(view, page, options);

        Assert.Equal(new[] { "Accepted <&>" }, Assert.Single(result.Rows));
        Assert.Equal(total, result.TotalRows);
        Assert.Equal(!known, result.HasUnknownTotal);
        Assert.Equal(CanopyStaticHtml.RenderGrid(view, page, options), result.Html);
        Assert.Contains(known ? "Showing 1 of 30 rows." : "Showing 1 of unknown rows.", result.Html);
        view.Source = CanopyGridSource.HostedOffset();
        Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.RenderGridWithResult(view, page));
    }

    [Fact]
    public void EmptyInlineResult_HasAnExactZeroCountAndNoDataRows() {
        var view = new CanopyDataGridView("empty", "Empty");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Empty(result.Rows);
        Assert.Equal(0L, result.TotalRows);
        Assert.False(result.HasUnknownTotal);
        Assert.True(result.IsComplete);
        Assert.Throws<ArgumentNullException>(() => CanopyStaticHtml.RenderGridWithResult(null!));
        Assert.Throws<ArgumentNullException>(() => CanopyStaticHtml.RenderGridWithResult(Hosted(true), (CanopyGridCursorPage)null!));
    }

    private static CanopyDataGridView Hosted(bool cursor) {
        var view = new CanopyDataGridView("host", "Accepted rows") { Source = cursor ? CanopyGridSource.HostedCursor() : CanopyGridSource.HostedOffset() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        return view;
    }
}
