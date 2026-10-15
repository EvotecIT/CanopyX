using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

public sealed partial class CanopyRemoteHandler {
    /// <summary>Gets the provider that loads record details, or null for an endpoint without records.</summary>
    public ICanopyRecordProvider? Records { get; }

    /// <summary>Answers a <c>gridRecordQuery</c> document with a <c>gridRecord</c> document, serving every mapped field.</summary>
    /// <param name="json">The request body.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The record document.</returns>
    public Task<string> RecordAsync(string json, CancellationToken cancellationToken = default) => RecordAsync(json, null, cancellationToken);

    /// <summary>Answers a <c>gridRecordQuery</c> document with a <c>gridRecord</c> document.</summary>
    /// <param name="json">The request body.</param>
    /// <param name="canRead">Decides whether the caller may read a record field or a column's drawer value (by identity); false
    /// leaves it out (an empty field). Null serves every mapped field.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The record document.</returns>
    /// <exception cref="CanopyRequestException">The endpoint has no records, the request is invalid, the revision is stale, or
    /// the record is not available (<see cref="CanopyRequestError.RecordNotFound"/>).</exception>
    public Task<string> RecordAsync(string json, Func<string, bool>? canRead, CancellationToken cancellationToken = default) {
        var records = Records ?? throw new CanopyRequestException(CanopyRequestError.Unsupported, "This endpoint does not serve record details.");
        return RecordAsync(CanopyRequestParser.ParseRecord(json, records.Schema, Options.Limits, canRead), cancellationToken);
    }

    /// <summary>Answers a validated record request with a <c>gridRecord</c> document.</summary>
    /// <param name="request">The validated request.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The record document, with the dataset revision.</returns>
    /// <remarks>
    /// The revision is checked before the record is looked up, so a stale request never learns whether a record exists. A record
    /// that is missing, outside the caller's scope, or whose identity cannot be a key answers alike with
    /// <see cref="CanopyRequestError.RecordNotFound"/>. The provider's answer is checked: a field or drawer value that was not
    /// asked for, more collection rows or items than allowed, or a row of another record fails the request as a server error
    /// instead of reaching the caller. An answer larger than <see cref="CanopyRemoteLimits.MaxRecordBytes"/> is refused.
    /// </remarks>
    public async Task<string> RecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken = default) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        var records = Records ?? throw new CanopyRequestException(CanopyRequestError.Unsupported, "This endpoint does not serve record details.");
        if (!ReferenceEquals(request.Schema, records.Schema)) throw new ArgumentException("The request belongs to another record schema.", nameof(request));
        // A request parsed with other limits keeps this endpoint's bounds.
        if (request.Limit > Options.Limits.MaxRecordPageSize || request.CollectionRows > Options.Limits.MaxRecordPageSize || request.MaxItems > Options.Limits.MaxRecordItems)
            throw CanopyRequestException.Limit("The request allows more rows than this endpoint does.");
        var revision = await RevisionAsync(request.Revision, cancellationToken).ConfigureAwait(false);
        var record = await records.GetRecordAsync(request, cancellationToken).ConfigureAwait(false);
        if (record == null) throw new CanopyRequestException(CanopyRequestError.RecordNotFound, "The record is not available.");
        CheckRecord(record, request);
        record.Revision = revision;
        var json = record.ToJson(Schema.View);
        if (Encoding.UTF8.GetByteCount(json) > Options.Limits.MaxRecordBytes) throw CanopyRequestException.Limit("The record is larger than this endpoint answers.");
        return json;
    }

    /// <summary>Fails closed when a provider answers more than the request allows: other fields, other cells, too many rows or items, another row.</summary>
    private static void CheckRecord(CanopyGridRecord record, CanopyRecordRequest request) {
        if (record.Id != request.Id) throw new InvalidOperationException("The record provider answered another record.");
        if (request.Field != null) {
            if (record.Cells.Count != 0 || record.Row != null || record.Fields.Count != 1 || !record.Fields.TryGetValue(request.Field.Id, out var page))
                throw new InvalidOperationException("The record provider answered a collection page with other values than its field.");
            var list = page?.Records ?? throw new InvalidOperationException("The record provider answered a collection page without its rows.");
            if (list.Rows.Count > request.Limit || list.Roots.Count != 0 || list.Total == null || page.Events.Count != 0 || page.Changes.Count != 0)
                throw new InvalidOperationException("The record provider answered a collection page with more rows than asked for, tree roots or no total.");
            return;
        }
        var allowed = new Dictionary<string, CanopyRecordField>(StringComparer.Ordinal);
        foreach (var field in request.Fields) allowed[field.Id] = field;
        foreach (var pair in record.Fields) {
            if (!allowed.TryGetValue(pair.Key, out var field)) throw new InvalidOperationException("The record provider answered a field that was not asked for.");
            var cell = pair.Value;
            if (cell == null) continue;
            if (field.IsCollection) {
                if (cell.Records != null && (cell.Records.Rows.Count > request.FirstRows(field) || cell.Records.Roots.Count != 0) || cell.Events.Count != 0 || cell.Changes.Count != 0)
                    throw new InvalidOperationException("The record provider answered a collection with more rows than allowed, or with other items.");
            } else if (cell.Records != null || cell.Events.Count > request.MaxItems || cell.Changes.Count > request.MaxItems) {
                throw new InvalidOperationException("The record provider answered a value field with a collection or too many items.");
            }
        }
        var cells = new HashSet<string>(request.Cells, StringComparer.Ordinal);
        foreach (var key in record.Cells.Keys) if (!cells.Contains(key)) throw new InvalidOperationException("The record provider answered a drawer value that was not asked for.");
        if (request.Row != (record.Row != null)) throw new InvalidOperationException(request.Row ? "The record provider answered without the record's row." : "The record provider answered a row that was not asked for.");
    }
}
