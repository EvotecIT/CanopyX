using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A bounded value/count request over the complete accepted query, before paging.</summary>
public sealed class CanopyGridFacetQuery {
    private int _limit = 100;

    /// <summary>Creates a request for an opted-in facet column and an accepted dataset revision.</summary>
    /// <param name="query">The full accepted query; its window and sort do not restrict facet counts.</param>
    /// <param name="column">The facet column identity.</param>
    public CanopyGridFacetQuery(CanopyGridQuery query, string column) {
        Query = query ?? throw new ArgumentNullException(nameof(query));
        CanopyIdentifiers.Require(column, nameof(column));
        Column = column;
    }

    /// <summary>Gets the accepted full-dataset query.</summary>
    public CanopyGridQuery Query { get; }
    /// <summary>Gets the declared facet column identity.</summary>
    public string Column { get; }
    /// <summary>Gets or sets folded substring search over raw facet values, independently of row search.</summary>
    public string? Search { get; set; }
    /// <summary>Gets or sets whether counts include existing predicates on this facet column. Default true.</summary>
    /// <remarks>False replaces each predicate on this column by true, including inside OR groups. Host authorization is never removed.</remarks>
    public bool IncludeCurrentFilter { get; set; } = true;
    /// <summary>Gets or sets the maximum returned distinct values, from 1 to 200. Default 100.</summary>
    public int Limit {
        get => _limit;
        set {
            if (value < 1 || value > 200) throw new ArgumentOutOfRangeException(nameof(value));
            _limit = value;
        }
    }

    /// <summary>Writes an HTML-safe <c>gridFacetQuery</c> after validating its owning view and accepted query.</summary>
    /// <param name="view">The owning grid definition.</param>
    /// <returns>The bounded facet request.</returns>
    public string ToJson(CanopyGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        CanopyGridFacets.Column(view, Column);
        Query.Validate(view);
        if (Query.Revision == null) throw new InvalidOperationException("Facets require an accepted dataset revision.");
        if ((Search?.Length ?? 0) > 16384) throw new InvalidOperationException("Facet search cannot exceed 16,384 code units.");
        var writer = new CanopyJsonWriter();
        writer.BeginObject().Envelope("gridFacetQuery").Property("column", Column).Property("search", Search ?? string.Empty)
            .Property("limit", Limit).Property("includeCurrentFilter", IncludeCurrentFilter).Name("query");
        Query.WriteJson(writer, view);
        return writer.EndObject().ToString();
    }
}
