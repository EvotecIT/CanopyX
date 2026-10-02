using System.Text.Json.Nodes;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Tests.Protocol;

public sealed class CheckboxContractTests {
    private static CanopyView View(CanopyCheckboxMode mode) {
        var view = new CanopyView("checking", "Projects") { Checkboxes = mode };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var atlas = new CanopyNode("a", "Atlas");
        atlas.Children.Add(new CanopyNode("a0", "Planning"));
        atlas.Children.Add(new CanopyNode("a1", "Delivery"));
        view.Roots.Add(atlas);
        return view;
    }

    [Theory]
    [InlineData(CanopyCheckboxMode.Independent, "independent")]
    [InlineData(CanopyCheckboxMode.Hierarchical, "hierarchical")]
    public void View_WritesCheckingRulesAndSchemaRejectsMalformedRules(CanopyCheckboxMode mode, string wireName) {
        var view = View(mode);
        view.CheckIntents.Add(new CanopyCheckIntent(new[] { "a", "unloaded" }, true));
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "checkbox view with an unloaded path");
        var doc = JsonNode.Parse(json)!.AsObject();
        Assert.Equal(wireName, doc["checkboxes"]!.GetValue<string>());
        Assert.True(doc["checkIntents"]![0]!["checked"]!.GetValue<bool>());
        doc["checkIntents"]![0]!["checked"] = "true";
        Assert.False(ProtocolSchema.Evaluate(doc.ToJsonString()).IsValid);
        doc["checkIntents"]![0]!["checked"] = true;
        doc.Remove("checkboxes");
        Assert.False(ProtocolSchema.Evaluate(doc.ToJsonString()).IsValid);
    }

    [Fact]
    public void Intent_CopiesPathsAndRejectsAmbiguousDefinitions() {
        var ids = new[] { "a", "a0" };
        var intent = new CanopyCheckIntent(ids, true);
        ids[1] = "changed";
        Assert.Equal("a0", intent.Path[1]);
        Assert.Throws<ArgumentException>(() => new CanopyCheckIntent(new[] { "a", "a" }, true));
        var view = View(CanopyCheckboxMode.None);
        view.CheckIntents.Add(intent);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Checkboxes = CanopyCheckboxMode.Hierarchical;
        view.CheckIntents.Add(new CanopyCheckIntent(new[] { "a", "a0" }, false));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Theory]
    [InlineData(CanopyCheckboxMode.Independent, "false")]
    [InlineData(CanopyCheckboxMode.Hierarchical, "true")]
    public void StaticOutline_ShowsReadonlyChecksWithoutScript(CanopyCheckboxMode mode, string childState) {
        var view = View(mode);
        view.CheckIntents.Add(new CanopyCheckIntent(new[] { "a" }, true));
        var html = CanopyStaticHtml.Render(view);
        Assert.Contains("aria-label=\"Planning\" aria-checked=\"" + childState + "\"", html);
        Assert.Contains("aria-readonly=\"true\"", html);
        Assert.DoesNotContain("<input", html);
        Assert.DoesNotContain("<script", html);
    }

    [Fact]
    public void StaticOutline_ReflectsExceptionsOnAncestorsAndLazyPaths() {
        var view = View(CanopyCheckboxMode.Hierarchical);
        view.CheckIntents.Add(new CanopyCheckIntent(new[] { "a" }, true));
        view.CheckIntents.Add(new CanopyCheckIntent(new[] { "a", "a0" }, false));
        var html = CanopyStaticHtml.Render(view);
        Assert.Contains("aria-label=\"Atlas\" aria-checked=\"mixed\"", html);
        Assert.Contains("aria-label=\"Planning\" aria-checked=\"false\"", html);
        Assert.Contains("aria-label=\"Delivery\" aria-checked=\"true\"", html);
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain)]
    [InlineData(CanopyAssetNaming.ContentHash)]
    public void CheckboxPage_ChoosesTheMatchingInteractiveAssets(CanopyAssetNaming naming) {
        var view = View(CanopyCheckboxMode.Hierarchical);
        var page = view.ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetNaming = naming });
        Assert.Contains(CanopyHtmlAssets.GetScriptFileName(naming, CanopyRuntime.InteractiveTreeGrid), page);
        Assert.Contains(CanopyHtmlAssets.GetStyleFileName(naming, CanopyRuntime.InteractiveTreeGrid), page);
        Assert.Contains("class CheckIntents", view.ToHtmlPage());
        Assert.DoesNotContain("</script", CanopyHtmlAssets.GetScript(CanopyRuntime.InteractiveTreeGrid), StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain, CanopyCheckboxMode.Hierarchical)]
    [InlineData(CanopyAssetNaming.ContentHash, CanopyCheckboxMode.Hierarchical)]
    [InlineData(CanopyAssetNaming.Plain, CanopyCheckboxMode.None)]
    [InlineData(CanopyAssetNaming.ContentHash, CanopyCheckboxMode.None)]
    public void InteractiveBundle_WritesReferencedAssetsAndPreservesCheckingRules(CanopyAssetNaming naming, CanopyCheckboxMode mode) {
        var view = View(mode);
        if (mode != CanopyCheckboxMode.None) view.CheckIntents.Add(new CanopyCheckIntent(new[] { "a", "a0" }, true));
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-checking-" + Guid.NewGuid().ToString("N"));
        try {
            var result = view.SaveHtmlBundle(directory, new CanopyHtmlOptions {
                AssetMode = CanopyAssetMode.External, AssetNaming = naming,
                Runtime = mode == CanopyCheckboxMode.None ? CanopyRuntime.InteractiveTreeGrid : CanopyRuntime.TreeGrid
            });
            var page = File.ReadAllText(Path.Combine(directory, "index.html"));
            var scriptName = CanopyHtmlAssets.GetScriptFileName(naming, CanopyRuntime.InteractiveTreeGrid);
            var styleName = CanopyHtmlAssets.GetStyleFileName(naming, CanopyRuntime.InteractiveTreeGrid);
            Assert.Contains("assets/" + scriptName, page);
            Assert.Contains("assets/" + styleName, page);
            Assert.Equal(CanopyHtmlAssets.GetScript(CanopyRuntime.InteractiveTreeGrid), File.ReadAllText(Path.Combine(directory, "assets", scriptName)));
            Assert.Equal(CanopyHtmlAssets.GetStyle(CanopyRuntime.InteractiveTreeGrid), File.ReadAllText(Path.Combine(directory, "assets", styleName)));
            Assert.True(File.Exists(Path.Combine(result.DataDirectory, "manifest.js")));
            if (mode != CanopyCheckboxMode.None) Assert.Contains("\"checkIntents\":[{\"path\":[\"a\",\"a0\"],\"checked\":true}]", page);
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }
}
