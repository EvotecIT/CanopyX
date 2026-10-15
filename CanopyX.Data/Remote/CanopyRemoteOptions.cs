using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>Options of a remote grid endpoint: safety limits and export formats.</summary>
public sealed class CanopyRemoteOptions {
    /// <summary>Gets the safety limits applied to every request.</summary>
    public CanopyRemoteLimits Limits { get; } = new CanopyRemoteLimits();

    /// <summary>Gets the export formats offered by the export route. CSV is registered by default.</summary>
    public IList<ICanopyExportFormat> ExportFormats { get; } = new List<ICanopyExportFormat> { new CanopyCsvExportFormat() };
}
