using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>Options of a remote grid endpoint: safety limits, export formats and commit messages.</summary>
public sealed class CanopyRemoteOptions {
    /// <summary>Gets the safety limits applied to every request.</summary>
    public CanopyRemoteLimits Limits { get; } = new CanopyRemoteLimits();

    /// <summary>Gets the export formats offered by the export route. CSV is registered by default.</summary>
    public IList<ICanopyExportFormat> ExportFormats { get; } = new List<ICanopyExportFormat> { new CanopyCsvExportFormat() };

    /// <summary>Gets the messages a commit answers with when a value fails a check or a row cannot be saved.</summary>
    public CanopyCommitMessages CommitMessages { get; } = new CanopyCommitMessages();
}
