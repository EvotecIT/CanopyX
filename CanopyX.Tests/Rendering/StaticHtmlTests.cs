using System.Text.RegularExpressions;
using CanopyX.Rendering;

namespace CanopyX.Tests.Rendering;

/// <summary>
/// The static outline goes where no script runs and stylesheets are dropped (email clients, print, Word), so it must
/// carry its presentation in inline styles, encode host text, and say what it left out.
/// </summary>
public sealed class StaticHtmlTests {
    [Fact]
    public void OrdinaryNumericCellsShareTheProtocolMagnitudeConstraint() {
        var view = SmallView();
        var node = view.Roots[0];
        foreach (var cell in new[] { new CanopyCell(long.MaxValue), new CanopyCell(1e20), new CanopyCell(decimal.MaxValue) }) {
            node.Cells["size"] = cell;
            Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.Render(view));
            Assert.Throws<InvalidOperationException>(() => view.ToJson());
        }
        node.Cells["size"] = long.MaxValue.ToString(System.Globalization.CultureInfo.InvariantCulture);
        Assert.Contains("9223372036854775807", CanopyStaticHtml.Render(view));
    }

    [Fact]
    public void HiddenCountEncodesCustomCultureSeparators() {
        var view = new CanopyView("culture", "Culture") { Source = CanopySource.Remote("c?ref={ref}&cursor={cursor}") };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Roots.Add(new CanopyNode("root", "Root") { HasChildren = true, ChildCount = 1000 });
        var culture = (System.Globalization.CultureInfo)System.Globalization.CultureInfo.InvariantCulture.Clone();
        culture.NumberFormat.NumberGroupSeparator = "<img src=x>";
        var html = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { Culture = culture });
        Assert.DoesNotContain("<img", html);
        Assert.Contains("(+1&lt;img src=x&gt;000)", html);
    }

    [Fact]
    public void Render_HtmlDetails_AreEncodedInTheScriptFreeFallback() {
        var view = SmallView();
        view.Roots.Add(new CanopyNode("html", "Markup") { Detail = new CanopyHtmlDetail("<script>alert(1)</script><img onerror='alert(2)' src=x>") });
        var html = CanopyStaticHtml.Render(view);
        Assert.DoesNotContain("<script", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<img", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("&lt;script&gt;", html);
    }

    [Theory]
    [InlineData(true, 64)]
    [InlineData(false, 1)]
    public void Render_CollapsedOrDepthLimitedLazyNode_CountsChildrenOnce(bool onlyExpanded, int maxDepth) {
        var view = new CanopyView("lazy", "Lazy") { Source = CanopySource.Remote("c?ref={ref}&cursor={cursor}") };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Roots.Add(new CanopyNode("root", "Root") { HasChildren = true, ChildCount = 5 });
        var html = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { OnlyExpanded = onlyExpanded, MaxDepth = maxDepth });
        Assert.Contains("Showing 1 of 6 rows.", html);
        Assert.Contains("(+5)</span>", html);
    }

    [Fact]
    public void Render_DetailCells_PreserveTitlesAndBadges() {
        var view = SmallView();
        var cell = new CanopyCell("value") { Title = "A & B" };
        cell.Badges.Add(new CanopyBadge("Changed", CanopyTone.Warning));
        view.Roots.Add(new CanopyNode("props", "Properties") { Detail = new CanopyPropertiesDetail().Add("Status", cell) });
        var html = CanopyStaticHtml.Render(view);
        Assert.Contains("title=\"A &amp; B\"", html);
        Assert.Contains(">Changed</span>", html);
    }

    [Fact]
    public void Render_IsScriptFreeWithInlineStylesOnly() {
        var view = SmallView();
        view.Roots[0].Label = "<b>Finance</b> & legal";

        var html = CanopyStaticHtml.Render(view);

        Assert.DoesNotContain("<script", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<style", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(" class=", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("&lt;b&gt;Finance&lt;/b&gt; &amp; legal", html);
    }

    [Fact]
    public void Render_MoreRowsThanTheLimit_SaysHowManyWereLeftOut() {
        var html = CanopyStaticHtml.Render(SmallView(), new CanopyStaticHtmlOptions { MaxRows = 3, FullReportUrl = "https://reports.example/files?id=1&v=2" });

        Assert.Equal(3, Regex.Matches(html, "<tr><td").Count);
        Assert.Contains("Showing 3 of 7 rows.", html);
        Assert.Contains("<a href=\"https://reports.example/files?id=1&amp;v=2\"", html);
    }

    [Fact]
    public void Render_IndentsByLevel_AndOnlyExpandedStopsAtCollapsedNodes() {
        var view = SmallView();

        var full = CanopyStaticHtml.Render(view);
        var expandedOnly = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { OnlyExpanded = true });
        var shallow = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { MaxDepth = 1 });

        Assert.Contains("padding-left:40px;", full); // level 3: two indents of 16 px plus 8 px padding
        Assert.Contains("Q3 budget", full);
        Assert.DoesNotContain("Q3 budget", expandedOnly);
        Assert.Contains("Plans", expandedOnly);
        Assert.DoesNotContain("Plans", shallow);
        // Rows the limits cut are counted and marked, so the outline never drops content silently.
        Assert.Contains("(+4)</span>", shallow);
        Assert.Contains("Showing 2 of 7 rows.", shallow);
        Assert.Contains("Showing 4 of 7 rows.", expandedOnly);
    }

    [Fact]
    public void Render_TonesBadgesAndDetails_UseLiteralColoursAndNestedTables() {
        var html = CanopyStaticHtml.Render(SmallView());

        Assert.Contains("color:#b3261e;", html); // danger tone
        Assert.Contains("background:#fff8c5;color:#7d4e00;", html); // warning badge
        Assert.Contains("<caption style=\"text-align:left;color:#59636e;padding:0 0 2px 0;\">Changed settings</caption>", html);
        Assert.Contains(">30 days</td>", html);
        Assert.Contains("text-align:right;", html); // number column
    }

    private static CanopyView SmallView() {
        var view = new CanopyView("files", "File shares");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Hidden = true });
        var share = new CanopyNode("s", "Finance") { Expanded = true, Group = true };
        share.Badges.Add(new CanopyBadge("2 changed", CanopyTone.Warning));
        var plans = new CanopyNode("s/plans", "Plans");
        plans.Cells["size"] = new CanopyCell(4096L) { Text = "4 KB", Tone = CanopyTone.Danger };
        plans.Children.Add(new CanopyNode("s/plans/q3", "Q3 budget"));
        plans.Children.Add(new CanopyNode("s/plans/diff", "Diff") {
            Detail = new CanopyTableDetail("Changed settings").AddColumns("Setting", "Before", "After").AddRow("Retention", new CanopyCell("30 days") { Tone = CanopyTone.Danger }, "90 days")
        });
        share.Children.Add(plans);
        share.Children.Add(new CanopyNode("s/reports", "Reports"));
        view.Roots.Add(share);
        var archive = new CanopyNode("a", "Archive");
        archive.Children.Add(new CanopyNode("a/2025", "2025"));
        view.Roots.Add(archive);
        return view;
    }
}
