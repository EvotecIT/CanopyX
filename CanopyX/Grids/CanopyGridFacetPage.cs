using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A bounded full-query facet response, independent of mounted or cached rows.</summary>
public sealed class CanopyGridFacetPage {
    /// <summary>Creates a revisioned facet result.</summary>
    /// <param name="view">The owning grid identity.</param>
    /// <param name="revision">The accepted dataset snapshot identity.</param>
    /// <param name="column">The facet column identity.</param>
    /// <param name="matched">The row count after query projection, before facet-value search.</param>
    /// <param name="totalValues">The distinct value count after facet-value search, before truncation.</param>
    public CanopyGridFacetPage(string view, string revision, string column, int matched, int totalValues) {
        CanopyIdentifiers.Require(view, nameof(view));
        CanopyIdentifiers.Require(revision, nameof(revision));
        CanopyIdentifiers.Require(column, nameof(column));
        if (matched < 0) throw new ArgumentOutOfRangeException(nameof(matched));
        if (totalValues < 0 || totalValues > matched) throw new ArgumentOutOfRangeException(nameof(totalValues));
        View = view; Revision = revision; Column = column; Matched = matched; TotalValues = totalValues;
    }
    /// <summary>Gets the owning grid identity.</summary>
    public string View { get; }
    /// <summary>Gets the accepted dataset snapshot identity.</summary>
    public string Revision { get; }
    /// <summary>Gets the declared facet column identity.</summary>
    public string Column { get; }
    /// <summary>Gets the row count after query projection and before value search.</summary>
    public int Matched { get; }
    /// <summary>Gets the distinct value count after value search and before truncation.</summary>
    public int TotalValues { get; }
    /// <summary>Gets or sets the exact value-search text from the request.</summary>
    public string? Search { get; set; }
    /// <summary>Gets or sets the exact projection flag from the request. Default true.</summary>
    public bool IncludeCurrentFilter { get; set; } = true;
    /// <summary>Gets ordered raw value/count buckets. At most 200 values may be written.</summary>
    public IList<CanopyGridFacetValue> Items { get; } = new List<CanopyGridFacetValue>();

    /// <summary>Writes the HTML-safe <c>gridFacetPage</c>, checking typed unique buckets and full-query counts.</summary>
    /// <param name="view">The owning grid definition.</param>
    /// <returns>The bounded response. Truncated is derived from the distinct and returned counts.</returns>
    public string ToJson(CanopyDataGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        if (view.Id != View) throw new InvalidOperationException("A facet response must target its owning grid.");
        var column = CanopyGridFacets.Column(view, Column);
        if ((Search?.Length ?? 0) > 16384 || Items.Count > 200 || Items.Count > TotalValues || Items.Count == 0 && TotalValues > 0)
            throw new InvalidOperationException("A facet page must contain a bounded nonempty prefix when values exist.");
        var keys = new HashSet<string>(StringComparer.Ordinal);
        long occurrences = 0;
        foreach (var item in Items) {
            if (item == null) throw new InvalidOperationException("A facet bucket cannot be null.");
            CanopyGridValues.Validate(item.Value?.Value, column);
            if (!keys.Add(CanopyGridFacets.Key(item.Value?.Value))) throw new InvalidOperationException("Facet buckets must have distinct typed canonical values.");
            occurrences += item.Count;
        }
        if (occurrences > Matched) throw new InvalidOperationException("Facet bucket counts cannot exceed the matching row count.");
        if (Items.Count == TotalValues && string.IsNullOrEmpty(Search) && occurrences != Matched)
            throw new InvalidOperationException("An unsearched complete facet must account for every matching row.");
        var writer = new CanopyJsonWriter();
        writer.BeginObject().Envelope("gridFacetPage").Property("view", View).Property("revision", Revision).Property("column", Column)
            .Property("search", Search ?? string.Empty).Property("includeCurrentFilter", IncludeCurrentFilter)
            .Property("matched", Matched).Property("totalValues", TotalValues).Property("truncated", Items.Count < TotalValues).Name("items").BeginArray();
        foreach (var item in Items) item.WriteJson(writer);
        return writer.EndArray().EndObject().ToString();
    }
}
