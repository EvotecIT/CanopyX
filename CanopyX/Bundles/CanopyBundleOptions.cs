using System;

namespace CanopyX.Bundles;

/// <summary>
/// Options for <see cref="CanopyBundleWriter"/>.
/// </summary>
public sealed class CanopyBundleOptions {
    private int _pageSize = 250;
    private int _searchShardLimit = 20000;
    private int _maxFileBytes = 512 * 1024;
    private string? _dataPath;

    /// <summary>
    /// Gets or sets the folder for the sidecar files, relative to the output folder and to the page, with forward
    /// slashes. Defaults to <c>data/&lt;safe view id&gt;-&lt;SHA-256 of view id&gt;/</c>. The readable part is at most
    /// 40 characters, uses letters, digits, <c>-</c> and <c>_</c>, and escapes Windows device names.
    /// </summary>
    /// <exception cref="ArgumentException">The value contains an empty, unsafe, overlong, or non-portable folder component.</exception>
    public string? DataPath {
        get => _dataPath;
        set {
            if (value != null) {
                var path = value.Replace('\\', '/');
                var folder = path.EndsWith("/", StringComparison.Ordinal) ? path.Substring(0, path.Length - 1) : path;
                foreach (var component in folder.Split('/')) {
                    if (!PortableFolderNames.IsPortableComponent(component)) {
                        throw new ArgumentException("The data path must contain portable relative folder names of at most 255 characters, without empty components, trailing dots, or reserved device names.", nameof(value));
                    }
                }

                _dataPath = path.EndsWith("/", StringComparison.Ordinal) ? path : path + "/";
            } else {
                _dataPath = null;
            }
        }
    }

    /// <summary>
    /// Gets or sets the largest size of one sidecar file in bytes, from 16 KiB to 16 MiB. Pages and search index files
    /// that would grow past it are split, whatever <see cref="PageSize"/> and <see cref="SearchShardLimit"/> allow. A
    /// single node or search entry larger than the budget (a huge label or html detail) is written in a file of its
    /// own. Defaults to 512 KiB, half of the 1 MB budget in docs/architecture.md.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 16 KiB to 16 MiB.</exception>
    public int MaxFileBytes {
        get => _maxFileBytes;
        set {
            if (value < 16 * 1024 || value > 16 * 1024 * 1024) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "The file budget must be between 16 KiB and 16 MiB.");
            }

            _maxFileBytes = value;
        }
    }

    /// <summary>Gets or sets the most nodes one page file holds, from 1 to 10,000. Defaults to 250.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 1 to 10,000.</exception>
    public int PageSize {
        get => _pageSize;
        set {
            if (value < 1 || value > 10000) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Page size must be between 1 and 10,000.");
            }

            _pageSize = value;
        }
    }

    /// <summary>
    /// Gets or sets how many postings (one per word of a node label) a search shard may hold before it splits on a
    /// longer word prefix, from 100 to 1,000,000. A query loads the shards of its words, so a smaller limit means
    /// smaller but more files. A shard that cannot split further (a very common word) is stored in parts only when it
    /// outgrows <see cref="MaxFileBytes"/>. Shards of label tokens split at 1,000 postings or this limit, whichever
    /// is smaller. Defaults to 20,000.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 100 to 1,000,000.</exception>
    public int SearchShardLimit {
        get => _searchShardLimit;
        set {
            if (value < 100 || value > 1000000) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Search shard limit must be between 100 and 1,000,000.");
            }

            _searchShardLimit = value;
        }
    }

}
