using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A complete visible cursor page after full-dataset filtering and sorting.</summary>
/// <remarks>
/// Cursors are opaque, host-governed positions in one revision. Next and previous pages are contiguous:
/// the next starts after these rows, and the previous ends at this page's offset. Counts may be unknown;
/// the offset remains the actual ordinal position supplied by the host, not a random-access capability.
/// </remarks>
public sealed class CanopyGridCursorPage {
    /// <summary>Creates a cursor page at an actual ordinal position in the matching result.</summary>
    /// <param name="view">The target grid identity.</param>
    /// <param name="revision">The consistent dataset snapshot identity.</param>
    /// <param name="offset">The actual nonnegative ordinal position of its first matching row.</param>
    public CanopyGridCursorPage(string view, string revision, int offset) {
        CanopyIdentifiers.Require(view, nameof(view));
        CanopyIdentifiers.Require(revision, nameof(revision));
        if (offset < 0) throw new ArgumentOutOfRangeException(nameof(offset));
        View = view;
        Revision = revision;
        Offset = offset;
    }

    /// <summary>Gets the owning grid identity.</summary>
    public string View { get; }

    /// <summary>Gets the consistent dataset snapshot identity.</summary>
    public string Revision { get; }

    /// <summary>Gets the actual ordinal position of the first matching row in this page.</summary>
    public int Offset { get; }

    /// <summary>Gets or sets the unfiltered dataset count. Null means unknown.</summary>
    public int? Total { get; set; }

    /// <summary>Gets or sets the matching dataset count. Null means unknown.</summary>
    public int? Matched { get; set; }

    /// <summary>Gets or sets the opaque cursor for the next contiguous page. Null means the end of the result.</summary>
    public string? NextCursor { get; set; }

    /// <summary>Gets or sets the opaque cursor for the preceding contiguous page. Null means no preceding page is available.</summary>
    public string? PreviousCursor { get; set; }

    /// <summary>Gets the complete ordered rows of this visible page, up to the requested limit.</summary>
    public IList<CanopyGridRow> Rows { get; } = new List<CanopyGridRow>();

    /// <summary>Writes the HTML-safe <c>gridCursorPage</c> document without inventing unknown counts.</summary>
    /// <param name="view">Optional owning grid definition for column and source validation.</param>
    /// <returns>The cursor-page document.</returns>
    public string ToJson(CanopyDataGridView? view = null) {
        if (view != null && (view.Id != View || view.Navigation != CanopyGridNavigation.Cursor))
            throw new InvalidOperationException("A cursor page must target its owning cursor grid.");
        if (Total < 0 || Matched < 0 || Total.HasValue && Matched.HasValue && Matched > Total ||
            Rows.Count > 10000 || (long)Offset + Rows.Count > int.MaxValue || Total.HasValue && Offset + Rows.Count > Total ||
            Matched.HasValue && Offset + Rows.Count > Matched ||
            Rows.Count == 0 && (Offset != 0 || NextCursor != null) || Offset == 0 && PreviousCursor != null ||
            Matched.HasValue && (NextCursor != null) != (Offset + Rows.Count < Matched) ||
            Total.HasValue && NextCursor != null && Offset + Rows.Count >= Total)
            throw new InvalidOperationException("Cursor rows, positions, counts and navigation must describe a consistent page.");
        CanopyGridCursors.Validate(NextCursor, nameof(NextCursor));
        CanopyGridCursors.Validate(PreviousCursor, nameof(PreviousCursor));
        if (NextCursor != null && NextCursor == PreviousCursor)
            throw new InvalidOperationException("Next and previous cursors must identify different pages.");
        CanopyGridRows.Validate(Rows, view?.ValidateColumns(), view?.Columns, view?.Reporting?.Detail);
        var writer = new CanopyJsonWriter(4096);
        writer.BeginObject().Envelope("gridCursorPage").Property("view", View).Property("revision", Revision).Property("offset", Offset);
        writer.Name("total"); if (Total.HasValue) writer.Number(Total.Value); else writer.Null();
        writer.Name("matched"); if (Matched.HasValue) writer.Number(Matched.Value); else writer.Null();
        writer.OptionalProperty("nextCursor", NextCursor).OptionalProperty("previousCursor", PreviousCursor).Name("items").BeginArray();
        foreach (var row in Rows) row.WriteJson(writer);
        return writer.EndArray().EndObject().ToString();
    }
}
