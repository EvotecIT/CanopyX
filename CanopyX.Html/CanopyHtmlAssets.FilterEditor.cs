using System;
using System.IO;
using System.Text.RegularExpressions;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The optional filter editor's plain script file name.</summary>
    public const string FilterEditorScriptFileName = "canopyx-filter-editor.js";
    /// <summary>The optional filter editor's plain stylesheet file name.</summary>
    public const string FilterEditorStyleFileName = "canopyx-filter-editor.css";
    private static readonly Lazy<string> FilterScriptResource = new Lazy<string>(() => CanopyHtmlResources.Read(FilterEditorScriptFileName));
    private static readonly Lazy<string> FilterStyleResource = new Lazy<string>(() => CanopyHtmlResources.Read(FilterEditorStyleFileName));
    /// <summary>Gets the optional editor registration script. It installs when a menu, editor, drawer, or selected aggregate is used.</summary>
    public static string FilterEditorScript => FilterScriptResource.Value;
    /// <summary>Gets the optional filter editor stylesheet.</summary>
    public static string FilterEditorStyle => FilterStyleResource.Value;
    /// <summary>Gets the filter editor version shared with its grid runtime.</summary>
    public static string FilterEditorVersion {
        get {
            var value = Regex.Match(FilterEditorScript, "version\\s*:\\s*\"([a-f0-9]{16})\"").Groups[1].Value;
            if (value.Length != 16) throw new InvalidOperationException("The filter editor version is missing.");
            return value;
        }
    }
    /// <summary>Gets the content-hashed filter script file name.</summary>
    public static string HashedFilterEditorScriptFileName => "canopyx-filter-editor." + Hash(FilterEditorScript) + ".js";
    /// <summary>Gets the content-hashed filter stylesheet file name.</summary>
    public static string HashedFilterEditorStyleFileName => "canopyx-filter-editor." + Hash(FilterEditorStyle) + ".css";
    /// <summary>Gets inert payload markup for hosts embedding the runtime into a single-file page.</summary>
    /// <remarks>Grid fragments already carry this markup. Custom JavaScript hosts can include it once outside a mounted host; it activates on first use of an editor, menu, drawer, or selected aggregate.</remarks>
    public static string FilterEditorMarkup => "<script type=\"application/x-canopyx-filter-style\" data-cx-version=\"" + FilterEditorVersion + "\">" + FilterEditorStyle
        + "</script><script type=\"application/x-canopyx-filter-editor\" data-cx-version=\"" + FilterEditorVersion + "\">" + FilterEditorScript + "</script>";

    private static void WriteFilterEditor(string directory, CanopyAssetNaming naming) {
        foreach (var asset in new[] {
            new[] { naming == CanopyAssetNaming.Plain ? FilterEditorScriptFileName : HashedFilterEditorScriptFileName, FilterEditorScript },
            new[] { naming == CanopyAssetNaming.Plain ? FilterEditorStyleFileName : HashedFilterEditorStyleFileName, FilterEditorStyle }
        }) {
            var path = Path.GetFullPath(Path.Combine(directory, asset[0]));
            if (naming == CanopyAssetNaming.Plain) File.WriteAllText(path, asset[1], FileEncoding);
            else WriteOnce(path, FileEncoding.GetBytes(asset[1]));
        }
    }
}
