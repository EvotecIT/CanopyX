using System;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The plain file name of the UI entry point's script, which runs the UI primitives without grid or tree code.</summary>
    public const string UiScriptFileName = "canopyx-ui.js";

    /// <summary>The plain file name of the UI entry point's stylesheet.</summary>
    public const string UiStyleFileName = "canopyx-ui.css";

    private static readonly Lazy<string> UiScriptResource = new(() => CanopyHtmlResources.Read(UiScriptFileName));
    private static readonly Lazy<string> UiStyleResource = new(() => CanopyHtmlResources.Read(UiStyleFileName));
    private static readonly Lazy<string> UiScriptHash = new(() => Hash(UiScriptResource.Value));
    private static readonly Lazy<string> UiStyleHash = new(() => Hash(UiStyleResource.Value));
}
