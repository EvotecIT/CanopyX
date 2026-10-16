using System;

namespace CanopyX;

/// <summary>How the rows of an inline grid are written: their format (<see cref="Format"/>) and the size of compact row data chunks.</summary>
public sealed class CanopyRowDataOptions {
    /// <summary>
    /// The most rows <see cref="CanopyRowFormat.Auto"/> writes as row objects: 5,000, one chunk of compact row data. Up to that,
    /// a grid loads quickly either way (10,000 rows take about 0.2 s at normal speed in every format, docs/large-data.md);
    /// above it, compact row data shows the first rows after the first chunk and keeps each task short.
    /// </summary>
    public const int CompactAboveRows = 5000;

    /// <summary>
    /// The JSON size of compact row data above which <see cref="CanopyRowFormat.Auto"/> compresses it: 5 MiB, about 25,000 rows
    /// of twelve columns. From there the file's size decides the load: 100,000 such rows are 19.4 MB compact and 6.3 MB
    /// compressed, and show their first rows sooner compressed (docs/large-data.md).
    /// </summary>
    public const long GzipAboveBytes = 5L * 1024 * 1024;

    private int _chunkSize = 5000;
    private CanopyRowFormat _format;

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

    /// <summary>Gets or sets the format of the rows. Defaults to <see cref="CanopyRowFormat.Auto"/>.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is not a defined format.</exception>
    public CanopyRowFormat Format {
        get => _format;
        set => _format = value >= CanopyRowFormat.Auto && value <= CanopyRowFormat.CompactGzip ? value : throw new ArgumentOutOfRangeException(nameof(value), value, "Unknown row format.");
    }
}
