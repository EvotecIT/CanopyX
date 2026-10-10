using System.Text.Json.Nodes;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Tests.Protocol;

public sealed class InteractionContractTests {
    private static CanopyTreeView View() {
        var view = new CanopyTreeView("actions", "Records") { DragDrop = true };
        view.Columns.Add(new CanopyColumn("name", "Name") { Editable = true });
        view.ContextActions.Add(new CanopyContextAction("inspect", "Inspect record"));
        view.Roots.Add(new CanopyNode("a", "Atlas"));
        return view;
    }

    [Fact]
    public void View_WritesOptionalInteractionDefinitionsAndValidatesTheirSchema() {
        var json = View().ToJson();
        ProtocolSchema.AssertValid(json, "view with host interactions");
        var doc = JsonNode.Parse(json)!.AsObject();
        Assert.True(doc["dragDrop"]!.GetValue<bool>());
        Assert.True(doc["columns"]![0]!["editable"]!.GetValue<bool>());
        Assert.Equal("inspect", doc["contextActions"]![0]!["id"]!.GetValue<string>());
        foreach (var property in new[] { "dragDrop", "editable", "actionLabel" }) {
            var invalid = JsonNode.Parse(json)!.AsObject();
            if (property == "dragDrop") invalid[property] = "true";
            else if (property == "editable") invalid["columns"]![0]![property] = "true";
            else invalid["contextActions"]![0]!["label"] = " ";
            Assert.False(ProtocolSchema.Evaluate(invalid.ToJsonString()).IsValid);
        }
        var view = View();
        view.ContextActions.Add(new CanopyContextAction("inspect", "Duplicate"));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        Assert.Throws<ArgumentException>(() => new CanopyContextAction("", "Inspect"));
    }

    [Theory]
    [InlineData("edit")]
    [InlineData("drop")]
    [InlineData("action")]
    public void InteractivePages_ChooseTheirAssetsAndKeepTheStaticOutlineReadonly(string feature) {
        var view = View();
        view.DragDrop = feature == "drop";
        view.Columns[0].Editable = feature == "edit";
        if (feature != "action") view.ContextActions.Clear();
        var html = view.ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetNaming = CanopyAssetNaming.Plain });
        Assert.Contains(CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.Plain, CanopyRuntime.InteractiveTreeGrid), html);
        var outline = CanopyStaticHtml.Render(view);
        Assert.Contains("Atlas", outline);
        Assert.DoesNotContain("<input", outline);
        Assert.DoesNotContain("<button", outline);
        Assert.DoesNotContain("<script", outline);
    }

    [Fact]
    public void InteractionTranslations_TravelWithTheMatchingRuntime() {
        var view = View();
        view.DragDrop = false; view.ContextActions.Clear(); view.Columns[0].Editable = false;
        view.Labels.EditValue = "Edytuj {column}";
        view.Labels.InteractionFailed = "Błąd: {error}";
        Assert.True(view.Labels.RequiresInteractiveRuntime);
        ProtocolSchema.AssertValid(view.ToJson(), "translated interaction labels");
        var html = view.ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetNaming = CanopyAssetNaming.Plain });
        Assert.Contains("canopyx-interactive.js", html);
    }
}
