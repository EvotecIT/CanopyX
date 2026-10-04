using System;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The plain file name of the data-grid script, including the tree runtimes.</summary>
    public const string GridScriptFileName = "canopyx-grid.js";

    /// <summary>The plain file name of the data-grid stylesheet.</summary>
    public const string GridStyleFileName = "canopyx-grid.css";

    private static readonly Lazy<string> GridScriptResource = new(() => CanopyHtmlResources.Read(GridScriptFileName));
    private static readonly Lazy<string> GridStyleResource = new(() => CanopyHtmlResources.Read(GridStyleFileName));
    private static readonly Lazy<string> GridScriptHash = new(() => Hash(GridScriptResource.Value));
    private static readonly Lazy<string> GridStyleHash = new(() => Hash(GridStyleResource.Value));
}
