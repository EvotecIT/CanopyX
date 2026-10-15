using System;
using System.IO;
using System.Text.RegularExpressions;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The history presenter part's plain script file name.</summary>
    public const string HistoryScriptFileName = "canopyx-history.js";
    private static readonly Lazy<string> HistoryScriptResource = new Lazy<string>(() => CanopyHtmlResources.Read(HistoryScriptFileName));
    /// <summary>Gets the history presenter part of the grid runtimes: the status strip and the bar and line sparklines.</summary>
    /// <remarks>A grid with such a column loads it before its first query; other grids never load it.</remarks>
    public static string HistoryScript => HistoryScriptResource.Value;
    /// <summary>Gets the history presenter part version shared with its grid runtimes.</summary>
    public static string HistoryVersion {
        get {
            var value = Regex.Match(HistoryScript, "version\\s*:\\s*\"([a-f0-9]{16})\"").Groups[1].Value;
            if (value.Length != 16) throw new InvalidOperationException("The history presenter part version is missing.");
            return value;
        }
    }
    /// <summary>Gets the content-hashed history presenter part file name.</summary>
    public static string HashedHistoryScriptFileName => "canopyx-history." + Hash(HistoryScript) + ".js";
    /// <summary>Gets inert payload markup for hosts embedding the runtime into a single-file page.</summary>
    /// <remarks>Grid fragments already carry this markup. Custom JavaScript hosts can include it once outside a mounted host, or load <see cref="HistoryScript"/> with the runtime.</remarks>
    public static string HistoryMarkup => "<script type=\"application/x-canopyx-history\" data-cx-version=\"" + HistoryVersion + "\">" + HistoryScript + "</script>";

    private static void WriteHistoryPart(string directory, CanopyAssetNaming naming) {
        var path = Path.GetFullPath(Path.Combine(directory, naming == CanopyAssetNaming.Plain ? HistoryScriptFileName : HashedHistoryScriptFileName));
        if (naming == CanopyAssetNaming.Plain) File.WriteAllText(path, HistoryScript, FileEncoding);
        else WriteOnce(path, FileEncoding.GetBytes(HistoryScript));
    }
}
