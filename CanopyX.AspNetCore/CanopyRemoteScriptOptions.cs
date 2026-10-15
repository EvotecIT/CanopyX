using System.Collections.Generic;

namespace CanopyX.AspNetCore;

/// <summary>Options of the browser script <see cref="CanopyRemoteScript"/> writes: server export formats and record details.</summary>
public sealed class CanopyRemoteScriptOptions {
    /// <summary>Gets the server export formats to offer in the Export menu, with their menu labels, for example
    /// <c>("csv", "CSV, all matching rows")</c>. Empty offers server CSV with an English label.</summary>
    public IList<(string Id, string Label)> ExportFormats { get; } = new List<(string Id, string Label)>();

    /// <summary>Gets or sets whether the grid's source loads record details from the <c>record</c> route
    /// (<see cref="CanopyRemoteEndpointOptions.Records"/>). The view must declare a record panel.</summary>
    /// <remarks>A record that is not available (404 <c>recordNotFound</c>) answers null: the drawer shows the row without
    /// details, and opening a record the grid has not loaded (a deep link or a related record) fails with "not available".
    /// Other errors reject, so the drawer offers Retry.</remarks>
    public bool Records { get; set; }
}
