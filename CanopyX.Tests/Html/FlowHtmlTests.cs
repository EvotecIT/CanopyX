using CanopyX.Html;
using CanopyX.Tests.Flows;

namespace CanopyX.Tests.Html;

/// <summary>Flow fragments and pages: the flow document in its host, the forms and flow parts, and the slim flow entry point.</summary>
public sealed class FlowHtmlTests {
    [Fact]
    public void Runtime_IsTheFlowEntryPoint() {
        var flow = FlowSamples.MailServer();
        Assert.Equal(CanopyRuntime.Flow, CanopyHtmlAssets.GetRuntime(flow));
        Assert.Equal("canopyx-flow-entry.js", CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.Plain, CanopyRuntime.Flow));
        Assert.Equal("canopyx-flow-entry.css", CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.Plain, CanopyRuntime.Flow));
        Assert.Matches("^canopyx-flow-entry\\.[a-f0-9]{16}\\.js$", CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, CanopyRuntime.Flow));
        Assert.Contains("createFlow", CanopyHtmlAssets.GetScript(CanopyRuntime.Flow));
        Assert.DoesNotContain("createDataGrid", CanopyHtmlAssets.GetScript(CanopyRuntime.Flow));
        Assert.Throws<ArgumentNullException>(() => CanopyHtmlAssets.GetRuntime((CanopyFlow)null!));
    }

    [Fact]
    public void RequiredParts_AreFormsAndFlow() {
        var parts = CanopyHtmlAssets.GetRequiredParts(FlowSamples.MailServer());
        Assert.Equal(new[] { "forms", "flow" }, parts.Select(part => part.Name).OrderBy(name => name == "flow").ToArray());
        Assert.All(parts, part => Assert.True(part.IsShippedWith(CanopyRuntime.Flow)));
        Assert.Contains("forms", CanopyHtmlAssets.GetPart("flow").Requires);
    }

    [Fact]
    public void Fragment_CarriesTheDocumentAndPartPayloadsWithNonce() {
        var flow = FlowSamples.MailServer();
        var html = flow.ToHtmlFragment(new CanopyHtmlOptions { Nonce = "abc123" });
        Assert.StartsWith("<div class=\"cx-host cx-flow-host\" data-canopyx-host><script type=\"application/json\" class=\"cx-config\">" + flow.ToContract() + "</script></div>", html);
        Assert.DoesNotContain("height", html.Substring(0, html.IndexOf("<script", StringComparison.Ordinal)));
        Assert.DoesNotContain("data-cx-height", html);
        foreach (var name in new[] { "forms", "flow" }) {
            var part = CanopyHtmlAssets.GetPart(name);
            Assert.Contains("<script type=\"application/x-canopyx-" + name + "\" data-cx-version=\"" + part.Version + "\" nonce=\"abc123\">", html);
        }

        Assert.DoesNotContain("application/x-canopyx-filter-editor", html);
        Assert.DoesNotContain("application/x-canopyx-editing\"", html);
    }

    [Fact]
    public void Fragment_HasAHeightOnlyWhenAsked() {
        var html = FlowSamples.MailServer().ToHtmlFragment(new CanopyHtmlOptions { Height = "480px", AutoMount = false });
        Assert.StartsWith("<div class=\"cx-host cx-flow-host\" data-canopyx-host data-cx-mount=\"manual\" style=\"height:480px\">", html);
    }

    [Fact]
    public void Fragment_SharesPartsInOneDocument() {
        var document = new CanopyHtmlDocument();
        var first = FlowSamples.MailServer().ToHtmlFragment(new CanopyHtmlOptions { Document = document });
        var second = FlowSamples.Everything().ToHtmlFragment(new CanopyHtmlOptions { Document = document });
        Assert.Contains("application/x-canopyx-flow\"", first);
        Assert.DoesNotContain("application/x-canopyx-flow\"", second);
    }

    [Fact]
    public void Page_UsesTheFlowEntryPointAndNoGridCode() {
        var page = FlowSamples.MailServer().ToHtmlPage(new CanopyHtmlOptions { Nonce = "n0nce" });
        Assert.Contains("<title>Connect a mail server</title>", page);
        Assert.Contains(CanopyHtmlAssets.GetScript(CanopyRuntime.Flow), page);
        Assert.Contains(CanopyHtmlAssets.GetStyle(CanopyRuntime.Flow), page);
        Assert.DoesNotContain("createDataGrid", page);
        Assert.DoesNotContain("createTreeGrid", page);
        Assert.Contains("<style nonce=\"n0nce\">", page);
        Assert.Contains("<script nonce=\"n0nce\">", page);
        Assert.Contains("class=\"cx-host cx-flow-host\"", page);
        Assert.Contains("application/x-canopyx-flow\" data-cx-version=", page);
    }

    [Fact]
    public void Page_WithExternalAssets_ReferencesTheFlowEntryFiles() {
        var options = new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetBaseUrl = "assets/", Title = "Setup" };
        var page = FlowSamples.MailServer().ToHtmlPage(options);
        Assert.Contains("<script src=\"assets/" + CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, CanopyRuntime.Flow) + "\" defer></script>", page);
        Assert.Contains("<link rel=\"stylesheet\" href=\"assets/" + CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.ContentHash, CanopyRuntime.Flow) + "\">", page);
        Assert.Contains("<title>Setup</title>", page);
        Assert.DoesNotContain("application/x-canopyx-", page);
        Assert.DoesNotContain("createDataGrid", page);
    }

    [Fact]
    public void WriteTo_WritesTheEntryPointAndItsParts() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-flow-assets-" + Guid.NewGuid().ToString("N"));
        try {
            var written = CanopyHtmlAssets.WriteTo(directory, CanopyAssetNaming.Plain, CanopyRuntime.Flow);
            Assert.Equal(new[] { "canopyx-flow-entry.js", "canopyx-flow-entry.css" }, written.Select(Path.GetFileName));
            Assert.True(File.Exists(Path.Combine(directory, "canopyx-flow.js")));
            Assert.True(File.Exists(Path.Combine(directory, "canopyx-forms.js")));
            Assert.False(File.Exists(Path.Combine(directory, "canopyx-filter-editor.js")));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, true);
        }
    }

    [Fact]
    public void RequestedParts_MustShipWithTheFlowEntryPoint() {
        var flow = FlowSamples.MailServer();
        var options = new CanopyHtmlOptions();
        options.Parts.Add("filter-editor");
        var error = Assert.Throws<InvalidOperationException>(() => flow.ToHtmlFragment(options));
        Assert.Contains("Flow runtime", error.Message);
        var external = new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External };
        external.Parts.Add("filter-editor");
        Assert.Throws<InvalidOperationException>(() => flow.ToHtmlPage(external));
        var hidden = new CanopyHtmlOptions();
        hidden.HiddenFilterIds.Add("x");
        Assert.Throws<InvalidOperationException>(() => flow.ToHtmlFragment(hidden));
    }

    [Fact]
    public void InvalidFlow_IsNotWritten() {
        var flow = new CanopyFlow("flow", "A flow");
        Assert.Throws<InvalidOperationException>(() => flow.ToHtmlFragment());
        Assert.Throws<ArgumentNullException>(() => ((CanopyFlow)null!).ToHtmlPage());
        Assert.Throws<ArgumentException>(() => FlowSamples.MailServer().SaveHtmlPage(""));
    }
}
