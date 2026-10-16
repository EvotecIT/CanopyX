using System;
using System.Collections.Generic;
using System.Text.Json;

namespace CanopyX.Data;

public static partial class CanopyRequestParser {
    /// <summary>Parses a <c>gridCommit</c> document: the changed rows a grid asks the endpoint to save.</summary>
    /// <param name="json">The document.</param>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="limits">Safety limits; null uses the defaults.</param>
    /// <returns>The batch. Its values are the document's JSON scalars (text, numbers, booleans, null; dates as ISO text): the
    /// endpoint checks them against each column's kind and the view's validation before a writer sees them.</returns>
    /// <exception cref="CanopyRequestException">The document is malformed, exceeds a limit, or changes a column that is not
    /// allowed (<see cref="CanopyRequestError.UnknownColumn"/>) or not editable (<see cref="CanopyRequestError.ColumnNotEditable"/>).</exception>
    public static CanopyCommitBatch ParseCommit(string json, CanopyDataSchema schema, CanopyRemoteLimits? limits = null) {
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        limits ??= new CanopyRemoteLimits();
        using var document = Open(json, limits);
        var root = RequireObject(document.RootElement, "commit");
        Envelope(root, "gridCommit");
        var view = OptionalString(root, "view");
        if (view != null && view != schema.ViewId) throw CanopyRequestException.Document("The commit targets another view.");
        var revision = OptionalString(root, "revision");
        if (revision != null) RequireIdentifier(revision, "revision");
        if (!root.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array) throw CanopyRequestException.Document("A commit needs a rows array.");
        var count = rows.GetArrayLength();
        if (count == 0) throw CanopyRequestException.Document("A commit changes at least one row.");
        if (count > limits.MaxCommitRows) throw CanopyRequestException.Limit("The commit has more rows than this endpoint accepts.");
        var list = new List<CanopyCommitRow>(count);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in rows.EnumerateArray()) {
            var row = RequireObject(item, "changed row");
            var id = RequireString(row, "id");
            RequireIdentifier(id, "row identity");
            if (!ids.Add(id)) throw CanopyRequestException.Document("A commit lists each row once.");
            if (!row.TryGetProperty("values", out var values) || values.ValueKind != JsonValueKind.Object) throw CanopyRequestException.Document("A changed row needs its values.");
            if (!row.TryGetProperty("original", out var original) || original.ValueKind != JsonValueKind.Object) throw CanopyRequestException.Document("A changed row needs its original values.");
            var changed = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var property in values.EnumerateObject()) {
                var column = schema.GetColumn(property.Name);
                // The view's editable flag is a presentation contract the server enforces: other columns are never written.
                if (!column.Editable) throw new CanopyRequestException(CanopyRequestError.ColumnNotEditable, "The column cannot be edited on this endpoint.");
                if (changed.ContainsKey(column.Id)) throw CanopyRequestException.Document("A changed row names each column once.");
                changed[column.Id] = Scalar(property.Value, limits);
            }
            if (changed.Count == 0) throw CanopyRequestException.Document("A changed row changes at least one column.");
            var started = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var property in original.EnumerateObject()) {
                if (!changed.ContainsKey(property.Name) || started.ContainsKey(property.Name))
                    throw CanopyRequestException.Document("Original values belong to the changed columns, once each.");
                started[property.Name] = Scalar(property.Value, limits);
            }
            if (started.Count != changed.Count) throw CanopyRequestException.Document("A changed row gives the original value of every changed column.");
            list.Add(new CanopyCommitRow(id, changed, started));
        }
        return new CanopyCommitBatch(schema, revision, list);
    }

    private static object? Scalar(JsonElement value, CanopyRemoteLimits limits) {
        switch (value.ValueKind) {
            case JsonValueKind.Null: return null;
            case JsonValueKind.True: return true;
            case JsonValueKind.False: return false;
            case JsonValueKind.Number:
                if (!TryNumber(value, out var number) || double.IsNaN(number) || double.IsInfinity(number)) throw CanopyRequestException.Operand("A changed number must be finite.");
                return number;
            case JsonValueKind.String:
                var text = value.GetString()!;
                if (text.Length > limits.MaxCommitTextLength) throw CanopyRequestException.Limit("A changed value is too long.");
                return text;
            default:
                throw CanopyRequestException.Operand("A changed value is text, a number, true, false or null.");
        }
    }
}
