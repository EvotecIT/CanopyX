using System.Text.RegularExpressions;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Html;

/// <summary>
/// With <see cref="CanopyHtmlOptions.Nonce"/>, the markup CanopyX writes works under a strict Content Security Policy
/// (<c>script-src 'self' 'nonce-…'; style-src 'self' 'nonce-…'</c>): every script and style element carries the nonce and
/// nothing needs a <c>style</c> attribute. The browser side is tested in tests/browser/specs/csp.spec.mjs.
/// </summary>
public sealed class ContentSecurityTests {
    private const string Nonce = "rAnd0m+N/once_-==";

    [Theory]
    [InlineData("")]
    [InlineData("two words")]
    [InlineData("quote\"break")]
    [InlineData("<script>")]
    [InlineData("abc===")]
    [InlineData("=abc")]
    [InlineData("abc\n")]
    public void Nonce_RejectsValuesOutsideTheNonceGrammar(string value) {
        Assert.Throws<ArgumentException>(() => new CanopyHtmlOptions { Nonce = value });
        Assert.Throws<ArgumentException>(() => CanopyHtmlAssets.GetPart("export").GetMarkup(value));
    }

    [Fact]
    public void Nonce_DefaultsToNone_AndAcceptsBase64AndBase64Url() {
        Assert.Null(new CanopyHtmlOptions().Nonce);
        Assert.Equal(Nonce, new CanopyHtmlOptions { Nonce = Nonce }.Nonce);
        var options = new CanopyHtmlOptions { Nonce = Nonce };
        options.Nonce = null;
        Assert.Null(options.Nonce);
    }

    [Fact]
    public void InlineTreePage_NoncesEveryScriptAndStyle_AndHasNoStyleAttributes() {
        var html = SampleDocuments.FullView().ToHtmlPage(new CanopyHtmlOptions { Nonce = Nonce });

        AssertStrict(html);
        Assert.Contains("<style nonce=\"" + Nonce + "\">", html);
        Assert.Contains("<script nonce=\"" + Nonce + "\">", html);
        // The parts' payloads carry the nonce, which the runtime gives the elements it inserts when a part loads.
        Assert.Contains("<script type=\"application/x-canopyx-tree-tools\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\" nonce=\"" + Nonce + "\">", html);
    }

    [Fact]
    public void InlineGridPage_NoncesEveryScriptAndStyle() {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["name"] = "Alpha" } });

        AssertStrict(view.ToHtmlPage(new CanopyHtmlOptions { Nonce = Nonce }));
    }

    [Fact]
    public void ExternalPage_NoncesTheScriptAndStylesheetReferences() {
        var html = SampleDocuments.FullView().ToHtmlPage(new CanopyHtmlOptions { Nonce = Nonce, AssetMode = CanopyAssetMode.External });

        AssertStrict(html);
        Assert.Matches("<link rel=\"stylesheet\" href=\"assets/canopyx\\.[a-f0-9]{16}\\.css\" nonce=\"" + Regex.Escape(Nonce) + "\">", html);
        Assert.Matches("<script src=\"assets/canopyx\\.[a-f0-9]{16}\\.js\" nonce=\"" + Regex.Escape(Nonce) + "\" defer></script>", html);
    }

    [Fact]
    public void FragmentHeight_UsesANoncedRule_InPlaceOfAStyleAttribute() {
        var view = SampleDocuments.FullView();

        var strict = view.ToHtmlFragment(new CanopyHtmlOptions { Nonce = Nonce, Height = "calc(70vh - 2rem)" });
        var plain = view.ToHtmlFragment(new CanopyHtmlOptions { Height = "70vh" });

        AssertStrict(strict);
        Assert.StartsWith("<div class=\"cx-host\" data-canopyx-host data-cx-height=\"calc(70vh - 2rem)\">", strict);
        Assert.Contains("<style nonce=\"" + Nonce + "\">[data-cx-height=\"calc(70vh - 2rem)\"]{height:calc(70vh - 2rem)}</style>", strict);
        // Without a nonce the fragment keeps its style attribute, as before.
        Assert.Contains("style=\"height:70vh\"", plain);
        Assert.Throws<ArgumentException>(() => view.ToHtmlFragment(new CanopyHtmlOptions { Nonce = Nonce, Height = "1px\\\"]{x:y" }));
    }

    [Fact]
    public void Document_EmbedsEachPartOnce_WithTheNonce() {
        var document = new CanopyHtmlDocument();
        var part = CanopyHtmlAssets.GetPart("tree-tools");

        Assert.Equal(part.Markup, part.GetMarkup(null));
        Assert.Throws<ArgumentException>(() => document.EmbedOnce(part, "not a nonce"));
        Assert.Empty(document.EmbeddedParts);
        var first = document.EmbedOnce(part, Nonce);
        Assert.Equal(part.GetMarkup(Nonce), first);
        Assert.Equal(2, Regex.Matches(first, " nonce=\"" + Regex.Escape(Nonce) + "\">").Count);
        Assert.Equal(string.Empty, document.EmbedOnce(part, Nonce));
    }

    /// <summary>
    /// Every script and style element outside the JSON view document has the nonce, and no element has a style attribute.
    /// Element contents (the runtime, the stylesheets, the payloads) are skipped: they are text, not markup.
    /// </summary>
    private static void AssertStrict(string html) {
        var tags = Regex.Replace(html, "(<(script|style)\\b[^>]*>).*?</\\2>", "$1", RegexOptions.Singleline);
        Assert.DoesNotMatch("\\sstyle\\s*=", tags);
        var elements = Regex.Matches(tags, "<(script|style|link)\\b[^>]*>");
        Assert.NotEmpty(elements);
        foreach (Match element in elements) {
            if (element.Value.Contains("type=\"application/json\"")) continue;
            Assert.Contains(" nonce=\"" + Nonce + "\"", element.Value);
        }
    }
}
