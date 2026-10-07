using System.Collections.Generic;

namespace CanopyX.Rendering;

/// <summary>A script-free outline and the visible row text produced by the same render pass.</summary>
public sealed class CanopyStaticHtmlResult {
    internal CanopyStaticHtmlResult(string html, IReadOnlyList<IReadOnlyList<string>> rows, long totalRows, bool hasUnknownTotal) {
        Html = html;
        Rows = rows;
        TotalRows = totalRows;
        HasUnknownTotal = hasUnknownTotal;
    }

    /// <summary>Gets the complete outline markup, including its caption, headers and overflow note.</summary>
    public string Html { get; }

    /// <summary>
    /// Gets the rendered data and detail rows in document order, excluding the column headers and overflow note.
    /// Each row contains its visible cell text before HTML encoding, including checkboxes, badges and hidden-row markers.
    /// A detail row has one cell; nested captions, headers, properties and values are separated by spaces within it.
    /// </summary>
    public IReadOnlyList<IReadOnlyList<string>> Rows { get; }

    /// <summary>
    /// Gets the known tree row count before row, depth and expansion limits, including declared unloaded children.
    /// The renderer counts the view's inline tree; it does not apply browser search or filter state.
    /// This is a lower bound when <see cref="HasUnknownTotal"/> is true.
    /// </summary>
    public long TotalRows { get; }

    /// <summary>Gets whether unloaded children without a declared count prevent an exact total.</summary>
    public bool HasUnknownTotal { get; }
}
