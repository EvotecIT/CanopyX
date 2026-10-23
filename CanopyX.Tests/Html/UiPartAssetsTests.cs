using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Optional UI parts stay lazy, with component budgets separate from shared-token fallback transport.</summary>
public sealed class UiPartAssetsTests {
    [Theory]
    [InlineData("ui-overlays", 10 * 1024)]
    [InlineData("ui-menu", 12 * 1024)]
    [InlineData("ui-picker", 3 * 1024)]
    [InlineData("ui-navigation", 6 * 1024)]
    [InlineData("ui-tabs", 9 * 1024)]
    [InlineData("ui-stepper", 7 * 1024)]
    public void UiPart_ComponentAssetsStayWithinTheirOwnGzipCap(string name, int componentBudget) {
        var part = CanopyHtmlAssets.GetPart(name);
        Assert.NotNull(part.Style);
        // These features load on demand; their own caps do not increase any ordinary tree, grid or Flow limit.
        var size = SharedTokenAssets.Gzip(SharedTokenAssets.WithoutFallbackPayload(part.Script))
            + SharedTokenAssets.Gzip(SharedTokenAssets.WithoutFallbackPayload(part.Style!));
        Assert.True(size <= componentBudget,
            "The " + name + " component assets are " + size + " bytes gzip; their limit is " + componentBudget + ".");
    }

    [Fact]
    public void OrdinaryTreeAndGridFragments_KeepOptionalUiPayloadsLazy() {
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        var grid = new CanopyDataGridView("grid", "Grid");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        var treeFragment = tree.ToHtmlFragment();
        var gridFragment = grid.ToHtmlFragment();
        Assert.True(grid.Toolbar.ColumnMenus);
        Assert.DoesNotContain("application/x-canopyx-ui-menu", treeFragment);
        Assert.Contains(CanopyHtmlAssets.GetPart("ui-menu").Markup, gridFragment);
        Assert.Contains("<script type=\"application/x-canopyx-ui-menu\"", gridFragment);
        foreach (var fragment in new[] { treeFragment, gridFragment }) {
            Assert.Contains(CanopyHtmlAssets.GetPart("ui-overlays").Markup, fragment);
            foreach (var name in new[] { "ui-picker", "ui-navigation", "ui-tabs", "ui-stepper" }) {
                // Payload markers cover both script and stylesheet; ordinary views must not embed optional components.
                Assert.DoesNotContain("application/x-canopyx-" + name, fragment);
            }
        }
    }

    [Fact]
    public void GridWithoutColumnMenus_DoesNotRequireOrEmbedMenu() {
        var grid = new CanopyDataGridView("grid", "Grid");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        grid.Toolbar.ColumnMenus = false;

        // A plain grid has no range or calendar feature that would independently require the menu.
        Assert.Equal(new[] { "ui-overlays", "presenters", "filter-editor", "export" },
            CanopyHtmlAssets.GetRequiredParts(grid).Select(part => part.Name));
        var fragment = grid.ToHtmlFragment();
        Assert.Contains(CanopyHtmlAssets.GetPart("ui-overlays").Markup, fragment);
        Assert.DoesNotContain("application/x-canopyx-ui-menu", fragment);
    }

    [Theory]
    [InlineData("contextActions")]
    [InlineData("dragDrop")]
    [InlineData("editable")]
    public void TreeActionFeatures_EmbedMenuAndItsOverlayDependency(string feature) {
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        switch (feature) {
            case "contextActions": tree.ContextActions.Add(new CanopyContextAction("inspect", "Inspect")); break;
            case "dragDrop": tree.DragDrop = true; break;
            case "editable": tree.Columns[0].Editable = true; break;
            default: throw new ArgumentException("Unknown tree action feature.", nameof(feature));
        }

        Assert.Equal(new[] { "ui-overlays" }, CanopyHtmlAssets.GetPart("ui-menu").Requires);
        Assert.Equal(new[] { "ui-overlays", "ui-menu", "tree-tools", "export" },
            CanopyHtmlAssets.GetRequiredParts(tree).Select(part => part.Name));
        var fragment = tree.ToHtmlFragment();
        var overlays = CanopyHtmlAssets.GetPart("ui-overlays").Markup;
        var menu = CanopyHtmlAssets.GetPart("ui-menu").Markup;
        Assert.Contains(overlays, fragment);
        Assert.Contains(menu, fragment);
        Assert.True(fragment.IndexOf(overlays, StringComparison.Ordinal) < fragment.IndexOf(menu, StringComparison.Ordinal),
            "The menu's overlay dependency must be embedded first.");
        foreach (var name in new[] { "ui-picker", "ui-navigation", "ui-tabs", "ui-stepper" }) {
            Assert.DoesNotContain("application/x-canopyx-" + name, fragment);
        }
        Assert.DoesNotContain("application/x-canopyx-ui-", tree.ToHtmlFragment(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External }));
    }

    [Fact]
    public void InteractiveTreeWithoutActionFeatures_DoesNotEmbedMenu() {
        var tree = new CanopyTreeView("tree", "Tree") { Checkboxes = CanopyCheckboxMode.Independent };
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Equal(CanopyRuntime.InteractiveTreeGrid, CanopyHtmlAssets.GetRuntime(tree));
        Assert.Equal(new[] { "ui-overlays", "tree-tools", "export" },
            CanopyHtmlAssets.GetRequiredParts(tree).Select(part => part.Name));
        Assert.DoesNotContain("application/x-canopyx-ui-menu", tree.ToHtmlFragment());
    }

    [Fact]
    public void Flow_RequiresAndEmbedsOnlyItsFormsAndFlowParts() {
        var flow = new CanopyFlow("flow", "Flow").Step("step", "Step", step => step.Text("name", "Name"));
        Assert.Equal(new[] { "forms", "flow" }, CanopyHtmlAssets.GetRequiredParts(flow).Select(part => part.Name));
        var fragment = flow.ToHtmlFragment();
        Assert.Contains(CanopyHtmlAssets.GetPart("forms").Markup, fragment);
        Assert.Contains(CanopyHtmlAssets.GetPart("flow").Markup, fragment);
        Assert.DoesNotContain("application/x-canopyx-ui-", fragment);
        // Flow's slim entry point neither ships nor advertises the standalone UI parts.
        Assert.DoesNotContain(CanopyHtmlAssets.GetParts(CanopyRuntime.Flow), part => part.Name.StartsWith("ui-", StringComparison.Ordinal));
        Assert.DoesNotContain("canopyx-ui-", CanopyHtmlAssets.GetScript(CanopyRuntime.Flow));
    }
}
