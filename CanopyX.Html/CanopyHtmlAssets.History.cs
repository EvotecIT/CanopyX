namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The history presenter part's plain script file name.</summary>
    public const string HistoryScriptFileName = "canopyx-history.js";
    /// <summary>Gets the history presenter part of the grid runtimes: the status strip and the bar and line sparklines.</summary>
    /// <remarks>A grid with such a column loads it before its first query; other grids never load it.</remarks>
    public static string HistoryScript => GetPart("history").Script;
    /// <summary>Gets the history presenter part version shared with its grid runtimes.</summary>
    public static string HistoryVersion => GetPart("history").Version;
    /// <summary>Gets the content-hashed history presenter part file name.</summary>
    public static string HashedHistoryScriptFileName => GetPart("history").HashedScriptFileName;
    /// <summary>Gets inert payload markup for hosts embedding the runtime into a single-file page.</summary>
    /// <remarks>Grid fragments already carry this markup. Custom JavaScript hosts can include it once outside a mounted host, or load <see cref="HistoryScript"/> with the runtime.</remarks>
    public static string HistoryMarkup => GetPart("history").Markup;
}