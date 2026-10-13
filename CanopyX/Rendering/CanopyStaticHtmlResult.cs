using System.Collections.Generic;

namespace CanopyX.Rendering;

/// <summary>A script-free tree outline or flat-grid table and the visible row text produced by the same render pass.</summary>
public sealed class CanopyStaticHtmlResult {
    internal CanopyStaticHtmlResult(string html, IReadOnlyList<IReadOnlyList<string>> rows, long totalRows, bool hasUnknownTotal) {
        Html = html;
        Rows = rows;
        TotalRows = totalRows;
        HasUnknownTotal = hasUnknownTotal;
    }

    /// <summary>Gets the complete table markup, including its caption, headers and overflow note.</summary>
    public string Html { get; }

    /// <summary>
    /// Gets the rendered data and detail rows in document order, excluding the column headers and overflow note.
    /// Each row contains its visible cell text before HTML encoding, including checkboxes, badges and hidden-row markers.
    /// A detail row has one cell; nested captions, headers, properties and values are separated by spaces within it.
    /// </summary>
    public IReadOnlyList<IReadOnlyList<string>> Rows { get; }

    /// <summary>
    /// Gets the matching row count before static rendering limits. Trees include declared unloaded children;
    /// grids use the accepted page's matching count or the complete inline row count.
    /// With an unknown cursor matching count, this lower bound includes its offset and all supplied page rows,
    /// including rows omitted by the static row limit. Rendering does not execute browser search or filter state.
    /// </summary>
    public long TotalRows { get; }

    /// <summary>Gets whether unloaded tree children or an unknown cursor matching count prevent an exact total.</summary>
    public bool HasUnknownTotal { get; }
}
