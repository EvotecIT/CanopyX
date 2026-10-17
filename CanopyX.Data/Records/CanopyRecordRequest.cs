using System;
using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>A validated <c>gridRecordQuery</c>: one record's details, or one page of one of its collections.</summary>
/// <remarks>
/// Create it with <see cref="CanopyRequestParser.ParseRecord(string, CanopyRecordSchema, CanopyRemoteLimits, Func{string, bool})"/>.
/// The identity is text the provider looks up as a key; it is never interpreted as an expression. <see cref="Fields"/> and
/// <see cref="Cells"/> already leave out what the caller may not read, so a provider answers exactly these and nothing else.
/// </remarks>
public sealed class CanopyRecordRequest {
    internal CanopyRecordRequest(CanopyRecordSchema schema, string id, string? revision, CanopyRecordField? field, int offset, int limit, bool row,
        IReadOnlyList<CanopyRecordField> fields, IReadOnlyList<string> cells, int collectionRows, int maxItems, int maxTextLength) {
        Schema = schema; Id = id; Revision = revision; Field = field; Offset = offset; Limit = limit; Row = row;
        Fields = fields; Cells = cells; CollectionRows = collectionRows; MaxItems = maxItems; MaxTextLength = maxTextLength;
    }

    /// <summary>Gets the longest text value the answer carries (<see cref="CanopyRemoteLimits.MaxRecordTextLength"/>); longer
    /// text is shortened so that it ends with an ellipsis and, ellipsis included, fits this length. The endpoint applies it
    /// to every provider's answer. Identities, link keys and the row are never shortened.</summary>
    public int MaxTextLength { get; }

    /// <summary>Gets the record allow-list the request was validated against.</summary>
    public CanopyRecordSchema Schema { get; }

    /// <summary>Gets the record identity: 1 to 4,096 characters of well-formed text, compared with the key's invariant text.</summary>
    public string Id { get; }

    /// <summary>Gets the dataset revision the browser accepted, or null (inline grids send none).</summary>
    public string? Revision { get; }

    /// <summary>Gets the collection whose page is asked for, or null for the whole record.</summary>
    public CanopyRecordField? Field { get; }

    /// <summary>Gets whether the request asks for one page of a collection.</summary>
    public bool IsPage => Field != null;

    /// <summary>Gets the position of the first collection row of a page; zero for a whole record.</summary>
    public int Offset { get; }

    /// <summary>Gets the most rows of a page; zero for a whole record.</summary>
    public int Limit { get; }

    /// <summary>Gets whether the answer must include the record's row (the browser has not loaded it).</summary>
    public bool Row { get; }

    /// <summary>Gets the fields of a whole-record answer the caller may read; empty for a page.</summary>
    public IReadOnlyList<CanopyRecordField> Fields { get; }

    /// <summary>Gets the columns whose fuller drawer values a whole-record answer holds; empty for a page.</summary>
    public IReadOnlyList<string> Cells { get; }

    /// <summary>Gets the most rows of each collection in a whole record (<see cref="CanopyRemoteLimits.MaxRecordPageSize"/>).</summary>
    public int CollectionRows { get; }

    /// <summary>Gets the most timeline events or changes one field holds (<see cref="CanopyRemoteLimits.MaxRecordItems"/>).</summary>
    public int MaxItems { get; }

    /// <summary>Gets the first rows of a collection a whole-record answer holds: its page size, at most <see cref="CollectionRows"/>.</summary>
    /// <param name="field">A collection field.</param>
    /// <returns>The row count.</returns>
    public int FirstRows(CanopyRecordField field) => Math.Min((field ?? throw new ArgumentNullException(nameof(field))).PageSize, CollectionRows);
}
