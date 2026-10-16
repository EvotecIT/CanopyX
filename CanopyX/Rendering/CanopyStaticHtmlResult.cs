using System.Collections.Generic;

namespace CanopyX.Rendering;

/// <summary>A script-free tree outline or flat-grid table and the visible row text produced by the same render pass.</summary>
public sealed class CanopyStaticHtmlResult {
    internal CanopyStaticHtmlResult(string html, IReadOnlyList<IReadOnlyList<string>> rows, long totalRows, bool hasUnknownTotal, bool isComplete) {
        Html = html;
        Rows = rows;
        TotalRows = totalRows;
        HasUnknownTotal = hasUnknownTotal;
        IsComplete = isComplete;
    }

    /// <summary>Gets the complete table markup, including its caption, headers and overflow note.</summary>
    public string Html { get; }

    /// <summary>
    /// Gets the rendered data and detail rows in document order, excluding outer column headers, overflow notes and formatting legends.
    /// Each row contains its visible cell text before HTML encoding, including checkboxes, formatting cues, badges and hidden-row markers.
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

    /// <summary>
    /// Gets whether all matching outer records and their printable nested content are included. Partial accepted
    /// windows, row or tree depth limits, collapsed branches, unloaded children and unknown totals make this false.
    /// Excluding a detail with <see cref="CanopyGridDetail.Print"/> does not make the result incomplete.
    /// Detail wrappers and nested rows have different counts, so completeness cannot be inferred by comparing
    /// <see cref="Rows"/> with <see cref="TotalRows"/>.
    /// </summary>
    public bool IsComplete { get; }
}
