using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

public sealed partial class CanopyRemoteHandler {
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
    /// choices, toggles) with <see cref="CanopyRemoteOptions.CommitMessages"/>; only rows that pass reach the writer. The
    /// writer's answer is checked too: rows of the batch only, once each, and canonical cells of allowed columns that pass the
    /// page rules, on saved rows only.
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
        if (valid.Count > 0) {
            var result = await writer.CommitAsync(new CanopyCommitBatch(Schema, batch.Revision, valid), revision, cancellationToken).ConfigureAwait(false)
                ?? throw new InvalidOperationException("The data writer returned no result.");
            var asked = new HashSet<string>(StringComparer.Ordinal);
            foreach (var row in valid) asked.Add(row.Id);
            foreach (var row in result.Rows) {
                if (row == null || !asked.Remove(row.Id)) throw new InvalidOperationException("The data writer answered a row it was not asked to save, or a row twice.");
                answers[row.Id] = row;
            }
            after = result.Revision;
        }
        if (after == null) after = await RevisionAsync(null, cancellationToken).ConfigureAwait(false);
        CanopyRequestParser.RequireIdentifier(after, "revision");
        using var stream = new MemoryStream();
        using (var json = new Utf8JsonWriter(stream)) {
            json.WriteStartObject();
            json.WriteString("protocol", "canopyx/2");
            json.WriteString("type", "gridCommitResult");
            json.WriteString("view", Schema.ViewId);
            json.WriteString("revision", after);
            json.WriteStartArray("rows");
            foreach (var row in batch.Rows) if (answers.TryGetValue(row.Id, out var answer)) WriteCommitRow(json, answer);
            json.WriteEndArray();
            json.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    private void WriteCommitRow(Utf8JsonWriter json, CanopyCommitRowResult row) {
        json.WriteStartObject();
        json.WriteString("id", row.Id);
        json.WriteString("status", row.Status == CanopyCommitStatus.Saved ? "saved" : row.Status == CanopyCommitStatus.Conflict ? "conflict" : "error");
        if (row.Cells.Count > 0) {
            if (row.Status != CanopyCommitStatus.Saved) throw new InvalidOperationException("Only saved rows carry canonical cells.");
            json.WritePropertyName("cells");
            WriteCells(json, row);
        }
        if (row.Error != null) json.WriteString("error", Message(row.Error));
        if (row.Errors.Count > 0) {
            json.WriteStartObject("errors");
            foreach (var pair in row.Errors) {
                if (!Schema.TryGetColumn(pair.Key, out _)) throw new InvalidOperationException("Commit messages belong to allowed columns.");
                json.WriteString(pair.Key, Message(pair.Value));
            }
            json.WriteEndObject();
        }
        json.WriteEndObject();
    }

    /// <summary>Writes canonical cells through the page writer, so they pass exactly the rules page rows pass.</summary>
    private void WriteCells(Utf8JsonWriter json, CanopyCommitRowResult row) {
        var page = new CanopyGridPage(Schema.ViewId, "commit", 0, 1, 1);
        var grid = new CanopyGridRow(row.Id);
        foreach (var pair in row.Cells) {
            if (!Schema.TryGetColumn(pair.Key, out _)) throw new InvalidOperationException("Canonical cells belong to allowed columns.");
            grid.Cells[pair.Key] = pair.Value;
        }
        page.Rows.Add(grid);
        using var document = JsonDocument.Parse(page.ToJson(Schema.View));
        document.RootElement.GetProperty("items")[0].GetProperty("cells").WriteTo(json);
    }

    private static string Message(string text) {
        if (text.Length > 4096) throw new InvalidOperationException("Commit messages are at most 4,096 characters.");
        return text;
    }
}
