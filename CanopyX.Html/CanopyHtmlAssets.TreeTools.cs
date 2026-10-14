using System;
using System.IO;
using System.Text.RegularExpressions;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The tree tools part's plain script file name.</summary>
    public const string TreeToolsScriptFileName = "canopyx-tree-tools.js";
    /// <summary>The tree tools part's plain stylesheet file name.</summary>
    public const string TreeToolsStyleFileName = "canopyx-tree-tools.css";
    private static readonly Lazy<string> TreeToolsScriptResource = new Lazy<string>(() => CanopyHtmlResources.Read(TreeToolsScriptFileName));
    private static readonly Lazy<string> TreeToolsStyleResource = new Lazy<string>(() => CanopyHtmlResources.Read(TreeToolsStyleFileName));

    /// <summary>
    /// Gets the tree tools part: the toolbar's Columns, Views, Export and more menus, column fitting, auto height and tree
    /// exports for tree grids.
    /// </summary>
    /// <remarks>
    /// Every tree runtime loads it when a tree mounts, so it is shipped beside all four entry points; the tree reports ready
    /// once it is installed. Its toolbar and menus share their source with the flat grid's.
    /// </remarks>
    public static string TreeToolsScript => TreeToolsScriptResource.Value;
    /// <summary>Gets the tree tools part's stylesheet: the flat grid's chrome and Columns menu styles for trees.</summary>
    public static string TreeToolsStyle => TreeToolsStyleResource.Value;
    /// <summary>Gets the tree tools part version shared with its runtimes.</summary>
    public static string TreeToolsVersion {
        get {
            var value = Regex.Match(TreeToolsScript, "version\\s*:\\s*\"([a-f0-9]{16})\"").Groups[1].Value;
            if (value.Length != 16) throw new InvalidOperationException("The tree tools part version is missing.");
            return value;
        }
    }
    /// <summary>Gets the content-hashed tree tools script file name.</summary>
    public static string HashedTreeToolsScriptFileName => "canopyx-tree-tools." + Hash(TreeToolsScript) + ".js";
    /// <summary>Gets the content-hashed tree tools stylesheet file name.</summary>
    public static string HashedTreeToolsStyleFileName => "canopyx-tree-tools." + Hash(TreeToolsStyle) + ".css";
    /// <summary>Gets inert payload markup for hosts embedding the runtime into a single-file page.</summary>
    /// <remarks>
    /// Tree fragments written with inline assets already carry this markup. Custom JavaScript hosts can include it once
    /// outside a mounted host, or serve <see cref="TreeToolsScriptFileName"/> and <see cref="TreeToolsStyleFileName"/> beside the runtime.
    /// </remarks>
    public static string TreeToolsMarkup => "<script type=\"application/x-canopyx-tree-tools-style\" data-cx-version=\"" + TreeToolsVersion + "\">" + TreeToolsStyle
        + "</script><script type=\"application/x-canopyx-tree-tools\" data-cx-version=\"" + TreeToolsVersion + "\">" + TreeToolsScript + "</script>";

    private static void WriteTreeTools(string directory, CanopyAssetNaming naming) {
        foreach (var asset in new[] {
            new[] { naming == CanopyAssetNaming.Plain ? TreeToolsScriptFileName : HashedTreeToolsScriptFileName, TreeToolsScript },
            new[] { naming == CanopyAssetNaming.Plain ? TreeToolsStyleFileName : HashedTreeToolsStyleFileName, TreeToolsStyle }
        }) {
            var path = Path.GetFullPath(Path.Combine(directory, asset[0]));
            if (naming == CanopyAssetNaming.Plain) File.WriteAllText(path, asset[1], FileEncoding);
            else WriteOnce(path, FileEncoding.GetBytes(asset[1]));
        }
    }
}
