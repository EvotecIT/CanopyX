namespace CanopyX.Bundles;

/// <summary>
/// What <see cref="CanopyBundleWriter"/> wrote: the source to put on the view, and sizes to check against budgets.
/// </summary>
public sealed class CanopyBundleResult {
    internal CanopyBundleResult(CanopySource source, string dataDirectory) {
        Source = source;
        DataDirectory = dataDirectory;
    }

    /// <summary>Gets the sidecar source that points at the written files. Assign it to <see cref="CanopyView.Source"/>.</summary>
    public CanopySource Source { get; }

    /// <summary>Gets the full path of the folder that holds the sidecar files.</summary>
    public string DataDirectory { get; }

    /// <summary>Gets the number of files written.</summary>
    public int FileCount { get; internal set; }

    /// <summary>Gets the total size of the files written, in bytes.</summary>
    public long TotalBytes { get; internal set; }

    /// <summary>Gets the size of the largest file written, in bytes.</summary>
    public long LargestFileBytes { get; internal set; }

    /// <summary>Gets the number of nodes written.</summary>
    public int NodeCount { get; internal set; }

    /// <summary>Gets the number of pages written: the top-level page files and the children pages inside the packs.</summary>
    public int PageCount { get; internal set; }

    /// <summary>Gets the number of pack files written. Each holds the children pages of many nodes.</summary>
    public int PackCount { get; internal set; }

    /// <summary>Gets the number of search shards (and shard parts) written, as files of their own or in index packs; zero when the view has no search.</summary>
    public int SearchShardCount { get; internal set; }

    /// <summary>Gets the number of search entry files written, as files of their own or in index packs; zero when the view has no search.</summary>
    public int SearchEntryFileCount { get; internal set; }

    /// <summary>Gets the number of search index packs written; zero when <see cref="CanopyBundleOptions.SearchPackBytes"/> is 0, the view has no search, or the index is empty.</summary>
    public int SearchPackCount { get; internal set; }

    /// <summary>Gets the size of the search index in bytes: of its files, or, packed, of its documents inside the packs; zero when the view has no search.</summary>
    public long SearchIndexBytes { get; internal set; }
}
