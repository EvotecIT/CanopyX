using CanopyX.Rendering;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

/// <summary>The rating presenter: numeric columns only, a bounded maximum on the wire, and stars with the number in static output.</summary>
public sealed class GridRatingPresenterTests {
    [Fact]
    public void Rating_WritesItsMaximumAndRendersStarsWithTheNumberStatically() {
        var view = new CanopyDataGridView("reviews", "Reviews");
        view.Columns.Add(new CanopyColumn("score", "Score") { Kind = CanopyColumnKind.Number, Presenter = CanopyGridPresenter.Rating(4) });
        var row = new CanopyGridRow("one");
        row.Cells["score"] = 3;
        view.Rows.Add(row);
        using var document = JsonDocument.Parse(view.ToJson());
        var presenter = document.RootElement.GetProperty("columns")[0].GetProperty("presenter");
        Assert.Equal("rating", presenter.GetProperty("kind").GetString());
        Assert.Equal(4, presenter.GetProperty("maximum").GetDouble());
        var html = System.Net.WebUtility.HtmlDecode(CanopyStaticHtml.RenderGrid(view));
        Assert.Contains("★★★☆ 3 / 4", html);
        // The column's number format writes the number; the raw value counts the stars.
        view.GetColumn("score").Format = CanopyGridNumberFormat.Fixed(3);
        row.Cells["score"] = 2.123;
        Assert.Contains("★★☆☆ 2.123 / 4", System.Net.WebUtility.HtmlDecode(CanopyStaticHtml.RenderGrid(view)));
    }

    [Fact]
    public void Rating_NeedsANumericColumnAndTwoToTenStars() {
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Rating(1));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Rating(11));
        var view = new CanopyDataGridView("reviews", "Reviews");
        view.Columns.Add(new CanopyColumn("score", "Score") { Presenter = CanopyGridPresenter.Rating() });
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }
}
