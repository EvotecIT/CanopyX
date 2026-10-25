using System.Collections.Generic;

namespace CanopyX;

/// <summary>Creates opt-in lists of optional export format identities.</summary>
public static class CanopyExportFormats {
    /// <summary>Offers the optional offline Office writers for XLSX and PDF.</summary>
    /// <returns>A new mutable format list, suitable for a view's <c>ExportFormats</c> property.</returns>
    /// <remarks>The browser document writers load on first use. This declaration adds no document-engine dependency to the view model.</remarks>
    public static IList<string> Office() => new List<string> { "xlsx", "pdf" };
}
