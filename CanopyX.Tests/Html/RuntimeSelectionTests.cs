using CanopyX.Html;

namespace CanopyX.Tests.Html;

public sealed class RuntimeSelectionTests {
    [Theory]
    [InlineData("checkbox")]
    [InlineData("edit")]
    [InlineData("drop")]
    [InlineData("action")]
    [InlineData("translation")]
    public void FragmentHosts_ChooseTheSameEntryPointAsPageWriters(string feature) {
        var view = new CanopyTreeView("records", "Records");
        view.Columns.Add(new CanopyColumn("name", "Name") { Editable = feature == "edit" });
        view.Checkboxes = feature == "checkbox" ? CanopyCheckboxMode.Independent : CanopyCheckboxMode.None;
        view.DragDrop = feature == "drop";
        if (feature == "action") view.ContextActions.Add(new CanopyContextAction("inspect", "Inspect"));
        if (feature == "translation") view.Labels.EditValue = "Edytuj {column}";

        var runtime = CanopyHtmlAssets.GetRuntime(view);
        Assert.Equal(CanopyRuntime.InteractiveTreeGrid, runtime);
        var page = view.ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External });
        Assert.Contains(CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, runtime), page);
        Assert.Contains(CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.ContentHash, runtime), page);
    }

    [Fact]
    public void FragmentHosts_CanPreferTheCompleteRuntimeForReadOnlyViews() {
        var view = new CanopyTreeView("records", "Records");
        Assert.Equal(CanopyRuntime.TreeGrid, CanopyHtmlAssets.GetRuntime(view));
        Assert.Equal(CanopyRuntime.InteractiveTreeGrid, CanopyHtmlAssets.GetRuntime(view, CanopyRuntime.InteractiveTreeGrid));
        view.Checkboxes = CanopyCheckboxMode.Independent;
        Assert.Equal(CanopyRuntime.InteractiveTreeGrid, CanopyHtmlAssets.GetRuntime(view));
        view.Checkboxes = CanopyCheckboxMode.None;
        Assert.Equal(CanopyRuntime.TreeGrid, CanopyHtmlAssets.GetRuntime(view));
        Assert.Throws<ArgumentNullException>(() => CanopyHtmlAssets.GetRuntime((CanopyTreeView)null!));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyHtmlAssets.GetRuntime(view, (CanopyRuntime)42));
    }
}
