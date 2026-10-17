using CanopyX.Html;
using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Column groups, cell ranges and the clipboard settings: typed authoring, the wire document, validation, the parts a page carries and the script-free header.</summary>
public sealed class GridColumnGroupTests {
    private static readonly string[] Months = { "jan", "feb", "mar", "apr", "may", "jun" };

    internal static CanopyDataGridView Budget() {
        var grid = new CanopyDataGridView("budget", "Budget");
        grid.Columns.Add(new CanopyColumn("line", "Budget line") { RowHeader = true });
        foreach (var id in Months) grid.Columns.Add(new CanopyColumn(id, id.ToUpperInvariant()) { Kind = CanopyColumnKind.Number });
        grid.Columns.Add(new CanopyColumn("total", "Total") { Kind = CanopyColumnKind.Number });
        grid.ColumnGroups.Add(new CanopyColumnGroup("h1", "First half") {
            Pinned = CanopyGridColumnPin.Left,
            Groups = { new CanopyColumnGroup("q1", "Q1", "jan", "feb", "mar"), new CanopyColumnGroup("q2", "Q2", "apr", "may", "jun") }
        });
        var row = new CanopyGridRow("r1");
        row.Cells["line"] = "Rent";
        foreach (var id in Months) row.Cells[id] = 100;
        row.Cells["total"] = 600;
        grid.Rows.Add(row);
        return grid;
    }

    public static TheoryData<string> InvalidGroups() => new() { "duplicate id", "unknown column", "column twice", "four levels", "empty", "split columns", "nested pin", "conflicting pin", "columns pinned apart" };

    [Theory]
    [MemberData(nameof(InvalidGroups))]
    public void Validate_InvalidColumnGroups_AreRejected(string problem) {
        var grid = Budget();
        var first = grid.ColumnGroups[0];
        switch (problem) {
            case "duplicate id": grid.ColumnGroups.Add(new CanopyColumnGroup("q1", "Again", "total")); break;
            case "unknown column": grid.ColumnGroups.Add(new CanopyColumnGroup("x", "X", "missing")); break;
            case "column twice": grid.ColumnGroups.Add(new CanopyColumnGroup("x", "X", "jan")); break;
            case "four levels":
                grid.ColumnGroups.Clear();
                grid.ColumnGroups.Add(new CanopyColumnGroup("a", "A") { Groups = { new CanopyColumnGroup("b", "B") { Groups = { new CanopyColumnGroup("c", "C") { Groups = { new CanopyColumnGroup("d", "D", "jan") } } } } } });
                break;
            case "empty": grid.ColumnGroups.Add(new CanopyColumnGroup("x", "X")); break;
            case "split columns": grid.ColumnGroups.Add(new CanopyColumnGroup("x", "X", "line", "total")); break;
            case "nested pin": first.Groups[0].Pinned = CanopyGridColumnPin.Right; break;
            case "conflicting pin": grid.GetColumn("feb").Pinned = CanopyGridColumnPin.Right; break;
            case "columns pinned apart":
                first.Pinned = null; grid.GetColumn("jan").Pinned = CanopyGridColumnPin.Left; grid.GetColumn("jun").Pinned = CanopyGridColumnPin.Right;
                break;
        }
        Assert.Throws<InvalidOperationException>(() => grid.Validate());
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public void ColumnGroup_NeedsATitle(string title) {
        Assert.Throws<ArgumentException>(() => new CanopyColumnGroup("g", title));
        Assert.Throws<ArgumentException>(() => new CanopyColumnGroup("", "Title"));
    }

    [Fact]
    public void StaticFallback_DrawsGroupRowsWithSpans() {
        var html = CanopyStaticHtml.RenderGrid(Budget());
        Assert.Contains("<th scope=\"col\" rowspan=\"3\"", html);
        Assert.Contains("<th scope=\"col\" colspan=\"6\"", html);
        Assert.Contains(">First half</th>", html);
        Assert.Contains("<th scope=\"col\" colspan=\"3\"", html);
        Assert.Contains(">Q2</th>", html);
        var head = html.Substring(html.IndexOf("<thead>", StringComparison.Ordinal), html.IndexOf("</thead>", StringComparison.Ordinal) - html.IndexOf("<thead>", StringComparison.Ordinal));
        Assert.Equal(3, head.Split(new[] { "<tr>" }, StringSplitOptions.None).Length - 1);
    }

    [Fact]
    public void StaticFallback_ShrinksAGroupToItsVisibleColumns() {
        var grid = Budget();
        grid.GetColumn("jan").Hidden = true;
        grid.GetColumn("feb").Hidden = true;
        var html = CanopyStaticHtml.RenderGrid(grid);
        Assert.Contains("<th scope=\"col\" colspan=\"4\"", html);
        Assert.Contains("<th scope=\"col\" colspan=\"1\"", html);
    }

    [Fact]
    public void Fragments_CarryThePartsOnlyWhenTheGridUsesThem() {
        var plain = new CanopyDataGridView("plain", "Plain");
        plain.Columns.Add(new CanopyColumn("name", "Name"));
        var page = plain.ToHtmlFragment();
        Assert.DoesNotContain("x-canopyx-column-groups", page);
        Assert.DoesNotContain("x-canopyx-cell-range", page);
        var budget = Budget();
        budget.RangeSelection = new CanopyGridRangeSelection();
        var fragment = budget.ToHtmlFragment();
        Assert.Contains("application/x-canopyx-column-groups\" data-cx-version=\"" + CanopyHtmlAssets.GetPart("column-groups").Version, fragment);
        Assert.Contains("application/x-canopyx-cell-range\" data-cx-version=\"" + CanopyHtmlAssets.GetPart("cell-range").Version, fragment);
        Assert.Equal(new[] { "column-groups", "cell-range" }, CanopyHtmlAssets.GetRequiredParts(budget).Select(part => part.Name).Where(name => name is "column-groups" or "cell-range"));
    }
}
