using System;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The plain file name of the interactive tree script.</summary>
    public const string InteractiveScriptFileName = "canopyx-interactive.js";

    /// <summary>The plain file name of the interactive tree stylesheet.</summary>
    public const string InteractiveStyleFileName = "canopyx-interactive.css";

    private static readonly Lazy<string> InteractiveScriptResource = new(() => CanopyHtmlResources.Read(InteractiveScriptFileName));
    private static readonly Lazy<string> InteractiveStyleResource = new(() => CanopyHtmlResources.Read(InteractiveStyleFileName));
    private static readonly Lazy<string> InteractiveScriptHash = new(() => Hash(InteractiveScriptResource.Value));
    private static readonly Lazy<string> InteractiveStyleHash = new(() => Hash(InteractiveStyleResource.Value));

    /// <summary>Gets the script for an entry point. The interactive script includes the standard tree runtime.</summary>
    /// <param name="runtime">The entry point.</param>
    /// <returns>The script, safe to inline into HTML.</returns>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="runtime"/> is unknown.</exception>
    public static string GetScript(CanopyRuntime runtime) => runtime switch {
        CanopyRuntime.TreeGrid => Script,
        CanopyRuntime.InteractiveTreeGrid => InteractiveScriptResource.Value,
        CanopyRuntime.DataGrid => GridScriptResource.Value,
        CanopyRuntime.ReportingGrid => ReportingScriptResource.Value,
        CanopyRuntime.Flow => FlowScriptResource.Value,
        _ => throw new ArgumentOutOfRangeException(nameof(runtime), runtime, "Unknown browser runtime.")
    };

    /// <summary>Gets the complete stylesheet for an entry point.</summary>
    /// <param name="runtime">The entry point.</param>
    /// <returns>The stylesheet.</returns>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="runtime"/> is unknown.</exception>
    public static string GetStyle(CanopyRuntime runtime) => runtime switch {
        CanopyRuntime.TreeGrid => Style,
        CanopyRuntime.InteractiveTreeGrid => InteractiveStyleResource.Value,
        CanopyRuntime.DataGrid => GridStyleResource.Value,
        CanopyRuntime.ReportingGrid => ReportingStyleResource.Value,
        CanopyRuntime.Flow => FlowStyleResource.Value,
        _ => throw new ArgumentOutOfRangeException(nameof(runtime), runtime, "Unknown browser runtime.")
    };

    /// <summary>Gets the content hash of an entry point's script.</summary>
    /// <param name="runtime">The entry point.</param>
    /// <returns>The first sixteen lowercase SHA-256 hex digits.</returns>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="runtime"/> is unknown.</exception>
    public static string GetScriptHash(CanopyRuntime runtime) => runtime switch {
        CanopyRuntime.TreeGrid => ScriptHash,
        CanopyRuntime.InteractiveTreeGrid => InteractiveScriptHash.Value,
        CanopyRuntime.DataGrid => GridScriptHash.Value,
        CanopyRuntime.ReportingGrid => ReportingScriptHash.Value,
        CanopyRuntime.Flow => FlowScriptHash.Value,
        _ => throw new ArgumentOutOfRangeException(nameof(runtime), runtime, "Unknown browser runtime.")
    };

    /// <summary>Gets the content hash of an entry point's stylesheet.</summary>
    /// <param name="runtime">The entry point.</param>
    /// <returns>The first sixteen lowercase SHA-256 hex digits.</returns>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="runtime"/> is unknown.</exception>
    public static string GetStyleHash(CanopyRuntime runtime) => runtime switch {
        CanopyRuntime.TreeGrid => StyleHash,
        CanopyRuntime.InteractiveTreeGrid => InteractiveStyleHash.Value,
        CanopyRuntime.DataGrid => GridStyleHash.Value,
        CanopyRuntime.ReportingGrid => ReportingStyleHash.Value,
        CanopyRuntime.Flow => FlowStyleHash.Value,
        _ => throw new ArgumentOutOfRangeException(nameof(runtime), runtime, "Unknown browser runtime.")
    };

    /// <summary>Gets the script file name for the naming and entry point.</summary>
    /// <param name="naming">Content-hashed or plain file names.</param>
    /// <param name="runtime">The entry point.</param>
    /// <returns>The script file name.</returns>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="runtime"/> is unknown.</exception>
    public static string GetScriptFileName(CanopyAssetNaming naming, CanopyRuntime runtime) {
        var hash = GetScriptHash(runtime);
        var stem = RuntimeStem(runtime);
        return stem + (naming == CanopyAssetNaming.Plain ? "" : "." + hash) + ".js";
    }

    /// <summary>Gets the stylesheet file name for the naming and entry point.</summary>
    /// <param name="naming">Content-hashed or plain file names.</param>
    /// <param name="runtime">The entry point.</param>
    /// <returns>The stylesheet file name.</returns>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="runtime"/> is unknown.</exception>
    public static string GetStyleFileName(CanopyAssetNaming naming, CanopyRuntime runtime) {
        var hash = GetStyleHash(runtime);
        var stem = RuntimeStem(runtime);
        return stem + (naming == CanopyAssetNaming.Plain ? "" : "." + hash) + ".css";
    }

    private static string RuntimeStem(CanopyRuntime runtime) => runtime switch {
        CanopyRuntime.TreeGrid => "canopyx",
        CanopyRuntime.DataGrid => "canopyx-grid",
        CanopyRuntime.ReportingGrid => "canopyx-reporting",
        CanopyRuntime.Flow => "canopyx-flow-entry",
        _ => "canopyx-interactive"
    };
}
