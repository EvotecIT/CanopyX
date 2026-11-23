using CanopyX.Html.Ui;

namespace CanopyX.Tests.Html;

/// <summary>Markup and validation of the masked input and signature builders.</summary>
public sealed class UiInputBuilderTests {
    [Fact]
    public void MaskedInput_WritesALabelledTextInputTheRuntimeMasks() {
        Assert.Equal("<label for=\"tag\">Asset &lt;tag&gt;</label><input type=\"text\" id=\"tag\" name=\"tag\" value=\"NET-0042\" placeholder=\"AAA-0000\" required autocomplete=\"off\" spellcheck=\"false\" data-cx-mask=\"AAA-0000\">",
            new CanopyMaskedInput("tag", "tag", "Asset <tag>", "AAA-0000") { Value = "NET-0042", Placeholder = "AAA-0000", Required = true }.ToHtmlFragment());
        Assert.Contains("data-cx-mask=\"ipv4\"", new CanopyMaskedInput("ip", "ip", "Address", "ipv4").ToHtmlFragment());
        Assert.Throws<ArgumentException>(() => new CanopyMaskedInput("x", "x", "X", "--\\0").ToHtmlFragment());
    }

    [Fact]
    public void Signature_WritesItsSettingsAndRefusesUnsafeOnes() {
        var html = new CanopySignature("sign", "Signature of the owner", new CanopySignatureOptions { Name = "signature", SubmitPng = true, Colours = true, DownloadName = "contract" }).ToHtmlFragment();
        Assert.Equal("<div id=\"sign\" class=\"cx-signature-host\" data-cx-signature data-label=\"Signature of the owner\" data-name=\"signature\" data-format=\"png\" data-colours=\"true\" data-download=\"contract\"></div>", html);
        Assert.Throws<ArgumentException>(() => new CanopySignature("s", "S", new CanopySignatureOptions { DownloadName = "../x" }).ToHtmlFragment());
    }
}
