using System;
using System.IO;
using System.Text.RegularExpressions;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The optional export part's plain script file name.</summary>
    public const string ExportScriptFileName = "canopyx-export.js";
    private static readonly Lazy<string> ExportScriptResource = new Lazy<string>(() => CanopyHtmlResources.Read(ExportScriptFileName));
    /// <summary>Gets the export part every runtime loads for flat grids and trees: the Export menu, CSV, copy and export format writers.</summary>
    /// <remarks>It installs when the Export menu opens or an export method runs.</remarks>
    public static string ExportScript => ExportScriptResource.Value;
    /// <summary>Gets the export part version shared with its grid runtime.</summary>
    public static string ExportVersion {
        get {
            var value = Regex.Match(ExportScript, "version\\s*:\\s*\"([a-f0-9]{16})\"").Groups[1].Value;
            if (value.Length != 16) throw new InvalidOperationException("The export part version is missing.");
            return value;
        }
    }
    /// <summary>Gets the content-hashed export part file name.</summary>
    public static string HashedExportScriptFileName => "canopyx-export." + Hash(ExportScript) + ".js";
    /// <summary>Gets inert payload markup for hosts embedding the runtime into a single-file page.</summary>
    /// <remarks>Grid and tree fragments written with inline assets already carry this markup. Custom JavaScript hosts can include it once outside a mounted host, or load <see cref="ExportScript"/> with the runtime.</remarks>
    public static string ExportMarkup => "<script type=\"application/x-canopyx-export\" data-cx-version=\"" + ExportVersion + "\">" + ExportScript + "</script>";

    private static void WriteExportPart(string directory, CanopyAssetNaming naming) {
        var path = Path.GetFullPath(Path.Combine(directory, naming == CanopyAssetNaming.Plain ? ExportScriptFileName : HashedExportScriptFileName));
        if (naming == CanopyAssetNaming.Plain) File.WriteAllText(path, ExportScript, FileEncoding);
        else WriteOnce(path, FileEncoding.GetBytes(ExportScript));
    }
}