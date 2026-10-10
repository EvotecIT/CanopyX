using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A revisioned page of flat rows, after filtering and sorting the complete dataset.</summary>
/// <remarks>
/// Total is the unfiltered dataset size; matched is its size after the accepted query. Offset is measured
/// in the ordered matching rows. A revision identifies one consistent dataset snapshot across all pages.
/// </remarks>
public sealed class CanopyGridPage {
    /// <summary>Creates a host query result page.</summary>
    /// <param name="view">The target grid identity.</param>
    /// <param name="revision">The dataset snapshot identity.</param>
    /// <param name="offset">The offset into matching rows.</param>
    /// <param name="total">The complete unfiltered dataset size.</param>
    /// <param name="matched">The number of rows matching the query before paging.</param>
    public CanopyGridPage(string view, string revision, int offset, int total, int matched) {
        CanopyIdentifiers.Require(view, nameof(view));
        CanopyIdentifiers.Require(revision, nameof(revision));
        if (total < 0) throw new ArgumentOutOfRangeException(nameof(total));
        if (matched < 0 || matched > total) throw new ArgumentOutOfRangeException(nameof(matched));
        if (offset < 0 || offset > matched) throw new ArgumentOutOfRangeException(nameof(offset));
        View = view;
        Revision = revision;
        Offset = offset;
        Total = total;
        Matched = matched;
    }

    /// <summary>Gets the target grid identity.</summary>
    public string View { get; }

    /// <summary>Gets the dataset snapshot identity.</summary>
    public string Revision { get; }

    /// <summary>Gets the offset into ordered matching rows.</summary>
    public int Offset { get; }

    /// <summary>Gets the complete unfiltered dataset size.</summary>
    public int Total { get; }

    /// <summary>Gets the matching row count before paging.</summary>
    public int Matched { get; }

    /// <summary>Gets the ordered rows returned for this page.</summary>
    public IList<CanopyGridRow> Rows { get; } = new List<CanopyGridRow>();

    /// <summary>Writes the HTML-safe <c>gridPage</c> document of the <c>canopyx/2</c> protocol.</summary>
    /// <param name="view">Optional grid definition for checking the target identity and declared columns.</param>
    /// <returns>The result page.</returns>
    /// <exception cref="InvalidOperationException">Rows duplicate identities or contradict the result counts.</exception>
    public string ToJson(CanopyDataGridView? view = null) {
        if (Rows.Count > 10000) throw new InvalidOperationException("A grid result page cannot contain more than 10,000 rows.");
        if (Rows.Count > Matched - Offset) throw new InvalidOperationException("A grid page cannot extend past its matching row count.");
        if (Rows.Count == 0 && Offset < Matched) throw new InvalidOperationException("A grid page cannot be empty before the end of its matching rows.");
        if (view != null && (view.Id != View || view.Navigation != CanopyGridNavigation.Offset))
            throw new InvalidOperationException("An offset page must target its owning offset grid.");
        CanopyGridRows.Validate(Rows, view?.ValidateColumns(), view?.Columns);
        var writer = new CanopyJsonWriter(4096);
        writer.BeginObject().Envelope("gridPage").Property("view", View).Property("revision", Revision)
            .Property("offset", Offset).Property("total", Total).Property("matched", Matched)
            .Name("items").BeginArray();
        foreach (var row in Rows) row.WriteJson(writer);
        return writer.EndArray().EndObject().ToString();
    }
}
