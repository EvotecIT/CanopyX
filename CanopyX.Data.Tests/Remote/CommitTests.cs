using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>The commit endpoint: parsing, the server's checks, and how a writer's answer becomes a gridCommitResult.</summary>
public sealed class CommitTests {
    private static readonly List<Host> Hosts = Fleet.Hosts(40);

    private static (CanopyRemoteHandler Handler, RecordingWriter Writer) Handler(Func<CanopyCommitBatch, string, CanopyCommitResult>? answer = null, CanopyRemoteOptions? options = null) {
        var map = Fleet.Map(Fleet.EditableView());
        var writer = new RecordingWriter(answer);
        var provider = new CanopyQueryableProvider<Host>(Hosts.AsQueryable(), map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r5") });
        return (new CanopyRemoteHandler(map.Schema, provider, options, writer), writer);
    }

    private static string Commit(string rows, string revision = "\"r5\"") =>
        "{\"protocol\":\"canopyx/2\",\"type\":\"gridCommit\",\"view\":\"fleet\",\"revision\":" + revision + ",\"rows\":[" + rows + "]}";

    private static JsonElement[] Rows(string json) => JsonDocument.Parse(json).RootElement.GetProperty("rows").EnumerateArray().ToArray();

    [Fact]
    public async Task ValidRows_ReachTheWriterTypedAndAnswerSaved() {
        var (handler, writer) = Handler();
        var json = await handler.CommitAsync(Commit(
            "{\"id\":\"3\",\"values\":{\"cores\":16,\"lastSeen\":\"2026-02-01T10:00:00.123456+02:00\",\"online\":false,\"site\":\"Oslo\"},\"original\":{\"cores\":8,\"lastSeen\":null,\"online\":true,\"site\":null}}," +
            "{\"id\":\"7\",\"values\":{\"notes\":\"\"},\"original\":{\"notes\":\"plain\"}}"));
        var root = JsonDocument.Parse(json).RootElement;
        Assert.Equal("gridCommitResult", root.GetProperty("type").GetString());
        Assert.Equal("fleet", root.GetProperty("view").GetString());
        Assert.Equal("r6", root.GetProperty("revision").GetString());
        Assert.Equal(new[] { "saved", "saved" }, Rows(json).Select(row => row.GetProperty("status").GetString()));
        Assert.Equal(2, writer.Batch!.Rows.Count);
        var row = writer.Batch.Rows[0];
        Assert.Equal(16d, Assert.IsType<double>(row.Values["cores"]));
        Assert.Equal(new DateTime(2026, 2, 1, 8, 0, 0, 123, DateTimeKind.Utc), Assert.IsType<DateTime>(row.Values["lastSeen"]));
        Assert.False(Assert.IsType<bool>(row.Values["online"]));
        Assert.Equal(8d, row.Original["cores"]);
        Assert.Equal("r5", writer.Revision);
        Assert.Equal("r5", writer.Batch.Revision);
        // An empty value passes every check but required, as in the browser; emptied text stays the empty string.
        Assert.Equal("", writer.Batch.Rows[1].Values["notes"]);
    }

    [Theory]
    [InlineData("{\"name\":null}", "name", "Name is required.")]
    [InlineData("{\"name\":\"\"}", "name", "Name is required.")]
    [InlineData("{\"name\":\"host-0000000001\"}", "name", "Name allows at most 12 characters.")]
    [InlineData("{\"name\":\"bad name\"}", "name", "Name does not have the expected format.")]
    [InlineData("{\"name\":\"host\\n\"}", "name", "Name does not have the expected format.")]
    [InlineData("{\"cores\":0}", "cores", "Cores must be at least 1.")]
    [InlineData("{\"cores\":1024}", "cores", "Cores must be at most 512.")]
    [InlineData("{\"cores\":2.5}", "cores", "Cores must be a multiple of 1.")]
    [InlineData("{\"cores\":\"8\"}", "cores", "Cores must be a number.")]
    [InlineData("{\"memory\":-1}", "memory", "Memory (GB) must be at least 0.")]
    [InlineData("{\"lastSeen\":\"yesterday\"}", "lastSeen", "Last seen must be a valid date.")]
    [InlineData("{\"lastSeen\":\"2026-01-01T00:00:00\"}", "lastSeen", "Last seen must be a valid date.")]
    [InlineData("{\"lastSeen\":\"2019-12-31T23:59:59Z\"}", "lastSeen", "Last seen must be at least 2020-01-01T00:00:00Z.")]
    [InlineData("{\"site\":\"Paris\"}", "site", "Choose Site from the list.")]
    [InlineData("{\"online\":\"yes\"}", "online", "Online has a value of the wrong type.")]
    [InlineData("{\"notes\":\"x\"}", "notes", "Notes take 2 to 64 characters.")]
    public async Task InvalidValues_AnswerCellErrorsWithoutReachingTheWriter(string values, string column, string message) {
        var (handler, writer) = Handler();
        var original = values.Substring(0, values.IndexOf(':') + 1) + "null}";
        var json = await handler.CommitAsync(Commit("{\"id\":\"1\",\"values\":" + values + ",\"original\":" + original + "}," +
            "{\"id\":\"2\",\"values\":{\"memory\":64},\"original\":{\"memory\":32}}"));
        var rows = Rows(json);
        Assert.Equal("error", rows[0].GetProperty("status").GetString());
        Assert.Equal(message, rows[0].GetProperty("errors").GetProperty(column).GetString());
        Assert.Equal("saved", rows[1].GetProperty("status").GetString());
        Assert.Equal(new[] { "2" }, writer.Batch!.Rows.Select(row => row.Id));
    }

    [Fact]
    public async Task OnlyInvalidRows_DoNotCallTheWriter_AndAnswerTheCurrentRevision() {
        var (handler, writer) = Handler();
        var json = await handler.CommitAsync(Commit("{\"id\":\"1\",\"values\":{\"cores\":0},\"original\":{\"cores\":4}}"));
        Assert.Null(writer.Batch);
        Assert.Equal("r5", JsonDocument.Parse(json).RootElement.GetProperty("revision").GetString());
    }

    [Theory]
    [InlineData("{\"id\":\"1\",\"values\":{\"owner\":\"Team A\"},\"original\":{\"owner\":null}}", CanopyRequestError.ColumnNotEditable)]
    [InlineData("{\"id\":\"1\",\"values\":{\"secret\":1},\"original\":{\"secret\":null}}", CanopyRequestError.UnknownColumn)]
    [InlineData("{\"id\":\"1\",\"values\":{},\"original\":{}}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"id\":\"1\",\"values\":{\"cores\":4}}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"id\":\"1\",\"values\":{\"cores\":4},\"original\":{}}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"id\":\"1\",\"values\":{\"cores\":4},\"original\":{\"cores\":1,\"memory\":2}}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"id\":\"1\",\"values\":{\"cores\":[4]},\"original\":{\"cores\":1}}", CanopyRequestError.InvalidOperand)]
    [InlineData("{\"id\":\"\",\"values\":{\"cores\":4},\"original\":{\"cores\":1}}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"id\":\"1\",\"values\":{\"cores\":4},\"original\":{\"cores\":1}},{\"id\":\"1\",\"values\":{\"cores\":5},\"original\":{\"cores\":1}}", CanopyRequestError.InvalidDocument)]
    public async Task MalformedOrForbiddenBatches_AreRejectedWhole(string rows, CanopyRequestError error) {
        var (handler, writer) = Handler();
        var rejection = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.CommitAsync(Commit(rows)));
        Assert.Equal(error, rejection.Error);
        Assert.Null(writer.Batch);
    }

    [Theory]
    [InlineData("{\"type\":\"gridQuery\",\"rows\":[]}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"other\",\"rows\":[{\"id\":\"1\",\"values\":{\"cores\":4},\"original\":{\"cores\":1}}]}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"revision\":\"r5\",\"rows\":[]}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"revision\":\"r5\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"revision\":5,\"rows\":[]}", CanopyRequestError.InvalidJson)]
    public async Task MalformedEnvelopes_AreRejected(string json, CanopyRequestError error) {
        var (handler, _) = Handler();
        Assert.Equal(error, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.CommitAsync(json))).Error);
    }

    [Fact]
    public async Task LargeBatches_AreRejectedBeforeAnyRowIsWritten() {
        var options = new CanopyRemoteOptions();
        options.Limits.MaxCommitRows = 2;
        var (handler, writer) = Handler(options: options);
        var rows = string.Join(",", Enumerable.Range(1, 3).Select(i => "{\"id\":\"" + i + "\",\"values\":{\"cores\":4},\"original\":{\"cores\":2}}"));
        Assert.Equal(CanopyRequestError.LimitExceeded, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.CommitAsync(Commit(rows)))).Error);
        Assert.Null(writer.Batch);
    }

    [Fact]
    public async Task ReadOnlyEndpoints_DoNotSaveChanges() {
        var map = Fleet.Map(Fleet.EditableView());
        var handler = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Host>(Hosts.AsQueryable(), map));
        Assert.Equal(CanopyRequestError.Unsupported, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.CommitAsync(Commit("{\"id\":\"1\",\"values\":{\"cores\":4},\"original\":{\"cores\":2}}")))).Error);
    }

    [Fact]
    public async Task WriterAnswers_AreWrittenInBatchOrderWithCanonicalCells() {
        var (handler, _) = Handler((batch, _) => new CanopyCommitResult(new[] {
            CanopyCommitRowResult.Conflict("2"),
            CanopyCommitRowResult.Saved("1", new Dictionary<string, CanopyCell> { ["memory"] = new CanopyCell(64.5) { Text = "64.5 GB" } }),
            CanopyCommitRowResult.Failed("4", "Locked by maintenance.", new Dictionary<string, string> { ["memory"] = "Memory is managed elsewhere." })
        }, "r9"));
        var rows = string.Join(",", new[] { 1, 2, 3, 4 }.Select(i => "{\"id\":\"" + i + "\",\"values\":{\"memory\":64.5},\"original\":{\"memory\":32}}"));
        var json = await handler.CommitAsync(Commit(rows));
        var answers = Rows(json);
        Assert.Equal(new[] { "1", "2", "4" }, answers.Select(row => row.GetProperty("id").GetString()));
        Assert.Equal("{\"value\":64.5,\"text\":\"64.5 GB\"}", answers[0].GetProperty("cells").GetProperty("memory").GetRawText());
        Assert.Equal("conflict", answers[1].GetProperty("status").GetString());
        Assert.False(answers[1].TryGetProperty("cells", out _));
        Assert.Equal("Locked by maintenance.", answers[2].GetProperty("error").GetString());
        Assert.Equal("r9", JsonDocument.Parse(json).RootElement.GetProperty("revision").GetString());
    }

    [Fact]
    public async Task WriterAnswers_ThatDoNotFitTheBatch_AreLeftOutAndReported_NeverFailingTheRequest() {
        var problems = new List<string>();
        var options = new CanopyRemoteOptions { WriterProblem = problems.Add };
        var lone = "Bad \uD800 surrogate " + new string('x', 5000);
        var (handler, _) = Handler((_, _) => new CanopyCommitResult(new[] {
            CanopyCommitRowResult.Saved("99"),
            CanopyCommitRowResult.Saved("1", new Dictionary<string, CanopyCell> { ["memory"] = new CanopyCell("lots") }),
            CanopyCommitRowResult.Saved("1"),
            CanopyCommitRowResult.Saved("2", new Dictionary<string, CanopyCell> { ["password"] = new CanopyCell("x") }),
            CanopyCommitRowResult.Failed("3", lone, new Dictionary<string, string> { ["password"] = "no", ["memory"] = "Too much." })
        }, "bad\uD800revision"), options);
        var rows = string.Join(",", new[] { 1, 2, 3, 4 }.Select(i => "{\"id\":\"" + i + "\",\"values\":{\"memory\":1},\"original\":{\"memory\":2}}"));
        var json = await handler.CommitAsync(Commit(rows));
        var root = JsonDocument.Parse(json).RootElement;
        Assert.Equal("r5", root.GetProperty("revision").GetString());
        var answers = Rows(json);
        Assert.Equal(new[] { "1", "2", "3" }, answers.Select(row => row.GetProperty("id").GetString()));
        Assert.Equal("saved", answers[0].GetProperty("status").GetString());
        Assert.False(answers[0].TryGetProperty("cells", out _));
        Assert.False(answers[1].TryGetProperty("cells", out _));
        var error = answers[2].GetProperty("error").GetString()!;
        Assert.Equal(4096, error.Length);
        Assert.DoesNotContain('\uD800', error);
        Assert.EndsWith("…", error);
        Assert.Equal("{\"memory\":\"Too much.\"}", answers[2].GetProperty("errors").GetRawText());
        Assert.True(problems.Count >= 5, string.Join(" | ", problems));
        var empty = Handler((_, _) => null!).Handler;
        var none = JsonDocument.Parse(await empty.CommitAsync(Commit("{\"id\":\"1\",\"values\":{\"memory\":1},\"original\":{\"memory\":2}}"))).RootElement;
        Assert.Equal(0, none.GetProperty("rows").GetArrayLength());
    }

    [Theory]
    [InlineData("{\"site\":null}")]
    [InlineData("{\"site\":\"\"}")]
    public async Task EmptyValues_StillChooseFromASelectsChoices(string values) {
        var (handler, writer) = Handler();
        var json = await handler.CommitAsync(Commit("{\"id\":\"1\",\"values\":" + values + ",\"original\":{\"site\":\"Oslo\"}}"));
        Assert.Equal("Choose Site from the list.", Rows(json)[0].GetProperty("errors").GetProperty("site").GetString());
        Assert.Null(writer.Batch);
    }

    [Fact]
    public void Schemas_RejectPatternsTheServerCannotCheck() {
        var view = Fleet.EditableView();
        view.Columns.First(column => column.Id == "notes").Validation!.Pattern = "(unclosed";
        Assert.ThrowsAny<Exception>(() => Fleet.Map(view).Schema);
    }
    [Fact]
    public async Task Messages_CanBeReplaced() {
        var options = new CanopyRemoteOptions();
        options.CommitMessages.Minimum = "{column}: mindestens {min}.";
        var (handler, _) = Handler(options: options);
        var json = await handler.CommitAsync(Commit("{\"id\":\"1\",\"values\":{\"cores\":0},\"original\":{\"cores\":4}}"));
        Assert.Equal("Cores: mindestens 1.", Rows(json)[0].GetProperty("errors").GetProperty("cores").GetString());
    }

    /// <summary>Saves every row it is given and answers with the next revision, unless a test supplies the answer.</summary>
    private sealed class RecordingWriter : ICanopyDataWriter {
        private readonly Func<CanopyCommitBatch, string, CanopyCommitResult>? _answer;
        public RecordingWriter(Func<CanopyCommitBatch, string, CanopyCommitResult>? answer) { _answer = answer; }
        public CanopyCommitBatch? Batch { get; private set; }
        public string? Revision { get; private set; }
        public ValueTask<CanopyCommitResult> CommitAsync(CanopyCommitBatch batch, string revision, CancellationToken cancellationToken) {
            Batch = batch;
            Revision = revision;
            return new ValueTask<CanopyCommitResult>(_answer != null ? _answer(batch, revision) : new CanopyCommitResult(batch.Rows.Select(row => CanopyCommitRowResult.Saved(row.Id)), "r6"));
        }
    }
}
