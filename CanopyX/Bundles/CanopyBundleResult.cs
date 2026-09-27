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

    /// <summary>Gets the number of page files written.</summary>
    public int PageCount { get; internal set; }

    /// <summary>Gets the number of search shards written; zero when the view has no search.</summary>
    public int SearchShardCount { get; internal set; }
}
