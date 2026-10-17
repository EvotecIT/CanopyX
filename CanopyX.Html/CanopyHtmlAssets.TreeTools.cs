namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The tree tools part's plain script file name.</summary>
    public const string TreeToolsScriptFileName = "canopyx-tree-tools.js";
    /// <summary>The tree tools part's plain stylesheet file name.</summary>
    public const string TreeToolsStyleFileName = "canopyx-tree-tools.css";

    /// <summary>
    /// Gets the tree tools part: the toolbar's Columns, Views, Export and more menus, column fitting, auto height and tree
    /// exports for tree grids.
    /// </summary>
    /// <remarks>
    /// Every tree runtime loads it when a tree mounts, so it is shipped beside all four entry points; the tree reports ready
    /// once it is installed. Its toolbar and menus share their source with the flat grid's.
    /// </remarks>
    public static string TreeToolsScript => GetPart("tree-tools").Script;
    /// <summary>Gets the tree tools part's stylesheet: the flat grid's chrome and Columns menu styles for trees.</summary>
    public static string TreeToolsStyle => GetPart("tree-tools").Style!;
    /// <summary>Gets the tree tools part version shared with its runtimes.</summary>
    public static string TreeToolsVersion => GetPart("tree-tools").Version;
    /// <summary>Gets the content-hashed tree tools script file name.</summary>
    public static string HashedTreeToolsScriptFileName => GetPart("tree-tools").HashedScriptFileName;
    /// <summary>Gets the content-hashed tree tools stylesheet file name.</summary>
    public static string HashedTreeToolsStyleFileName => GetPart("tree-tools").HashedStyleFileName!;
    /// <summary>Gets inert payload markup for hosts embedding the runtime into a single-file page.</summary>
    /// <remarks>
    /// Tree fragments written with inline assets already carry this markup. Custom JavaScript hosts can include it once
    /// outside a mounted host, or serve <see cref="TreeToolsScriptFileName"/> and <see cref="TreeToolsStyleFileName"/> beside the runtime.
    /// Trees load other parts too: the export part for their Export menu, the links part for deep links and the search part for a
    /// sidecar source. A host that assembles a single-file page embeds the parts of <see cref="GetRequiredParts(CanopyTreeView)"/>
    /// (<see cref="CanopyHtmlDocument.EmbedOnce(CanopyHtmlPart)"/>), and a host that serves files serves those of <see cref="GetParts(CanopyRuntime)"/>.
    /// </remarks>
    public static string TreeToolsMarkup => GetPart("tree-tools").Markup;
}