namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The optional filter editor's plain script file name.</summary>
    public const string FilterEditorScriptFileName = "canopyx-filter-editor.js";
    /// <summary>The optional filter editor's plain stylesheet file name.</summary>
    public const string FilterEditorStyleFileName = "canopyx-filter-editor.css";
    /// <summary>Gets the optional editor registration script. It installs when a menu, editor, drawer, or selected aggregate is used.</summary>
    public static string FilterEditorScript => GetPart("filter-editor").Script;
    /// <summary>Gets the optional filter editor stylesheet.</summary>
    public static string FilterEditorStyle => GetPart("filter-editor").Style!;
    /// <summary>Gets the filter editor version shared with its grid runtime.</summary>
    public static string FilterEditorVersion => GetPart("filter-editor").Version;
    /// <summary>Gets the content-hashed filter script file name.</summary>
    public static string HashedFilterEditorScriptFileName => GetPart("filter-editor").HashedScriptFileName;
    /// <summary>Gets the content-hashed filter stylesheet file name.</summary>
    public static string HashedFilterEditorStyleFileName => GetPart("filter-editor").HashedStyleFileName!;
    /// <summary>Gets inert payload markup for hosts embedding the runtime into a single-file page.</summary>
    /// <remarks>Grid fragments already carry this markup. Custom JavaScript hosts can include it once outside a mounted host; it activates on first use of an editor, menu, drawer, or selected aggregate.</remarks>
    public static string FilterEditorMarkup => GetPart("filter-editor").Markup;
}