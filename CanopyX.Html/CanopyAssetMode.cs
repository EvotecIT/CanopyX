namespace CanopyX.Html;

/// <summary>
/// How a full page includes the runtime script and theme stylesheet.
/// </summary>
public enum CanopyAssetMode {
    /// <summary>The script and stylesheet are written into the page, so it is a single self-contained file.</summary>
    Inline = 0,

    /// <summary>
    /// The page references <c>canopyx.js</c> and <c>canopyx.css</c> under <see cref="CanopyHtmlOptions.AssetBaseUrl"/>.
    /// Write the files with <see cref="CanopyHtmlAssets.WriteTo(string)"/>. Several pages then share one cached copy.
    /// </summary>
    External
}
