using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The <c>gridRecordQuery</c> a browser sends when a record's drawer opens and its details load on demand: the record's fields and
/// structured values, the next rows of one of its collection fields, or the record's row itself (a deep link or a related record
/// outside the loaded rows). The answer is a <see cref="CanopyGridRecord"/>.
/// </summary>
/// <remarks>Hosts parse the request with their own JSON reader; this type writes it, for tests, mocks and .NET clients.</remarks>
public sealed class CanopyGridRecordQuery {
    private int _offset;
    private int? _limit;

    /// <summary>Creates a request for a record.</summary>
    /// <param name="view">The grid or tree id.</param>
    /// <param name="id">The record's identity.</param>
    /// <exception cref="ArgumentException">An id is empty.</exception>
    public CanopyGridRecordQuery(string view, string id) {
        CanopyIdentifiers.Require(view, nameof(view));
        CanopyIdentifiers.Require(id, nameof(id));
        View = view;
        Id = id;
    }

    /// <summary>Gets the grid or tree id.</summary>
    public string View { get; }

    /// <summary>Gets the record's identity.</summary>
    public string Id { get; }

    /// <summary>
    /// Gets or sets the accepted dataset revision of a hosted grid or query-aware tree; null for ordinary inline sources.
    /// An answer that includes a revision must match it.
    /// </summary>
    public string? Revision { get; set; }

    /// <summary>Gets or sets the collection field whose next rows the request asks for; null asks for the whole record.</summary>
    public string? Field { get; set; }

    /// <summary>Gets or sets the position of the first collection row asked for.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is negative.</exception>
    public int Offset { get => _offset; set => _offset = value < 0 ? throw new ArgumentOutOfRangeException(nameof(value)) : value; }

    /// <summary>Gets or sets how many collection rows the request asks for, 1 to 10,000.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 1 to 10,000.</exception>
    public int? Limit { get => _limit; set => _limit = value < 1 || value > 10000 ? throw new ArgumentOutOfRangeException(nameof(value)) : value; }

    /// <summary>Gets or sets whether the answer must include the record's row, because the browser has not loaded it.</summary>
    public bool Row { get; set; }

    /// <summary>Writes the HTML-safe <c>gridRecordQuery</c> document.</summary>
    /// <returns>The request.</returns>
    public string ToJson() {
        if (Revision != null) CanopyIdentifiers.Require(Revision, nameof(Revision));
        if (Field != null) CanopyIdentifiers.Require(Field, nameof(Field));
        var writer = new CanopyJsonWriter();
        writer.BeginObject().Envelope("gridRecordQuery").Property("view", View).Property("id", Id).OptionalProperty("revision", Revision).OptionalProperty("field", Field);
        if (Field != null) writer.Property("offset", _offset).OptionalProperty("limit", _limit);
        if (Row) writer.Property("row", true);
        return writer.EndObject().ToString();
    }
}
