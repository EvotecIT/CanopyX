namespace CanopyX.Html;

/// <summary>
/// How the runtime script and theme stylesheet are named when they are written as files and referenced by a page.
/// </summary>
public enum CanopyAssetNaming {
    /// <summary>
    /// The name carries a hash of the file's content, for example <c>canopyx.3f9a1c2b7d10e4a6.js</c>. A page always
    /// loads the runtime of the build that wrote it, however long the file is cached and whatever newer builds put
    /// into the same folder later. This is the default.
    /// </summary>
    ContentHash = 0,

    /// <summary>
    /// The fixed names <c>canopyx.js</c> and <c>canopyx.css</c>, for a host that versions or hashes the files in its
    /// own asset pipeline. A newer build overwrites them, so every page that references them has to be republished
    /// with it, together with its data.
    /// </summary>
    Plain
}
