using System.Xml.Linq;
using CanopyX.Rendering;

namespace CanopyX.Tests.Rendering;

public sealed class StaticNestedTreeProjectionTests {
    [Fact]
    public void NestedTree_FirstColumnUsesExplicitCellsAndFallsBackOnlyWhenAbsent() {
        var tree = Tree();
        var root = new CanopyNode("root", "Wrong root label");
        root.Cells["name"] = "Preferred <root & value>";
        var child = new CanopyNode("child", "Fallback <child & label>");
        var grandchild = new CanopyNode("grandchild", "Wrong explicit-null label");
        grandchild.Cells["name"] = null!;
        child.Children.Add(grandchild); root.Children.Add(child); tree.Roots.Add(root);

        var html = CanopyStaticHtml.RenderGrid(Outer(tree));
        var cells = InnerTable(html).Element("tbody")!.Elements("tr").Select(row => row.Elements("td").First()).ToArray();

        Assert.Equal(new[] { "Preferred <root & value>", "Fallback <child & label>", "" }, cells.Select(cell => cell.Value).ToArray());
        Assert.Contains("padding-left:8px;", cells[0].Attribute("style")!.Value);
        Assert.Contains("padding-left:24px;", cells[1].Attribute("style")!.Value);
        Assert.Contains("padding-left:40px;", cells[2].Attribute("style")!.Value);
        Assert.DoesNotContain("Wrong root label", html);
        Assert.DoesNotContain("Wrong explicit-null label", html);
        Assert.Contains("Preferred &lt;root &amp; value&gt;", html);
        Assert.Contains("Fallback &lt;child &amp; label&gt;", html);
        Assert.Equal(new[] { "Preferred <root & value>", "Fallback <child & label>", "" },
            CanopyStaticHtml.RenderWithResult(tree).Rows.Select(row => row[0]).ToArray());
    }

    [Theory]
    [InlineData(CanopyColumnKind.Number, false, "1,234")]
    [InlineData(CanopyColumnKind.Number, true, "Display <number & amount>")]
    [InlineData(CanopyColumnKind.DateTime, false, "2026-10-15 12:34 UTC")]
    [InlineData(CanopyColumnKind.DateTime, true, "Display <date & time>")]
    public void NestedTree_FirstColumnPreservesTypedFormattingAndExplicitDisplayText(CanopyColumnKind kind, bool overrideText, string expected) {
        var tree = Tree(); tree.Columns[0].Kind = kind;
        var node = new CanopyNode("typed", "Wrong typed label");
        var cell = kind == CanopyColumnKind.Number ? new CanopyCell(1234L) : new CanopyCell(new DateTime(2026, 10, 15, 12, 34, 0, DateTimeKind.Utc));
        if (overrideText) cell.Text = expected;
        node.Cells["name"] = cell; tree.Roots.Add(node);

        var html = CanopyStaticHtml.RenderGrid(Outer(tree));

        Assert.Equal(expected, InnerTable(html).Element("tbody")!.Element("tr")!.Element("td")!.Value);
        Assert.Equal(expected, CanopyStaticHtml.RenderWithResult(tree).Rows[0][0]);
        Assert.DoesNotContain("Wrong typed label", html);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void NestedDetailProjection_PreservesCellTitleToneAndBadges(bool useTree) {
        var cell = new CanopyCell(1234L) { Text = "Preferred <&>", Title = "Tooltip \"<&>\"", Tone = CanopyTone.Danger };
        cell.Badges.Add(new CanopyBadge("Verified <&>", CanopyTone.Success) { Title = "Badge \"<&>\"" });
        CanopyDataGridView outer;
        if (useTree) {
            var tree = Tree(); tree.Columns[0].Kind = CanopyColumnKind.Number;
            tree.Roots.Add(new CanopyNode("row", "Wrong label") { Cells = { ["name"] = cell } });
            outer = Outer(tree);
        } else {
            var nested = new CanopyDataGridView("nested-grid", "Nested grid");
            nested.Columns.Add(new CanopyColumn("name", "Identity") { Kind = CanopyColumnKind.Number });
            var rows = new CanopyGridRowsDetail(); rows.Rows.Add(new CanopyGridRow("row") { Cells = { ["name"] = cell } });
            outer = Grid(); outer.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = nested } };
            outer.Rows[0].Detail = rows;
        }

        var html = CanopyStaticHtml.RenderGrid(outer, options: new CanopyStaticHtmlOptions { UseThemeVariables = true });
        var rendered = InnerTable(html).Element("tbody")!.Element("tr")!.Element("td")!;

        Assert.StartsWith("Preferred <&>", rendered.Value);
        Assert.Equal("Tooltip \"<&>\"", rendered.Attribute("title")?.Value);
        Assert.Contains("--hfx-color-status-bad-fg", rendered.Attribute("style")!.Value);
        var badge = Assert.Single(rendered.Elements("span"));
        Assert.Equal("Verified <&>", badge.Value);
        Assert.Equal("Badge \"<&>\"", badge.Attribute("title")?.Value);
        Assert.Contains("--hfx-color-status-good-fg", badge.Attribute("style")!.Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void NestedDetail_UsesItsOwnCellLabelsAndOuterOverflowPolicy(bool useTree) {
        var labels = new CanopyLabels { Yes = "Tak", No = "Nie", UtcTime = "{time} czasu UTC", OverflowNote = "Nested overflow {shown}/{total}" };
        var columns = new[] {
            new CanopyColumn("name", "Identity"), new CanopyColumn("enabled", "Enabled"),
            new CanopyColumn("seen", "Seen") { Kind = CanopyColumnKind.DateTime }
        };
        var date = new DateTime(2026, 10, 15, 12, 34, 0, DateTimeKind.Utc);
        CanopyDataGridView outer;
        if (useTree) {
            var tree = new CanopyTreeView("nested-tree", "Nested tree") { Labels = labels };
            foreach (var column in columns) tree.Columns.Add(column);
            tree.Roots.Add(new CanopyNode("first", "Wrong identity") { Cells = { ["name"] = true, ["enabled"] = false, ["seen"] = date } });
            tree.Roots.Add(new CanopyNode("second", "Second"));
            outer = Outer(tree);
        } else {
            var nested = new CanopyDataGridView("nested-grid", "Nested grid") { Labels = labels };
            foreach (var column in columns) nested.Columns.Add(column);
            var detail = new CanopyGridRowsDetail();
            detail.Rows.Add(new CanopyGridRow("first") { Cells = { ["name"] = true, ["enabled"] = false, ["seen"] = date } });
            detail.Rows.Add(new CanopyGridRow("second"));
            outer = Grid(); outer.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = nested } };
            outer.Rows[0].Detail = detail;
        }
        outer.Labels = new CanopyLabels { Yes = "Outer yes", No = "Outer no", UtcTime = "Outer {time}", OverflowNote = "Outer overflow {shown}/{total}" };

        var html = CanopyStaticHtml.RenderGrid(outer, options: new CanopyStaticHtmlOptions { MaxRows = 2 });
        var row = Assert.Single(InnerTable(html).Element("tbody")!.Elements("tr"));

        Assert.Equal(new[] { "Tak", "Nie", "2026-10-15 12:34 czasu UTC" }, row.Elements("td").Select(cell => cell.Value).ToArray());
        Assert.Contains("Outer overflow 1/2", html);
        Assert.DoesNotContain("Nested overflow", html);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void NestedTree_NullIdentityKeepsNodeBadgesBeforeCellBadges(bool nullCellReference) {
        var tree = Tree(); tree.Columns.Add(new CanopyColumn("other", "Other"));
        var node = new CanopyNode("row", "Wrong null identity");
        node.Badges.Add(new CanopyBadge("Node <&>", CanopyTone.Danger) { Title = "Node \"<&>\"" });
        if (nullCellReference) {
            node.Cells["name"] = null!;
        } else {
            var identity = new CanopyCell((string?)null) { Title = "Cell \"<&>\"", Tone = CanopyTone.Warning };
            identity.Badges.Add(new CanopyBadge("Cell <&>", CanopyTone.Success) { Title = "Badge \"<&>\"" });
            node.Cells["name"] = identity;
        }
        node.Cells["other"] = new CanopyCell("Other text") { Badges = { new CanopyBadge("Other badge", CanopyTone.Muted) } };
        tree.Roots.Add(node);

        var html = CanopyStaticHtml.RenderGrid(Outer(tree), options: new CanopyStaticHtmlOptions { UseThemeVariables = true });
        var cells = InnerTable(html).Element("tbody")!.Element("tr")!.Elements("td").ToArray();
        var badges = cells[0].Elements("span").ToArray();

        Assert.Equal(nullCellReference ? new[] { "Node <&>" } : new[] { "Node <&>", "Cell <&>" }, badges.Select(badge => badge.Value).ToArray());
        Assert.Equal("Node \"<&>\"", badges[0].Attribute("title")?.Value);
        Assert.Contains("--hfx-color-status-bad-fg", badges[0].Attribute("style")!.Value);
        Assert.Contains("Node &lt;&amp;&gt;", html);
        Assert.Contains("title=\"Node &quot;&lt;&amp;&gt;&quot;\"", html);
        Assert.DoesNotContain("Wrong null identity", html);
        if (!nullCellReference) {
            Assert.Equal("Cell \"<&>\"", cells[0].Attribute("title")?.Value);
            Assert.Contains("--hfx-color-status-warn-fg", cells[0].Attribute("style")!.Value);
            Assert.Equal("Badge \"<&>\"", badges[1].Attribute("title")?.Value);
            Assert.Contains("--hfx-color-status-good-fg", badges[1].Attribute("style")!.Value);
        }
        Assert.Equal("Other badge", Assert.Single(cells[1].Elements("span")).Value);
    }

    private static XElement InnerTable(string html) => Assert.Single(XElement.Parse(html).Descendants("table"));

    private static CanopyTreeView Tree() {
        var tree = new CanopyTreeView("nested-tree", "Nested tree");
        tree.Columns.Add(new CanopyColumn("name", "Identity"));
        return tree;
    }

    private static CanopyDataGridView Grid() {
        var grid = new CanopyDataGridView("outer", "Outer grid");
        grid.Columns.Add(new CanopyColumn("record", "Record"));
        grid.Rows.Add(new CanopyGridRow("outer-row") { Cells = { ["record"] = "Outer record" } });
        return grid;
    }

    private static CanopyDataGridView Outer(CanopyTreeView tree) {
        var template = new CanopyTreeView(tree.Id, tree.Label) { Labels = tree.Labels };
        foreach (var column in tree.Columns) template.Columns.Add(column);
        var detail = new CanopyTreeDetail(); foreach (var root in tree.Roots) detail.Roots.Add(root);
        var grid = Grid(); grid.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { TreeView = template } };
        grid.Rows[0].Detail = detail;
        return grid;
    }
}
