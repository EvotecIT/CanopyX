using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Search results: the <c>search</c> document of the <c>canopyx/2</c> protocol, returned by remote search endpoints.
/// </summary>
public sealed class CanopySearchResult {
    private int? _total;
    private string? _revision;

    /// <summary>Gets or sets the dataset revision, required for a query-aware remote source.</summary>
    /// <exception cref="ArgumentException">The value is empty or contains unpaired surrogates.</exception>
    public string? Revision {
        get => _revision;
        set { CanopyIdentifiers.Require(value, nameof(value), allowNull: true); _revision = value; }
    }

    /// <summary>Creates a search result.</summary>
    /// <param name="query">The query as the user typed it.</param>
    /// <exception cref="ArgumentNullException"><paramref name="query"/> is null.</exception>
    public CanopySearchResult(string query) {
        Query = query ?? throw new ArgumentNullException(nameof(query));
    }

    /// <summary>Gets the query.</summary>
    public string Query { get; }

    /// <summary>Gets the hits, best match first.</summary>
    public IList<CanopySearchHit> Hits { get; } = new List<CanopySearchHit>();

    /// <summary>Gets or sets the total number of matches, which can exceed the hits returned.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is negative.</exception>
    public int? Total {
        get => _total;
        set {
            if (value < 0) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Total cannot be negative.");
            }

            _total = value;
        }
    }

    /// <summary>Gets or sets whether more matches exist than the hits returned.</summary>
    public bool Truncated { get; set; }

    /// <summary>Writes the <c>search</c> document.</summary>
    /// <returns>The document as compact, HTML-safe JSON.</returns>
    public string ToJson() {
        if (_total.HasValue && _total.Value < Hits.Count) {
            throw new InvalidOperationException("Search total cannot be below the number of returned hits.");
        }
        if (_total.HasValue && Truncated != (_total.Value > Hits.Count)) {
            throw new InvalidOperationException("Search truncation must agree with the known total.");
        }
        var writer = new CanopyJsonWriter(1024);
        writer.BeginObject().Envelope("search").Property("query", Query);
        writer.OptionalProperty("total", _total);
        writer.OptionalProperty("revision", _revision);
        writer.Property("truncated", Truncated);
        writer.Name("hits").BeginArray();
        foreach (var hit in Hits) {
            (hit ?? throw new InvalidOperationException("A search result cannot contain a null hit.")).WriteJson(writer);
        }

        writer.EndArray().EndObject();
        return writer.ToString();
    }
}
