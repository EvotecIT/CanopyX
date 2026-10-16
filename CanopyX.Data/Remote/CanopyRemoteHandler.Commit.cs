using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

public sealed partial class CanopyRemoteHandler {
    private const int MaxMessageLength = 4096;

    /// <summary>Answers a <c>gridCommit</c> document with a <c>gridCommitResult</c> document.</summary>
    /// <param name="json">The request body.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The commit result document.</returns>
    /// <exception cref="CanopyRequestException">The endpoint has no writer, or the document is malformed, too large, or changes a
    /// column that is not allowed or not editable.</exception>
    public Task<string> CommitAsync(string json, CancellationToken cancellationToken = default) {
        if (Writer == null) throw new CanopyRequestException(CanopyRequestError.Unsupported, "This endpoint does not save changes.");
        return CommitAsync(CanopyRequestParser.ParseCommit(json, Schema, Options.Limits), cancellationToken);
    }

    /// <summary>Checks a commit batch, hands its valid rows to the writer and answers with a <c>gridCommitResult</c> document.</summary>
    /// <param name="batch">The batch.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The commit result document: rows that failed the server's checks as errors with messages by column, then the
    /// writer's answer for the others, in the batch's order, with the dataset revision after the commit.</returns>
    /// <remarks>
    /// Every value is checked against its column's kind, the view's <see cref="CanopyCellValidation"/> and its editor (step,
    /// choices, toggles) with <see cref="CanopyRemoteOptions.CommitMessages"/>, and an insert also for the required columns it leaves
    /// out; only rows that pass reach the writer. A saved insert's <see cref="CanopyCommitRowResult.NewId"/> is answered as
    /// <c>newId</c> when it is a well-formed identity. Once the
    /// writer has answered, rows may already be committed, so its answer never turns into a failure of the request: rows it was
    /// not asked about or answered twice, cells that break the page rules or belong to other columns, messages for other
    /// columns, and an invalid revision are left out (and reported to <see cref="CanopyRemoteOptions.WriterProblem"/>),
    /// and overlong messages are shortened.
    /// </remarks>
    public async Task<string> CommitAsync(CanopyCommitBatch batch, CancellationToken cancellationToken = default) {
        if (batch == null) throw new ArgumentNullException(nameof(batch));
        if (!ReferenceEquals(batch.Schema, Schema)) throw new ArgumentException("The batch belongs to another schema.", nameof(batch));
        var writer = Writer ?? throw new CanopyRequestException(CanopyRequestError.Unsupported, "This endpoint does not save changes.");
        if (batch.Rows.Count > Options.Limits.MaxCommitRows) throw CanopyRequestException.Limit("The commit has more rows than this endpoint accepts.");
        var revision = await RevisionAsync(null, cancellationToken).ConfigureAwait(false);
        var answers = new Dictionary<string, CanopyCommitRowResult>(StringComparer.Ordinal);
        var valid = new List<CanopyCommitRow>();
        foreach (var row in batch.Rows) {
            var errors = new Dictionary<string, string>(StringComparer.Ordinal);
            var typed = CommitValidation.Check(Schema, row, Options.CommitMessages, errors);
            if (typed == null) answers[row.Id] = CanopyCommitRowResult.Failed(row.Id, null, errors);
            else valid.Add(typed);
        }
        string? after = null;
        if (valid.Count != batch.Rows.Count && writer.Transaction == CanopyCommitTransaction.PerBatch) {
            foreach (var row in valid) answers[row.Id] = CanopyCommitRowResult.Failed(row.Id, Options.CommitMessages.BatchNotSaved);
            valid.Clear();
        }
        if (valid.Count > 0) {
            var result = await writer.CommitAsync(new CanopyCommitBatch(Schema, batch.Revision, valid), revision, cancellationToken).ConfigureAwait(false);
            if (result == null) {
                Problem("The data writer returned no result; its rows answer as not saved.");
            } else {
                var asked = new HashSet<string>(StringComparer.Ordinal);
                foreach (var row in valid) asked.Add(row.Id);
                foreach (var row in result.Rows) {
                    if (row == null || !asked.Remove(row.Id)) { Problem("The data writer answered a row it was not asked to save, or a row twice; the answer is left out."); continue; }
                    answers[row.Id] = row;
                }
                after = result.Revision;
                if (after != null && !ValidRevision(after)) { Problem("The data writer returned an invalid revision; the endpoint reads its own."); after = null; }
            }
        }
        if (after == null) {
            try {
                after = await RevisionAsync(null, cancellationToken).ConfigureAwait(false);
            } catch (Exception error) when (!(error is OperationCanceledException) && valid.Count > 0) {
                // The rows may be committed: answer them without a revision (it is optional) rather than failing the request.
                Problem("The revision after the commit could not be read: " + error.GetType().Name);
                after = null;
            }
        }
        using var stream = new MemoryStream();
        using (var json = new Utf8JsonWriter(stream)) {
            json.WriteStartObject();
            json.WriteString("protocol", "canopyx/2");
            json.WriteString("type", "gridCommitResult");
            json.WriteString("view", Schema.ViewId);
            if (after != null) json.WriteString("revision", after);
            json.WriteStartArray("rows");
            foreach (var row in batch.Rows) if (answers.TryGetValue(row.Id, out var answer)) WriteCommitRow(json, answer, row.Operation == CanopyCommitOperation.Insert);
            json.WriteEndArray();
            json.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    private void WriteCommitRow(Utf8JsonWriter json, CanopyCommitRowResult row, bool insert) {
        json.WriteStartObject();
        json.WriteString("id", row.Id);
        json.WriteString("status", row.Status == CanopyCommitStatus.Saved ? "saved" : row.Status == CanopyCommitStatus.Conflict ? "conflict" : "error");
        if (row.NewId != null) {
            // Only a saved insert names its stored identity, and only a well-formed one.
            if (row.Status != CanopyCommitStatus.Saved || !insert) Problem("The data writer gave a new id for a row that is not a saved insert; it is left out.");
            else if (!ValidRevision(row.NewId)) Problem("The data writer gave a new id that is not a valid identity; it is left out.");
            else json.WriteString("newId", row.NewId);
        }
        if (row.Cells.Count > 0) {
            var cells = row.Status == CanopyCommitStatus.Saved ? Cells(row) : null;
            if (row.Status != CanopyCommitStatus.Saved) Problem("The data writer gave cells for a row that was not saved; they are left out.");
            if (cells != null) {
                json.WritePropertyName("cells");
                cells.RootElement.WriteTo(json);
                cells.Dispose();
            }
        }
        if (row.Error != null) json.WriteString("error", Message(row.Error));
        var errors = new List<KeyValuePair<string, string>>();
        foreach (var pair in row.Errors) {
            if (pair.Value == null || !Schema.TryGetColumn(pair.Key, out _)) { Problem("The data writer gave a message for a column that is not allowed; it is left out."); continue; }
            errors.Add(pair);
        }
        if (errors.Count > 0) {
            json.WriteStartObject("errors");
            foreach (var pair in errors) json.WriteString(pair.Key, Message(pair.Value));
            json.WriteEndObject();
        }
        json.WriteEndObject();
    }

    /// <summary>Canonical cells written through the page writer, so they pass exactly the rules page rows pass; null when they do not.</summary>
    private JsonDocument? Cells(CanopyCommitRowResult row) {
        var page = new CanopyGridPage(Schema.ViewId, "commit", 0, 1, 1);
        var grid = new CanopyGridRow(row.Id);
        foreach (var pair in row.Cells) {
            if (!Schema.TryGetColumn(pair.Key, out _)) { Problem("The data writer gave a cell of a column that is not allowed; the row's cells are left out."); return null; }
            grid.Cells[pair.Key] = pair.Value;
        }
        page.Rows.Add(grid);
        string json;
        try {
            json = page.ToJson(Schema.ProtocolView);
        } catch (Exception error) when (!(error is OutOfMemoryException)) {
            Problem("The data writer gave cells that break the page rules; the row's cells are left out.");
            return null;
        }
        using var document = JsonDocument.Parse(json);
        return JsonDocument.Parse(document.RootElement.GetProperty("items")[0].GetProperty("cells").GetRawText());
    }

    /// <summary>A message the reader sees: lone surrogates replaced, at most 4,096 code units, never cut inside a surrogate pair.</summary>
    private static string Message(string text) {
        var builder = new StringBuilder(Math.Min(text.Length, MaxMessageLength));
        for (var i = 0; i < text.Length; i++) {
            var pair = char.IsHighSurrogate(text[i]) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]);
            if (builder.Length + (pair ? 2 : 1) > MaxMessageLength - 1 && text.Length - i > (pair ? 2 : 1)) { builder.Append('…'); break; }
            if (pair) { builder.Append(text[i]).Append(text[i + 1]); i++; }
            else builder.Append(char.IsSurrogate(text[i]) ? '\uFFFD' : text[i]);
        }
        return builder.ToString();
    }

    private static bool ValidRevision(string text) {
        try { CanopyRequestParser.RequireIdentifier(text, "revision"); return true; } catch (CanopyRequestException) { return false; }
    }

    private void Problem(string message) => Options.WriterProblem?.Invoke(message);
}
