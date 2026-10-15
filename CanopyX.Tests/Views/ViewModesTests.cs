using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Views;

/// <summary>Search highlighting and layout modes are typed options that write the same view fields on grids and trees.</summary>
public sealed class ViewModesTests {
    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("tickets", "Support tickets");
        view.Columns.Add(new CanopyColumn("ticket", "Ticket"));
        view.Columns.Add(new CanopyColumn("status", "Status"));
        var row = new CanopyGridRow("t1");
        row.Cells["ticket"] = "TCK-1001";
        row.Cells["status"] = "Open";
        view.Rows.Add(row);
        return view;
    }

    private static CanopyTreeView Tree() {
        var view = new CanopyTreeView("kb", "Knowledge base");
        view.Columns.Add(new CanopyColumn("name", "Article"));
        view.Roots.Add(new CanopyNode("printing", "Printing"));
        return view;
    }

    [Fact]
    public void Grid_WritesHighlightAndLayoutOnlyWhenSet() {
        var view = Grid();
        Assert.DoesNotContain("searchHighlight", view.ToJson());
        Assert.DoesNotContain("\"layout\"", view.ToJson());
        view.SearchHighlight = new CanopySearchHighlight();
        view.Layout = new CanopyLayoutOptions();
        var json = view.ToJson();
        Assert.Contains("\"searchHighlight\":{}", json);
        Assert.Contains("\"layout\":{}", json);
        ProtocolSchema.AssertValid(json, "grid with default view modes");
    }

    [Fact]
    public void Grid_WritesEveryOption() {
        var view = Grid();
        view.SearchHighlight = new CanopySearchHighlight { Enabled = false, Search = false, Filters = false, MatchCase = true, IgnoreAccents = true, MinLength = 3 };
        view.SearchHighlight.FilterTones["status"] = "info";
        view.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Cards, Density = CanopyGridDensity.Comfortable };
        view.Layout.Modes.Add(CanopyLayoutMode.Cards);
        view.Layout.Modes.Add(CanopyLayoutMode.Fit);
        view.Toolbar.Matches = false;
        view.Toolbar.Layout = false;
        var json = view.ToJson();
        Assert.Contains("\"searchHighlight\":{\"enabled\":false,\"search\":false,\"filters\":false,\"matchCase\":true,\"ignoreAccents\":true,\"minLength\":3,\"filterTones\":{\"status\":\"info\"}}", json);
        Assert.Contains("\"layout\":{\"mode\":\"cards\",\"modes\":[\"cards\",\"fit\"],\"density\":\"comfortable\"}", json);
        Assert.Contains("\"toolbar\":{\"matches\":false,\"layout\":false}", json);
        ProtocolSchema.AssertValid(json, "grid with every view mode option");
    }

    [Fact]
    public void Layout_WritesTheStartingModeWhenTheChoicesLeaveFitOut() {
        var view = Grid();
        view.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Scroll };
        view.Layout.Modes.Add(CanopyLayoutMode.Scroll);
        Assert.Contains("\"layout\":{\"mode\":\"scroll\",\"modes\":[\"scroll\"]}", view.ToJson());
    }

    [Fact]
    public void Tree_WritesHighlightAndLayout_AndRefusesCards() {
        var view = Tree();
        view.SearchHighlight = new CanopySearchHighlight { IgnoreAccents = true };
        view.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Scroll, Density = CanopyGridDensity.Compact };
        view.Toolbar.Layout = false;
        var json = view.ToJson();
        Assert.Contains("\"searchHighlight\":{\"ignoreAccents\":true}", json);
        Assert.Contains("\"layout\":{\"mode\":\"scroll\",\"density\":\"compact\"}", json);
        Assert.Contains("\"layout\":false", json);
        ProtocolSchema.AssertValid(json, "tree with view modes");
        view.Layout.Mode = CanopyLayoutMode.Cards;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Layout = new CanopyLayoutOptions();
        view.Layout.Modes.Add(CanopyLayoutMode.Cards);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void Options_AreValidated() {
        var view = Grid();
        view.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Scroll };
        view.Layout.Modes.Add(CanopyLayoutMode.Fit);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Layout = new CanopyLayoutOptions();
        view.Layout.Modes.Add(CanopyLayoutMode.Fit);
        view.Layout.Modes.Add(CanopyLayoutMode.Fit);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Layout = new CanopyLayoutOptions { Mode = (CanopyLayoutMode)7 };
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Layout = new CanopyLayoutOptions { Density = (CanopyGridDensity)9 };
        Assert.Throws<ArgumentOutOfRangeException>(() => view.ToJson());
        view.Layout = null;
        view.SearchHighlight = new CanopySearchHighlight();
        view.SearchHighlight.FilterTones["missing"] = "info";
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.SearchHighlight.FilterTones.Clear();
        view.SearchHighlight.FilterTones["status"] = "Info";
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.SearchHighlight.FilterTones["status"] = "info-bg";
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        Assert.Throws<ArgumentOutOfRangeException>(() => view.SearchHighlight.MinLength = 0);
        Assert.Throws<ArgumentOutOfRangeException>(() => view.SearchHighlight.MinLength = 33);
    }

    [Fact]
    public void Labels_CarryTheViewModeTextsToGridsAndTrees() {
        var labels = CanopyLabels.Polish();
        Assert.Equal("Wyróżniaj dopasowania", labels.MatchesHighlight);
        Assert.Equal("Układ", labels.LayoutMenu);
        var grid = Grid(); grid.Labels = CanopyLabels.German();
        Assert.Contains("\"layoutCards\":\"Karten\"", grid.ToJson());
        var tree = Tree(); tree.Labels = CanopyLabels.French();
        Assert.Contains("\"matchesNext\":\"Correspondance suivante\"", tree.ToJson());
        Assert.Equal("{current} of {count}", new CanopyLabels().MatchesPosition);
    }
}
