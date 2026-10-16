using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Inserts in a commit: parsing <c>"op": "insert"</c>, the server's checks of new rows, and the <c>newId</c> of the answer.</summary>
public sealed class InsertCommitTests {
    private static readonly List<Host> Hosts = Fleet.Hosts(20);

    private static (CanopyRemoteHandler Handler, Writer Writer, List<string> Problems) Handler(Func<CanopyCommitBatch, CanopyCommitResult>? answer = null, CanopyRemoteOptions? options = null) {
        var map = Fleet.Map(Fleet.EditableView());
        var writer = new Writer(answer);
        var problems = new List<string>();
        options ??= new CanopyRemoteOptions();
        options.WriterProblem = problems.Add;
        var provider = new CanopyQueryableProvider<Host>(Hosts.AsQueryable(), map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r5") });
        return (new CanopyRemoteHandler(map.Schema, provider, options, writer), writer, problems);
    }

    private static string Commit(string rows) => "{\"protocol\":\"canopyx/2\",\"type\":\"gridCommit\",\"view\":\"fleet\",\"revision\":\"r5\",\"rows\":[" + rows + "]}";

    private static JsonElement[] Rows(string json) => JsonDocument.Parse(json).RootElement.GetProperty("rows").EnumerateArray().ToArray();

    [Fact]
    public async Task Inserts_ReachTheWriterTyped_WithoutOriginals_AndAnswerTheirNewId() {
        var (handler, writer, problems) = Handler(batch => new CanopyCommitResult(batch.Rows.Select(row =>
            row.Operation == CanopyCommitOperation.Insert ? CanopyCommitRowResult.Saved(row.Id, null, "41") : CanopyCommitRowResult.Saved(row.Id, null, "99")), "r6"));
        var json = await handler.CommitAsync(Commit(
            "{\"op\":\"insert\",\"id\":\"new-1\",\"values\":{\"name\":\"host-new\",\"cores\":8,\"lastSeen\":\"2026-10-19T09:00:00+02:00\"}}," +
            "{\"op\":\"update\",\"id\":\"3\",\"values\":{\"cores\":4},\"original\":{\"cores\":2}}"));
        var insert = writer.Batch!.Rows[0];
        Assert.Equal(CanopyCommitOperation.Insert, insert.Operation);
        Assert.Equal("new-1", insert.Id);
        Assert.Empty(insert.Original);
        Assert.Equal(8d, insert.Values["cores"]);
        Assert.Equal(new DateTime(2026, 10, 19, 7, 0, 0, DateTimeKind.Utc), insert.Values["lastSeen"]);
        Assert.Equal(CanopyCommitOperation.Update, writer.Batch.Rows[1].Operation);
        var rows = Rows(json);
        Assert.Equal("41", rows[0].GetProperty("newId").GetString());
        // A new id for an update is not answered.
        Assert.False(rows[1].TryGetProperty("newId", out _));
        Assert.Contains(problems, problem => problem.Contains("not a saved insert"));
    }

    [Fact]
    public async Task Inserts_LeavingOutARequiredColumn_AnswerAnErrorWithoutReachingTheWriter() {
        var (handler, writer, _) = Handler();
        var json = await handler.CommitAsync(Commit("{\"op\":\"insert\",\"id\":\"new-1\",\"values\":{\"cores\":8}},{\"op\":\"insert\",\"id\":\"new-2\",\"values\":{\"name\":\"bad name\"}}"));
        var rows = Rows(json);
        Assert.Equal("error", rows[0].GetProperty("status").GetString());
        Assert.Equal("Name is required.", rows[0].GetProperty("errors").GetProperty("name").GetString());
        Assert.Equal("Name does not have the expected format.", rows[1].GetProperty("errors").GetProperty("name").GetString());
        Assert.Null(writer.Batch);
    }

    [Theory]
    [InlineData("{\"op\":\"insert\",\"id\":\"new-1\",\"values\":{\"name\":\"a\",\"owner\":\"Team A\"}}", CanopyRequestError.ColumnNotEditable)]
    [InlineData("{\"op\":\"insert\",\"id\":\"new-1\",\"values\":{\"name\":\"a\",\"secret\":1}}", CanopyRequestError.UnknownColumn)]
    [InlineData("{\"op\":\"insert\",\"id\":\"new-1\",\"values\":{\"name\":\"a\"},\"original\":{\"name\":null}}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"op\":\"insert\",\"id\":\"new-1\",\"values\":{}}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"op\":\"insert\",\"id\":\"\",\"values\":{\"name\":\"a\"}}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"op\":\"delete\",\"id\":\"1\",\"values\":{\"cores\":4},\"original\":{\"cores\":2}}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"op\":1,\"id\":\"1\",\"values\":{\"cores\":4},\"original\":{\"cores\":2}}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"op\":\"insert\",\"id\":\"new-1\",\"values\":{\"name\":\"a\"}},{\"op\":\"insert\",\"id\":\"new-1\",\"values\":{\"name\":\"b\"}}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"op\":\"insert\",\"id\":\"new-1\",\"values\":{\"name\":\"a\",\"name\":\"b\"}}", CanopyRequestError.InvalidDocument)]
    public async Task MalformedOrForbiddenInserts_AreRejectedWhole(string rows, CanopyRequestError error) {
        var (handler, writer, _) = Handler();
        Assert.Equal(error, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.CommitAsync(Commit(rows)))).Error);
        Assert.Null(writer.Batch);
    }

    [Fact]
    public async Task Inserts_CountTowardsTheBatchLimit() {
        var options = new CanopyRemoteOptions();
        options.Limits.MaxCommitRows = 2;
        var (handler, writer, _) = Handler(options: options);
        var rows = string.Join(",", Enumerable.Range(1, 3).Select(i => "{\"op\":\"insert\",\"id\":\"new-" + i + "\",\"values\":{\"name\":\"h" + i + "\"}}"));
        Assert.Equal(CanopyRequestError.LimitExceeded, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.CommitAsync(Commit(rows)))).Error);
        Assert.Null(writer.Batch);
    }

    [Fact]
    public async Task NewIds_ThatAreNotIdentities_OrOnRowsNotSaved_AreLeftOutAndReported() {
        var (handler, _, problems) = Handler(batch => new CanopyCommitResult(new[] {
            CanopyCommitRowResult.Saved("new-1", null, ""),
            CanopyCommitRowResult.Saved("new-2", null, "bad\uD800"),
            CanopyCommitRowResult.Failed("new-3", "Refused."),
            CanopyCommitRowResult.Saved("new-4", new Dictionary<string, CanopyCell> { ["name"] = "host-4" }, "host-4")
        }));
        var json = await handler.CommitAsync(Commit(string.Join(",", Enumerable.Range(1, 4).Select(i => "{\"op\":\"insert\",\"id\":\"new-" + i + "\",\"values\":{\"name\":\"h" + i + "\"}}"))));
        var rows = Rows(json);
        Assert.False(rows[0].TryGetProperty("newId", out _));
        Assert.False(rows[1].TryGetProperty("newId", out _));
        Assert.False(rows[2].TryGetProperty("newId", out _));
        Assert.Equal("host-4", rows[3].GetProperty("newId").GetString());
        Assert.Equal("host-4", rows[3].GetProperty("cells").GetProperty("name").GetString());
        Assert.Equal(2, problems.Count(problem => problem.Contains("not a valid identity")));
    }

    [Fact]
    public void ParsedInserts_KeepTheirOperation_AndCodeBuiltRowsToo() {
        var map = Fleet.Map(Fleet.EditableView());
        var batch = CanopyRequestParser.ParseCommit(Commit("{\"op\":\"insert\",\"id\":\"new-7\",\"values\":{\"name\":\"x1\",\"online\":true}}"), map.Schema);
        var row = Assert.Single(batch.Rows);
        Assert.Equal(CanopyCommitOperation.Insert, row.Operation);
        Assert.Equal(true, row.Values["online"]);
        var built = CanopyCommitRow.Insert("new-8", new Dictionary<string, object?> { ["name"] = "x" });
        Assert.Equal(CanopyCommitOperation.Insert, built.Operation);
        Assert.Empty(built.Original);
        Assert.Equal(CanopyCommitOperation.Update, new CanopyCommitRow("1", new Dictionary<string, object?> { ["name"] = "x" }, new Dictionary<string, object?> { ["name"] = "y" }).Operation);
        Assert.Throws<ArgumentException>(() => CanopyCommitRow.Insert("new-9", new Dictionary<string, object?>()));
        Assert.Null(CanopyCommitRowResult.Saved("1").NewId);
        Assert.Equal("5", CanopyCommitRowResult.Saved("new-1", null, "5").NewId);
    }

    private sealed class Writer : ICanopyDataWriter {
        private readonly Func<CanopyCommitBatch, CanopyCommitResult>? _answer;
        public Writer(Func<CanopyCommitBatch, CanopyCommitResult>? answer) { _answer = answer; }
        public CanopyCommitTransaction Transaction => CanopyCommitTransaction.PerRow;
        public CanopyCommitBatch? Batch { get; private set; }
        public ValueTask<CanopyCommitResult> CommitAsync(CanopyCommitBatch batch, string revision, CancellationToken cancellationToken) {
            Batch = batch;
            return new ValueTask<CanopyCommitResult>(_answer != null ? _answer(batch) : new CanopyCommitResult(batch.Rows.Select(row => CanopyCommitRowResult.Saved(row.Id)), "r6"));
        }
    }
}
