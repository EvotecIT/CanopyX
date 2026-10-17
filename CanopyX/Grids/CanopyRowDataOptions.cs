using System;

namespace CanopyX;

/// <summary>Options for writing the rows of an inline grid as compact row data (<see cref="CanopyGridRowData"/>).</summary>
public sealed class CanopyRowDataOptions {
    private int _chunkSize = 5000;
    private CanopyRowCompression _compression;

    /// <summary>
    /// Gets or sets the number of rows in each chunk, from 100 to 100,000. Defaults to 5,000. The browser decodes one chunk per
    /// task and paints between them, so smaller chunks keep the page more responsive while it loads and show the first rows
    /// sooner, and larger chunks finish the whole dataset with less overhead.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 100 to 100,000.</exception>
    public int ChunkSize {
        get => _chunkSize;
        set => _chunkSize = value >= 100 && value <= 100000 ? value : throw new ArgumentOutOfRangeException(nameof(value), value, "Row data chunks hold 100 to 100,000 rows.");
    }

    /// <summary>Gets or sets how each chunk is stored. Defaults to <see cref="CanopyRowCompression.None"/>.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is not a defined compression.</exception>
    public CanopyRowCompression Compression {
        get => _compression;
        set => _compression = value == CanopyRowCompression.None || value == CanopyRowCompression.Gzip ? value : throw new ArgumentOutOfRangeException(nameof(value), value, "Unknown row data compression.");
    }
}
