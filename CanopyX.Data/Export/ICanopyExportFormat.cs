using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Writes exported records to a stream in one file format.</summary>
/// <remarks>
/// <see cref="CanopyCsvExportFormat"/> is built in. Other formats (a spreadsheet writer, for example) implement this
/// interface and are registered on <see cref="CanopyRemoteOptions.ExportFormats"/>. A writer reads
/// <see cref="CanopyExportContext.Records"/> once, in order, and writes as it reads, so the export is never buffered whole.
/// </remarks>
public interface ICanopyExportFormat {
    /// <summary>Gets the format identity used in the export route: 1 to 32 lowercase ASCII letters, digits and hyphens.</summary>
    string Id { get; }

    /// <summary>Gets the media type of the written file.</summary>
    string ContentType { get; }

    /// <summary>Gets the file extension without a dot.</summary>
    string Extension { get; }

    /// <summary>Writes the export.</summary>
    /// <param name="context">The validated request, its records and formatting helpers.</param>
    /// <param name="output">The destination stream; the writer does not close it.</param>
    /// <param name="cancellationToken">Cancels the export.</param>
    /// <returns>A task that completes when every record is written.</returns>
    Task WriteAsync(CanopyExportContext context, Stream output, CancellationToken cancellationToken);
}
