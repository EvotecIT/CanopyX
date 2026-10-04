using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Tests.Html;

public sealed class GridHtmlTests {
    [Fact]
    public void GridPage_UsesTheSupersetRuntimeAndEscapesHostContent() {
        var view = View();
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["name"] = "</script><b>unsafe</b>", ["size"] = 2L } });
        var page = view.ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Title = "<Inventory>", AssetNaming = CanopyAssetNaming.Plain });
        Assert.Contains("<title>&lt;Inventory&gt;</title>", page);
        Assert.Contains("assets/canopyx-grid.js", page);
        Assert.Contains("assets/canopyx-grid.css", page);
        Assert.DoesNotContain("</script><b>unsafe</b>", page);
        Assert.Contains("\\u003c/script\\u003e", page);
        var fragment = view.ToHtmlFragment(new CanopyHtmlOptions { Height = "560px", AutoMount = false });
        Assert.Contains("height:560px", fragment);
        Assert.Contains("data-cx-mount=\"manual\"", fragment);
        Assert.DoesNotContain("<script src=", fragment);
        var tree = new CanopyView("tree", "Tree") { Checkboxes = CanopyCheckboxMode.Independent };
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Equal(CanopyRuntime.DataGrid, CanopyHtmlAssets.GetRuntime(tree, CanopyRuntime.DataGrid));
    }

    [Fact]
    public void GridAssets_AreWrittenWithNamesMatchingThePage() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-grid-assets-" + Guid.NewGuid().ToString("N"));
        try {
            var files = CanopyHtmlAssets.WriteTo(directory, CanopyAssetNaming.ContentHash, CanopyRuntime.DataGrid);
            var page = View().ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External });
            foreach (var file in files) Assert.Contains(Path.GetFileName(file), page);
            Assert.Equal(CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid), File.ReadAllText(files[0]));
            Assert.Equal(CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid), File.ReadAllText(files[1]));
        } finally { Directory.Delete(directory, recursive: true); }
    }

    [Fact]
    public void GridFallback_HidesAnyColumnAndUsesDisplayValuesWithInlineStyles() {
        var view = View();
        view.Columns[0].Hidden = true;
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["name"] = "Hidden", ["size"] = new CanopyCell(2L) { Text = "<2 KiB>" } } });
        var html = CanopyStaticHtml.RenderGrid(view);
        Assert.DoesNotContain("Hidden", html);
        Assert.Contains("&lt;2 KiB&gt;", html);
        Assert.Contains("scope=\"col\"", html);
        Assert.Contains("style=", html);
        Assert.DoesNotContain("<script", html);
        Assert.DoesNotContain("class=", html);
    }

    [Fact]
    public void HostFallback_RequiresAnExplicitSnapshotAndDisclosesPartialResults() {
        var view = View(); view.Source = CanopyGridSourceKind.Host;
        Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.RenderGrid(view));
        var page = new CanopyGridPage(view.Id, "snapshot", 3, 20, 10);
        page.Rows.Add(new CanopyGridRow("a") { Cells = { ["name"] = "Accepted", ["size"] = 2L } });
        var html = CanopyStaticHtml.RenderGrid(view, page);
        Assert.Contains("Accepted", html);
        Assert.Contains("1", html); Assert.Contains("10", html);
        Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.RenderGrid(view, new CanopyGridPage("another", "snapshot", 0, 0, 0)));
    }

    private static CanopyGridView View() {
        var view = new CanopyGridView("grid", "Inventory");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number });
        return view;
    }
}
