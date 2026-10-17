namespace CanopyX;

/// <summary>How the chunks of compact grid row data are stored.</summary>
public enum CanopyRowCompression {
    /// <summary>Each chunk is JSON text. The browser parses it as it is.</summary>
    None = 0,

    /// <summary>
    /// Each chunk is the base64 text of its gzip-compressed JSON. The file is several times smaller; the browser inflates every
    /// chunk with <c>DecompressionStream</c> (all current browsers) before it parses it, which costs some time while loading.
    /// </summary>
    Gzip = 1
}
