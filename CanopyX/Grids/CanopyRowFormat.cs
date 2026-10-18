namespace CanopyX;

/// <summary>How the rows of an inline grid are written into a page (see "How CanopyX chooses" in docs/large-data.md).</summary>
public enum CanopyRowFormat {
    /// <summary>
    /// Chosen from the rows: row objects for up to <see cref="CanopyRowDataOptions.CompactAboveRows"/> rows, compact row data
    /// above that, and gzip-compressed compact row data when its JSON comes to more than
    /// <see cref="CanopyRowDataOptions.GzipAboveBytes"/>. In a page, rows with a detail payload or record fields stay row
    /// objects. A bundle (<c>SaveHtmlBundle</c>) always writes compact row data, compressed by the same size rule, and so refuses
    /// such rows.
    /// </summary>
    Auto = 0,

    /// <summary>Each row is an object in the grid document. Not available for bundles, which write their rows as files.</summary>
    Objects = 1,

    /// <summary>Compact row data: each row an array of its cells in column order, in chunks the browser decodes one at a time.</summary>
    Compact = 2,

    /// <summary>
    /// Compact row data whose chunks are the base64 text of their gzip-compressed JSON: several times smaller; the browser
    /// inflates every chunk with <c>DecompressionStream</c> (all current browsers), which costs some time while loading.
    /// </summary>
    CompactGzip = 3
}
