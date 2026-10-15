namespace CanopyX.Bundles;

/// <summary>What <see cref="CanopyGridRowData.WriteFiles"/> wrote: the data folder of a grid bundle and sizes to check against budgets.</summary>
public sealed class CanopyGridBundleResult {
    internal CanopyGridBundleResult(string dataBase, string dataDirectory) {
        Base = dataBase;
        DataDirectory = dataDirectory;
    }

    /// <summary>Gets the data folder relative to the page, with forward slashes and a trailing slash (for example <c>data/inventory-…/</c>).</summary>
    public string Base { get; }

    /// <summary>Gets the full path of the data folder.</summary>
    public string DataDirectory { get; }

    /// <summary>Gets the number of chunk files written.</summary>
    public int FileCount { get; internal set; }

    /// <summary>Gets the total size of the files written, in bytes.</summary>
    public long TotalBytes { get; internal set; }

    /// <summary>Gets the size of the largest file written, in bytes.</summary>
    public long LargestFileBytes { get; internal set; }

    /// <summary>Gets the number of rows written.</summary>
    public int RowCount { get; internal set; }
}
