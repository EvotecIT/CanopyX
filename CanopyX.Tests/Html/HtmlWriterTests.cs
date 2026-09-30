using System.Net;
using System.Text.RegularExpressions;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Html;

/// <summary>
/// The runtime mounts any element marked data-canopyx-host that carries the view document in a JSON configuration
/// script. Hosts such as the HtmlForgeX bridge depend on that fragment shape and on pages loading their assets.
/// </summary>
public sealed class HtmlWriterTests {
    [Fact]
    public void ToHtmlFragment_CarriesTheViewDocumentWithoutAssets() {
        var view = SampleDocuments.FullView();

        var html = view.ToHtmlFragment(new CanopyHtmlOptions { Theme = CanopyTheme.Dark, Height = "70vh" });

        Assert.StartsWith("<div class=\"cx-host\" data-canopyx-host data-cx-theme=\"dark\" style=\"height:70vh\">", html);
        Assert.Equal(view.ToJson(), ConfigOf(html));
        Assert.DoesNotContain("<style", html);
        Assert.Single(Regex.Matches(html, "<script"));
    }

    [Fact]
    public void ToHtmlFragment_WithoutAutoMount_IsMarkedForTheHostToMount() {
        var view = SampleDocuments.FullView();

        Assert.DoesNotContain("data-cx-mount", view.ToHtmlFragment());
        Assert.StartsWith("<div class=\"cx-host\" data-canopyx-host data-cx-theme=\"auto\" data-cx-mount=\"manual\">", view.ToHtmlFragment(new CanopyHtmlOptions { AutoMount = false }));
        Assert.Contains(" data-cx-mount=\"manual\"", view.ToHtmlPage(new CanopyHtmlOptions { AutoMount = false, AssetMode = CanopyAssetMode.External }));
    }

    [Fact]
    public void ToHtmlPage_InlineAssets_IsSelfContained() {
        var view = new CanopyView("v", "Files & <folders>");
        view.Columns.Add(new CanopyColumn("name", "Name"));

        var html = view.ToHtmlPage(new CanopyHtmlOptions { Language = "pl" });

        Assert.Contains("<html lang=\"pl\">", html);
        Assert.Contains("<title>Files &amp; &lt;folders&gt;</title>", html);
        Assert.Contains(CanopyHtmlAssets.Style, html);
        Assert.Contains(CanopyHtmlAssets.Script, html);
        Assert.Equal(view.ToJson(), ConfigOf(html));
        Assert.DoesNotMatch(@"\{\{(lang|colorScheme|title|head|body)\}\}", html);
    }

    [Fact]
    public void ToHtmlPage_ExternalAssets_ReferencesTheAssetFiles() {
        var view = new CanopyView("v", "Files");
        view.Columns.Add(new CanopyColumn("name", "Name"));

        var html = view.ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetBaseUrl = "../shared" });

        Assert.Contains("<link rel=\"stylesheet\" href=\"../shared/canopyx.css\">", html);
        Assert.Contains("<script src=\"../shared/canopyx.js\" defer></script>", html);
        Assert.DoesNotContain(CanopyHtmlAssets.Script, html);
    }

    [Theory]
    [InlineData("600px;background:red")]
    [InlineData("1px\" onload=\"x")]
    public void ToHtmlFragment_HeightThatIsNotALength_Throws(string height) {
        var view = new CanopyView("v", "Files");
        view.Columns.Add(new CanopyColumn("name", "Name"));

        Assert.Throws<ArgumentException>(() => view.ToHtmlFragment(new CanopyHtmlOptions { Height = height }));
    }

    private static string ConfigOf(string html) {
        var match = Regex.Match(html, "<script type=\"application/json\" class=\"cx-config\">(.*?)</script>", RegexOptions.Singleline);
        Assert.True(match.Success, "The fragment has no configuration script.");
        return match.Groups[1].Value;
    }
}
