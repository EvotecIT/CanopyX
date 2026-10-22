using System;

namespace CanopyX;

/// <summary>The files a change list offers to download from its bar: the items the filters keep, in the list's order.</summary>
[Flags]
public enum CanopyChangeExports {
    /// <summary>No export.</summary>
    None = 0,

    /// <summary>A CSV file: one row per item with its kind, paths, sizes, hashes, times, flags, facts and values.</summary>
    Csv = 1,

    /// <summary>A JSON file: the items as the document gives them, diffs included.</summary>
    Json = 2
}