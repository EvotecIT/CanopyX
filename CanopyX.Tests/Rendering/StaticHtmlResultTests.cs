using CanopyX.Rendering;

namespace CanopyX.Tests.Rendering;

public sealed class StaticHtmlResultTests {
    [Theory]
    [InlineData(1, 10, false)]
    [InlineData(10, 1, false)]
    [InlineData(10, 10, true)]
    public void RenderWithResult_LimitedOutline_RecordsEffectiveVisibleCellsAndPreLimitTotal(int maxRows, int maxDepth, bool onlyExpanded) {
        var view = new CanopyTreeView("print", "Outline caption") { Checkboxes = CanopyCheckboxMode.Independent };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("hidden", "Hidden") { Hidden = true });
        var root = new CanopyNode("root", "Unprinted node label");
        root.Cells["name"] = new CanopyCell("raw") { Text = "Printed <&>", Title = "Unprinted tooltip" };
        root.Badges.Add(new CanopyBadge("Node badge"));
        root.Cells["name"].Badges.Add(new CanopyBadge("Cell badge"));
        root.Cells["amount"] = new CanopyCell(42) { Text = "42 units" };
        root.Cells["hidden"] = "Unprinted hidden cell";
        root.Children.Add(new CanopyNode("child", "Unprinted child"));
        view.Roots.Add(root);
        view.CheckIntents.Add(new CanopyCheckIntent(new[] { "root" }, true));
        var options = new CanopyStaticHtmlOptions { MaxRows = maxRows, MaxDepth = maxDepth, OnlyExpanded = onlyExpanded };

        var result = CanopyStaticHtml.RenderWithResult(view, options);

        Assert.Equal(2L, result.TotalRows);
        Assert.False(result.HasUnknownTotal);
        Assert.Equal(new[] { "☑ Printed <&> Node badge (+1) Cell badge", "42 units" }, Assert.Single(result.Rows));
        Assert.Equal(CanopyStaticHtml.Render(view, options), result.Html);
        Assert.Contains("Printed &lt;&amp;&gt;", result.Html);
        Assert.Contains("Showing 1 of 2 rows.", result.Html);
        root.Cells["name"].Text = "Later mutation";
        Assert.Contains("Printed <&>", result.Rows[0][0]);
        Assert.Throws<NotSupportedException>(() => ((IList<IReadOnlyList<string>>)result.Rows).Clear());
        Assert.Throws<NotSupportedException>(() => ((IList<string>)result.Rows[0])[0] = "Changed");
    }

    [Fact]
    public void RenderWithResult_DetailRows_RecordNestedVisibleTextOncePerOutlineRow() {
        var view = new CanopyTreeView("details", "Details");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var changed = new CanopyCell("raw") { Text = "Before & after" };
        changed.Badges.Add(new CanopyBadge("Changed"));
        view.Roots.Add(new CanopyNode("table", "Unprinted table label") {
            Detail = new CanopyTableDetail("Settings").AddColumns("Key", "Value").AddRow("Retention", changed)
        });
        view.Roots.Add(new CanopyNode("properties", "Unprinted property label") {
            Detail = new CanopyPropertiesDetail().Add("Status", new CanopyCell(true) { Text = "Enabled" }).Add("Empty", string.Empty)
        });
        view.Roots.Add(new CanopyNode("markup", "Unprinted markup label") { Detail = new CanopyHtmlDetail("<b>Literal payload</b>") });

        var result = CanopyStaticHtml.RenderWithResult(view);

        Assert.Equal(3L, result.TotalRows);
        Assert.Equal(3, result.Rows.Count);
        Assert.Equal("Settings Key Value Retention Before & after Changed", Assert.Single(result.Rows[0]));
        Assert.Equal("Status Enabled Empty", Assert.Single(result.Rows[1]));
        Assert.Equal("<b>Literal payload</b>", Assert.Single(result.Rows[2]));
        Assert.Contains("Before &amp; after", result.Html);
        Assert.Contains("&lt;b&gt;Literal payload&lt;/b&gt;", result.Html);
    }

    [Fact]
    public void RenderWithResult_EmptyFirstCellAndLazyRows_PreserveRowIdentityAndUnknownCount() {
        var view = new CanopyTreeView("lazy", "Lazy outline") { Source = CanopySource.Remote("c?ref={ref}&cursor={cursor}") };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("amount", "Amount"));
        var row = new CanopyNode("root", "Unprinted label") { HasChildren = true, ChildCount = 8 };
        row.Cells["name"] = string.Empty;
        row.Cells["amount"] = "Visible second cell";
        view.Roots.Add(row);

        var known = CanopyStaticHtml.RenderWithResult(view);
        Assert.Equal(9L, known.TotalRows);
        Assert.Equal(new[] { "(+8)", "Visible second cell" }, Assert.Single(known.Rows));
        Assert.False(known.HasUnknownTotal);
        row.ChildCount = null;
        var unknown = CanopyStaticHtml.RenderWithResult(view);
        Assert.Equal(1L, unknown.TotalRows);
        Assert.True(unknown.HasUnknownTotal);
        Assert.Equal(new[] { "(+)", "Visible second cell" }, Assert.Single(unknown.Rows));
        row.HasChildren = false;
        Assert.Equal(new[] { string.Empty, "Visible second cell" }, Assert.Single(CanopyStaticHtml.RenderWithResult(view).Rows));
    }
}
