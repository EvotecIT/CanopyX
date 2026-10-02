namespace CanopyX.Html;

/// <summary>
/// How a full page includes the runtime script and theme stylesheet.
/// </summary>
public enum CanopyAssetMode {
    /// <summary>The script and stylesheet are written into the page, so it is a single self-contained file.</summary>
    Inline = 0,

    /// <summary>
    /// The page references the runtime script and stylesheet under <see cref="CanopyHtmlOptions.AssetBaseUrl"/>, by
    /// the names <see cref="CanopyHtmlOptions.AssetNaming"/> selects (content-hashed by default). Write the files with
    /// <see cref="CanopyHtmlAssets.WriteTo(string, CanopyAssetNaming)"/> and the same naming. Pages written by the
    /// same build then share one cached copy.
    /// </summary>
    External
}
