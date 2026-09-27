using System;

namespace CanopyX.Bundles;

/// <summary>
/// Options for <see cref="CanopyBundleWriter"/>.
/// </summary>
public sealed class CanopyBundleOptions {
    private int _pageSize = 250;
    private int _searchShardLimit = 2000;
    private int _maxFileBytes = 512 * 1024;
    private string? _dataPath;

    /// <summary>
    /// Gets or sets the folder for the sidecar files, relative to the output folder and to the page, with forward
    /// slashes. Defaults to <c>data/&lt;view id&gt;/</c>, with characters other than letters, digits, <c>-</c> and
    /// <c>_</c> in the view id replaced by <c>_</c>.
    /// </summary>
    /// <exception cref="ArgumentException">The value is empty, absolute, or climbs out of the output folder.</exception>
    public string? DataPath {
        get => _dataPath;
        set {
            if (value != null) {
                var path = value.Replace('\\', '/');
                // The path becomes part of script URLs, so it is limited to characters that need no encoding.
                // Windows drops a trailing dot from folder names, which would move the files away from their URLs.
                if (path.Length == 0 || path.StartsWith("/", StringComparison.Ordinal) || ("/" + path).Contains("./") || path.EndsWith(".", StringComparison.Ordinal) || !IsUrlSafe(path)) {
                    throw new ArgumentException("The data path must be a relative folder inside the output folder, using letters, digits, '-', '_', '.', and '/'.", nameof(value));
                }

                _dataPath = path.EndsWith("/", StringComparison.Ordinal) ? path : path + "/";
            } else {
                _dataPath = null;
            }
        }
    }

    /// <summary>
    /// Gets or sets the largest size of one sidecar file in bytes, from 16 KiB to 16 MiB. Pages and search shards that
    /// would grow past it are split, whatever <see cref="PageSize"/> and <see cref="SearchShardLimit"/> allow. A single
    /// node or search entry larger than the budget (a huge label or html detail) is written in a file of its own.
    /// Defaults to 512 KiB, half of the 1 MB budget in docs/architecture.md.
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
    /// Gets or sets how many entries a search shard may hold before it splits on a longer prefix, from 100 to
    /// 100,000. A shard that cannot split further (a very common word) is stored in parts of this size. Defaults to 2,000.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 100 to 100,000.</exception>
    public int SearchShardLimit {
        get => _searchShardLimit;
        set {
            if (value < 100 || value > 100000) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Search shard limit must be between 100 and 100,000.");
            }

            _searchShardLimit = value;
        }
    }

    private static bool IsUrlSafe(string path) {
        foreach (var ch in path) {
            if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.' || ch == '/')) {
                return false;
            }
        }

        return true;
    }
}
