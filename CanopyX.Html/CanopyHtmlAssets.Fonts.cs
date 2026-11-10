using System;
using System.IO;
using System.Net;
using System.Text;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    private static readonly string[] FontNames = { "Archivo", "JetBrainsMono" };
    private static readonly Lazy<string> FontStyleSource = new(() => CanopyHtmlResources.Read("Fonts.canopyx-fonts.css"));
    private static readonly Lazy<string> InlineFontStyle = new(() => CreateFontStyle(CanopyAssetNaming.ContentHash, inline: true));

    /// <summary>Gets self-contained Archivo and JetBrains Mono face CSS, including font bytes and OFL notices.</summary>
    /// <remarks>For document markup use <see cref="FontHead"/>. A custom style containing this CSS uses <c>data-font-source</c> to share it with print documents. Hosts already providing these faces omit it.</remarks>
    public static string FontStyle => InlineFontStyle.Value;

    /// <summary>Gets the document-level font style or stylesheet link, also used by the grid print document.</summary>
    /// <param name="options">Asset naming, base URL, delivery mode and nonce. Null embeds the fonts.</param>
    /// <returns>One head element marked as a reusable font source. Include it once per document.</returns>
    public static string FontHead(CanopyHtmlOptions? options = null) {
        options ??= new CanopyHtmlOptions();
        var nonce = CanopyContentSecurity.Attribute(options.Nonce);
        return options.AssetMode == CanopyAssetMode.External
            ? "<link data-font-source rel=\"stylesheet\" href=\"" + WebUtility.HtmlEncode(options.AssetBaseUrl + GetFontStyleFileName(options.AssetNaming)) + "\"" + nonce + ">\n"
            : "<style data-font-source" + nonce + ">\n" + FontStyle + "</style>\n";
    }

    // Only full standalone pages include these faces. Fragment hosts supply their own shared faces.
    private static string CreateFontStyle(CanopyAssetNaming naming, bool inline = false) {
        var css = FontStyleSource.Value;
        var licenses = new StringBuilder();
        foreach (var name in FontNames) {
            var bytes = CanopyHtmlResources.ReadBytes("Fonts." + name + ".woff2");
            var url = inline ? "data:font/woff2;base64," + Convert.ToBase64String(bytes) : FontFileName(name, naming, bytes);
            css = css.Replace("\"" + name + ".woff2\"", "\"" + url + "\"");
            if (inline) licenses.Append("/* ").Append(name).Append('\n')
                .Append(CanopyHtmlResources.Read("Fonts.OFL-" + name + ".txt").Replace("*/", "* /"))
                .Append("\n*/\n");
        }
        return licenses.ToString() + css;
    }

    /// <summary>Gets the standalone font stylesheet file name written by <see cref="WriteTo(string)"/>.</summary>
    /// <param name="naming">The naming used when writing the asset folder.</param>
    /// <returns>The plain or content-hashed font stylesheet file name.</returns>
    public static string GetFontStyleFileName(CanopyAssetNaming naming = CanopyAssetNaming.ContentHash) => naming == CanopyAssetNaming.Plain
        ? "canopyx-fonts.css" : "canopyx-fonts." + Hash(CreateFontStyle(naming)) + ".css";

    private static string FontFileName(string name, CanopyAssetNaming naming, byte[] bytes) => naming == CanopyAssetNaming.Plain
        ? name + ".woff2" : name + "." + Hash(bytes) + ".woff2";

    private static void WriteFonts(string directory, CanopyAssetNaming naming) {
        foreach (var name in FontNames) {
            var bytes = CanopyHtmlResources.ReadBytes("Fonts." + name + ".woff2");
            WriteOnce(Path.Combine(directory, FontFileName(name, naming, bytes)), bytes);
            WriteOnce(Path.Combine(directory, "OFL-" + name + ".txt"),
                FileEncoding.GetBytes(CanopyHtmlResources.Read("Fonts.OFL-" + name + ".txt")));
        }
        WriteOnce(Path.Combine(directory, GetFontStyleFileName(naming)), FileEncoding.GetBytes(CreateFontStyle(naming)));
    }
}
