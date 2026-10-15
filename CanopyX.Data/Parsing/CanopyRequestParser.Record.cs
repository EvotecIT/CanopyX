using System;
using System.Collections.Generic;
using System.Text.Json;

namespace CanopyX.Data;

public static partial class CanopyRequestParser {
    /// <summary>Parses a <c>gridRecordQuery</c> document: one record's details, its row, or one page of one of its collections.</summary>
    /// <param name="json">The document.</param>
    /// <param name="schema">The record allow-list.</param>
    /// <param name="limits">Safety limits; null uses the defaults.</param>
    /// <param name="canRead">Decides whether the caller may read a record field or a column's drawer value; false leaves it
    /// out of the answer, and a page of such a field answers as an unknown field. Null allows every served field.</param>
    /// <returns>The validated request.</returns>
    /// <exception cref="CanopyRequestException">The document is malformed, targets another view, names a field the endpoint
    /// does not serve or the caller may not read (<see cref="CanopyRequestError.UnknownField"/>), pages a field that is not a
    /// collection (<see cref="CanopyRequestError.NotCollection"/>), or exceeds a limit.</exception>
    public static CanopyRecordRequest ParseRecord(string json, CanopyRecordSchema schema, CanopyRemoteLimits? limits = null, Func<string, bool>? canRead = null) {
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        limits ??= new CanopyRemoteLimits();
        using var document = Open(json, limits);
        var root = RequireObject(document.RootElement, "record request");
        Envelope(root, "gridRecordQuery");
        if (RequireString(root, "view") != schema.ViewId) throw CanopyRequestException.Document("The request targets another view.");
        var id = RequireString(root, "id");
        RequireIdentifier(id, "record identity");
        var revision = OptionalString(root, "revision");
        if (revision != null) RequireIdentifier(revision, "revision");
        var row = OptionalBoolean(root, "row") ?? false;
        var fieldId = OptionalString(root, "field");
        var offsetValue = OptionalInteger(root, "offset");
        var limitValue = OptionalInteger(root, "limit");
        if (fieldId == null) {
            if (offsetValue != null || limitValue != null) throw CanopyRequestException.Document("An offset and a limit belong to a collection page, which names its field.");
            var fields = new List<CanopyRecordField>();
            foreach (var field in schema.Fields) if (canRead == null || canRead(field.Id)) fields.Add(field);
            var cells = new List<string>();
            foreach (var column in schema.Cells) if (canRead == null || canRead(column)) cells.Add(column);
            return new CanopyRecordRequest(schema, id, revision, null, 0, 0, row, fields, cells, limits.MaxRecordPageSize, limits.MaxRecordItems);
        }
        // A field the caller may not read answers exactly as one the endpoint does not serve.
        if (!schema.TryGetField(fieldId, out var page) || canRead != null && !canRead(page.Id))
            throw new CanopyRequestException(CanopyRequestError.UnknownField, "The field is not available on this endpoint.");
        if (!page.IsCollection) throw new CanopyRequestException(CanopyRequestError.NotCollection, "Only collection fields page.");
        if (row) throw CanopyRequestException.Document("A collection page does not carry the record's row.");
        var offset = offsetValue ?? 0;
        if (offset < 0) throw CanopyRequestException.Document("The offset must not be negative.");
        var limit = limitValue ?? Math.Min(page.PageSize, limits.MaxRecordPageSize);
        if (limit < 1 || limit > 10000) throw CanopyRequestException.Document("A collection page holds 1 to 10,000 rows.");
        if (limit > limits.MaxRecordPageSize) throw CanopyRequestException.Limit("The collection page is larger than this endpoint allows.");
        return new CanopyRecordRequest(schema, id, revision, page, offset, limit, false, Array.Empty<CanopyRecordField>(), Array.Empty<string>(),
            limits.MaxRecordPageSize, limits.MaxRecordItems);
    }

    /// <summary>Validates a typed record request built in C#, applying the same allow-list and limits as wire requests.</summary>
    /// <param name="query">The typed request.</param>
    /// <param name="schema">The record allow-list.</param>
    /// <param name="limits">Safety limits; null uses the defaults.</param>
    /// <param name="canRead">Decides whether the caller may read a field; null allows every served field.</param>
    /// <returns>The validated request.</returns>
    /// <remarks>The request is written to its wire form with <see cref="CanopyGridRecordQuery.ToJson"/> and parsed back.</remarks>
    public static CanopyRecordRequest FromRecordQuery(CanopyGridRecordQuery query, CanopyRecordSchema schema, CanopyRemoteLimits? limits = null, Func<string, bool>? canRead = null) {
        if (query == null) throw new ArgumentNullException(nameof(query));
        return ParseRecord(query.ToJson(), schema ?? throw new ArgumentNullException(nameof(schema)), limits, canRead);
    }
}
