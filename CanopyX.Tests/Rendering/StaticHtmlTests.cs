using System.Text.RegularExpressions;
using CanopyX.Rendering;

namespace CanopyX.Tests.Rendering;

/// <summary>
/// The static outline goes where no script runs and stylesheets are dropped (email clients, print, Word), so it must
/// carry its presentation in inline styles, encode host text, and say what it left out.
/// </summary>
public sealed class StaticHtmlTests {
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
