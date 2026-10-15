using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>A validated, counted export that is ready to stream.</summary>
/// <remarks>Validation and counting happen before the job is created, so a rejected export fails before any byte is written.</remarks>
public sealed class CanopyExportJob {
    private readonly Func<Stream, CancellationToken, Task> _write;
    private int _written;

    internal CanopyExportJob(CanopyExportRequest request, ICanopyExportFormat format, int recordCount, Func<Stream, CancellationToken, Task> write) {
        Request = request;
        Format = format;
        RecordCount = recordCount;
        _write = write;
    }

    /// <summary>Gets the validated request.</summary>
    public CanopyExportRequest Request { get; }

    /// <summary>Gets the export format.</summary>
    public ICanopyExportFormat Format { get; }

    /// <summary>Gets the media type of the file.</summary>
    public string ContentType => Format.ContentType;

    /// <summary>Gets the suggested file name with its extension.</summary>
    public string FileName => (Request.FileName ?? "export") + "." + Format.Extension;

    /// <summary>Gets the number of records the file will contain.</summary>
    public int RecordCount { get; }

    /// <summary>Streams the file. A job writes once.</summary>
    /// <param name="output">The destination; it is not closed.</param>
    /// <param name="cancellationToken">Cancels the export.</param>
    /// <returns>A task that completes when the file is written.</returns>
    public Task WriteAsync(Stream output, CancellationToken cancellationToken = default) {
        if (output == null) throw new ArgumentNullException(nameof(output));
        if (Interlocked.Exchange(ref _written, 1) != 0) throw new InvalidOperationException("An export job writes once.");
        return _write(output, cancellationToken);
    }
}
