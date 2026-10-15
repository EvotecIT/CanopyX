namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The optional export part's plain script file name.</summary>
    public const string ExportScriptFileName = "canopyx-export.js";
    /// <summary>Gets the export part every runtime loads for flat grids and trees: the Export menu, CSV, copy and export format writers.</summary>
    /// <remarks>It installs when the Export menu opens or an export method runs. The same as <c>GetPart("export").Script</c>.</remarks>
    public static string ExportScript => GetPart("export").Script;
    /// <summary>Gets the export part version shared with its runtimes.</summary>
    public static string ExportVersion => GetPart("export").Version;
    /// <summary>Gets the content-hashed export part file name.</summary>
    public static string HashedExportScriptFileName => GetPart("export").HashedScriptFileName;
    /// <summary>Gets inert payload markup for hosts embedding the runtime into a single-file page.</summary>
    /// <remarks>Grid and tree fragments written with inline assets already carry this markup. Custom JavaScript hosts can include it once outside a mounted host, or load <see cref="ExportScript"/> with the runtime.</remarks>
    public static string ExportMarkup => GetPart("export").Markup;
}