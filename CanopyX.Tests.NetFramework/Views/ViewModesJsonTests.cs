using CanopyX.Html;
using Xunit;

namespace CanopyX.Tests.NetFramework.Views;

/// <summary>The view mode options write the same documents and carry the same parts on .NET Framework.</summary>
public sealed class ViewModesJsonTests {
    [Fact]
    public void ViewModes_WriteTheirFieldsAndCarryTheirParts() {
        var grid = new CanopyDataGridView("tickets", "Tickets");
        grid.Columns.Add(new CanopyColumn("status", "Status"));
        grid.SearchHighlight = new CanopySearchHighlight { IgnoreAccents = true };
        grid.SearchHighlight.FilterTones["status"] = "info";
        grid.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Cards, Density = CanopyGridDensity.Compact };
        var json = grid.ToJson();
        Assert.Contains("\"searchHighlight\":{\"ignoreAccents\":true,\"filterTones\":{\"status\":\"info\"}}", json);
        Assert.Contains("\"layout\":{\"mode\":\"cards\",\"density\":\"compact\"}", json);
        Assert.Equal(new[] { "ui-overlays", "ui-menu", "presenters", "filter-editor", "export", "highlight", "layouts" }, CanopyHtmlAssets.GetRequiredParts(grid).Select(part => part.Name).Where(name => name != "history").ToArray());
        var tree = new CanopyTreeView("kb", "Knowledge base") { Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Cards } };
        tree.Columns.Add(new CanopyColumn("name", "Article"));
        Assert.Throws<InvalidOperationException>(() => tree.ToJson());
        Assert.Equal("Dopasowanie {current} z {count}, {column}", CanopyLabels.Polish().MatchesAnnounce);
    }
}
