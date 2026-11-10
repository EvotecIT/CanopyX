using System.Security.Cryptography;
using System.Text.RegularExpressions;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

public sealed class FontDeliveryTests {
    private static readonly Dictionary<string, string> Fonts = new() {
        ["Archivo"] = "6a71ecc5aff4e2282d89d828ccd757ffa12f8534931f48b43200a3106fc58d21",
        ["JetBrainsMono"] = "7b7f3419196f675a973d30cb70078749120caddea86c8547ebf54a8db2ca13af"
    };

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("fonts", "Font delivery");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Rows.Add(new CanopyGridRow("record") { Cells = { ["name"] = "Example" } });
        return view;
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain)]
    [InlineData(CanopyAssetNaming.ContentHash)]
    public void ExternalPages_WriteTheQualifiedFontsAndTheirLicenses(CanopyAssetNaming naming) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-fonts-" + Guid.NewGuid().ToString("N"));
        try {
            CanopyHtmlAssets.WriteTo(directory, naming, CanopyRuntime.DataGrid);
            var page = Grid().ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetNaming = naming });
            var fontCss = Regex.Match(page, "href=\"assets/(canopyx-fonts[^\"]*\\.css)\"").Groups[1].Value;
            Assert.NotEmpty(fontCss);
            var css = File.ReadAllText(Path.Combine(directory, fontCss));
            Assert.DoesNotContain("local(", css);
            var files = Regex.Matches(css, "url\\(\"([^\"]+)\"\\)").Select(match => match.Groups[1].Value).ToArray();
            Assert.Equal(2, files.Length);
            foreach (var (name, hash) in Fonts) {
                var file = Assert.Single(files, file => file.StartsWith(name + ".", StringComparison.Ordinal));
                Assert.Equal(hash, Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(Path.Combine(directory, file)))).ToLowerInvariant());
                Assert.Contains("SIL OPEN FONT LICENSE", File.ReadAllText(Path.Combine(directory, "OFL-" + name + ".txt")));
            }
        } finally { Directory.Delete(directory, recursive: true); }
    }

    [Fact]
    public void InlinePages_EmbedQualifiedFonts_WhileHostedFragmentsReuseTheirHostsFaces() {
        var page = Grid().ToHtmlPage();
        var embedded = Regex.Matches(page, "data:font/woff2;base64,([A-Za-z0-9+/=]+)");
        Assert.Equal(2, embedded.Count);
        Assert.Equal(Fonts.Values.Order(), embedded.Select(match => Convert.ToHexString(
            SHA256.HashData(Convert.FromBase64String(match.Groups[1].Value))).ToLowerInvariant()).Order());
        Assert.Contains("SIL OPEN FONT LICENSE", page);
        Assert.DoesNotContain("@font-face", Grid().ToHtmlFragment());
        Assert.DoesNotContain("@font-face", CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid));
    }
}
