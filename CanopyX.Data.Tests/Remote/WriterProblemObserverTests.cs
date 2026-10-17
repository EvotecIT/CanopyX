using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>A diagnostic observer cannot replace the commit result or hide cancellation from the real operations.</summary>
public sealed class WriterProblemObserverTests {
    private const string Request = "{\"protocol\":\"canopyx/2\",\"type\":\"gridCommit\",\"view\":\"fleet\",\"revision\":\"r5\",\"rows\":[{\"id\":\"1\",\"values\":{\"memory\":64},\"original\":{\"memory\":32}}]}";

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ThrowingObserver_PreservesSavedRowsAndSanitizesEveryWriterProblem(bool canceledObserver) {
        var problems = new List<string>();
        var hosts = Fleet.Hosts(3);
        var map = Fleet.Map(Fleet.EditableView());
        var provider = new CanopyQueryableProvider<Host>(hosts.AsQueryable(), map,
            new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r5") });
        var writer = new AnswerWriter(_ => {
            hosts[0].Memory = 64;
            hosts[1].Memory = 64;
            return new CanopyCommitResult(new[] {
                CanopyCommitRowResult.Saved("99"),
                CanopyCommitRowResult.Saved("1", new Dictionary<string, CanopyCell> { ["memory"] = new CanopyCell("not a number") }),
                CanopyCommitRowResult.Saved("1"),
                CanopyCommitRowResult.Saved("2", new Dictionary<string, CanopyCell> { ["secret"] = new CanopyCell("private") }),
                CanopyCommitRowResult.Failed("3", "Try later.", new Dictionary<string, string> { ["secret"] = "private", ["memory"] = "Locked." })
            }, "invalid\uD800revision");
        });
        var options = new CanopyRemoteOptions { WriterProblem = message => {
            problems.Add(message);
            throw canceledObserver ? new OperationCanceledException("observer canceled") : new InvalidOperationException("observer failed");
        } };
        var handler = new CanopyRemoteHandler(map.Schema, provider, options, writer);
        var request = Request.Substring(0, Request.Length - 2) + ",{\"id\":\"2\",\"values\":{\"memory\":64},\"original\":{\"memory\":32}},{\"id\":\"3\",\"values\":{\"memory\":64},\"original\":{\"memory\":32}}]}";

        var json = await handler.CommitAsync(request);

        Assert.Equal("{\"protocol\":\"canopyx/2\",\"type\":\"gridCommitResult\",\"view\":\"fleet\",\"revision\":\"r5\",\"rows\":[{\"id\":\"1\",\"status\":\"saved\"},{\"id\":\"2\",\"status\":\"saved\"},{\"id\":\"3\",\"status\":\"error\",\"error\":\"Try later.\",\"errors\":{\"memory\":\"Locked.\"}}]}", json);
        Assert.Equal(1, writer.Calls);
        Assert.Equal(64, hosts[0].Memory);
        Assert.Equal(64, hosts[1].Memory);
        Assert.Equal(6, problems.Count);
    }

    [Fact]
    public async Task ThrowingObserver_NullWriterResultStillAnswersNoSavedRows() {
        var calls = 0;
        var handler = Handler(new AnswerWriter(_ => null!), _ => {
            calls++;
            throw new InvalidOperationException("logger unavailable");
        });

        using var document = JsonDocument.Parse(await handler.CommitAsync(Request));

        Assert.Equal(1, calls);
        Assert.Equal("r5", document.RootElement.GetProperty("revision").GetString());
        Assert.Equal(0, document.RootElement.GetProperty("rows").GetArrayLength());
    }

    [Fact]
    public async Task ThrowingObserver_FailedPostCommitRevisionStillAnswersSavedWithoutRevision() {
        var revisions = 0;
        var calls = 0;
        var handler = Handler(new AnswerWriter(_ => new CanopyCommitResult(new[] { CanopyCommitRowResult.Saved("1") })), _ => {
            calls++;
            throw new InvalidOperationException("logger unavailable");
        }, _ => ++revisions == 1 ? new ValueTask<string>("r5") : throw new IOException("revision unavailable"));

        using var document = JsonDocument.Parse(await handler.CommitAsync(Request));

        Assert.Equal(2, revisions);
        Assert.Equal(1, calls);
        Assert.False(document.RootElement.TryGetProperty("revision", out _));
        Assert.Equal("saved", document.RootElement.GetProperty("rows")[0].GetProperty("status").GetString());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task WriterFailures_KeepTheirOriginalException(bool canceledWriter) {
        Exception failure = canceledWriter ? new OperationCanceledException("writer canceled") : new IOException("write failed");
        var problems = 0;
        var handler = Handler(new AnswerWriter(_ => throw failure), _ => problems++);

        var actual = await Record.ExceptionAsync(() => handler.CommitAsync(Request));

        Assert.Same(failure, actual);
        Assert.Equal(0, problems);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RequestCancellation_StillPropagatesBeforeAndAfterTheWriter(bool afterWriter) {
        using var cancellation = new CancellationTokenSource();
        var problems = 0;
        var writer = new AnswerWriter(_ => {
            cancellation.Cancel();
            return new CanopyCommitResult(new[] { CanopyCommitRowResult.Saved("1") });
        });
        var handler = Handler(writer, _ => problems++);
        if (!afterWriter) cancellation.Cancel();

        var error = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => handler.CommitAsync(Request, cancellation.Token));

        Assert.Equal(cancellation.Token, error.CancellationToken);
        Assert.Equal(afterWriter ? 1 : 0, writer.Calls);
        Assert.Equal(0, problems);
    }

    [Theory]
    [InlineData(CanopyCommitTransaction.PerRow)]
    [InlineData(CanopyCommitTransaction.PerBatch)]
    public async Task ThrowingWriterLogger_AfterCommitKeepsSavedRowsAndRevisionFallback(CanopyCommitTransaction transaction) {
        var store = new ObserverStore { FailDispose = true };
        var failures = new List<Exception>();
        var revisions = 0;
        var options = new CanopyQueryableWriterOptions<Host> {
            Transaction = transaction,
            Revision = _ => ++revisions == 1 ? new ValueTask<string>("r5") : throw new IOException("revision unavailable"),
            Failed = (_, error) => { failures.Add(error); throw new InvalidOperationException("logger unavailable"); }
        };
        var handler = QueryableHandler(store, options);

        using var document = JsonDocument.Parse(await handler.CommitAsync(Request));

        Assert.Equal("saved", document.RootElement.GetProperty("rows")[0].GetProperty("status").GetString());
        Assert.Equal("r5", document.RootElement.GetProperty("revision").GetString());
        Assert.Equal(64, store.StoredMemory);
        Assert.Equal(1, store.Commits);
        Assert.Equal(0, store.Discards);
        Assert.Equal(1, store.Disposals);
        Assert.Equal(new[] { "dispose unavailable", "revision unavailable" }, failures.Select(error => error.Message));
    }

    [Theory]
    [InlineData(CanopyCommitTransaction.PerRow, false)]
    [InlineData(CanopyCommitTransaction.PerBatch, false)]
    [InlineData(CanopyCommitTransaction.PerRow, true)]
    [InlineData(CanopyCommitTransaction.PerBatch, true)]
    public async Task ThrowingWriterLogger_KeepsFailureResultRollbackAndDisposal(CanopyCommitTransaction transaction, bool failCommit) {
        var store = new ObserverStore { Failure = failCommit ? "commit" : "save", FailRollback = true, FailDispose = true };
        var failures = new List<Exception>();
        var handler = QueryableHandler(store, new CanopyQueryableWriterOptions<Host> {
            Transaction = transaction,
            Failed = (_, error) => { failures.Add(error); throw new OperationCanceledException("logger canceled"); }
        });

        using var document = JsonDocument.Parse(await handler.CommitAsync(Request));

        var row = document.RootElement.GetProperty("rows")[0];
        Assert.Equal("error", row.GetProperty("status").GetString());
        Assert.Equal("The row could not be saved.", row.GetProperty("error").GetString());
        Assert.Equal(32, store.StoredMemory);
        Assert.Equal(32, store.Record.Memory);
        Assert.Equal(1, store.Discards);
        Assert.Equal(1, store.Disposals);
        // The batch commit failure path disposes its transaction without a separate explicit rollback.
        Assert.Equal(failCommit && transaction == CanopyCommitTransaction.PerBatch ? 0 : 1, store.Rollbacks);
        Assert.Equal(failCommit ? "commit unavailable" : "save unavailable", failures[0].Message);
        Assert.Equal("dispose unavailable", failures[failures.Count - 1].Message);
        Assert.Equal(store.Rollbacks + 2, failures.Count);
    }

    [Fact]
    public async Task ThrowingWriterLogger_TransactionStartFailureStillAnswersTheRow() {
        var store = new ObserverStore { Failure = "begin" };
        var logged = 0;
        var handler = QueryableHandler(store, new CanopyQueryableWriterOptions<Host> {
            Failed = (_, _) => { logged++; throw new InvalidOperationException("logger unavailable"); }
        });

        using var document = JsonDocument.Parse(await handler.CommitAsync(Request));

        var row = document.RootElement.GetProperty("rows")[0];
        Assert.Equal("error", row.GetProperty("status").GetString());
        Assert.Equal("The row could not be saved.", row.GetProperty("error").GetString());
        Assert.Equal(1, logged);
        Assert.Equal(32, store.StoredMemory);
        Assert.Equal(0, store.Disposals);
    }

    [Theory]
    [InlineData(CanopyCommitTransaction.PerRow)]
    [InlineData(CanopyCommitTransaction.PerBatch)]
    public async Task ThrowingWriterLogger_DuringDisposeDoesNotReplaceStoreCancellation(CanopyCommitTransaction transaction) {
        using var cancellation = new CancellationTokenSource();
        var original = new OperationCanceledException("store canceled", cancellation.Token);
        var store = new ObserverStore { FailDispose = true, Save = () => { cancellation.Cancel(); throw original; } };
        var logged = 0;
        var handler = QueryableHandler(store, new CanopyQueryableWriterOptions<Host> {
            Transaction = transaction,
            Failed = (_, _) => { logged++; throw new IOException("logger unavailable"); }
        });

        var actual = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => handler.CommitAsync(Request, cancellation.Token));

        Assert.Same(original, actual);
        Assert.Equal(cancellation.Token, actual.CancellationToken);
        Assert.Equal(1, logged);
        Assert.Equal(1, store.Disposals);
        Assert.Equal(1, store.Discards);
        Assert.Equal(32, store.StoredMemory);
    }

    private static CanopyRemoteHandler QueryableHandler(ObserverStore store, CanopyQueryableWriterOptions<Host> options) {
        var map = Fleet.Map(Fleet.EditableView());
        return new CanopyRemoteHandler(map.Schema,
            new CanopyQueryableProvider<Host>(store.Records, map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r5") }),
            null, new CanopyQueryableWriter<Host>(map, store, options));
    }

    private static CanopyRemoteHandler Handler(AnswerWriter writer, Action<string> observer,
        Func<CancellationToken, ValueTask<string>>? revision = null) {
        var map = Fleet.Map(Fleet.EditableView());
        var provider = new CanopyQueryableProvider<Host>(Fleet.Hosts(3).AsQueryable(), map,
            new CanopyQueryOptions { Revision = revision ?? (_ => new ValueTask<string>("r5")) });
        return new CanopyRemoteHandler(map.Schema, provider, new CanopyRemoteOptions { WriterProblem = observer }, writer);
    }

    private sealed class AnswerWriter : ICanopyDataWriter {
        private readonly Func<CanopyCommitBatch, CanopyCommitResult> _answer;
        internal AnswerWriter(Func<CanopyCommitBatch, CanopyCommitResult> answer) { _answer = answer; }
        internal int Calls { get; private set; }
        public CanopyCommitTransaction Transaction => CanopyCommitTransaction.PerRow;
        public ValueTask<CanopyCommitResult> CommitAsync(CanopyCommitBatch batch, string revision, CancellationToken cancellationToken) {
            Calls++;
            return new ValueTask<CanopyCommitResult>(_answer(batch));
        }
    }

    // A store boundary with independently tracked committed values: disposal and rollback faults cannot fake a successful save.
    private sealed class ObserverStore : ICanopyWriteStore<Host> {
        internal Host Record { get; } = new Host { Id = 1, Name = "host-1", Memory = 32 };
        internal double StoredMemory { get; private set; } = 32;
        internal string? Failure { get; set; }
        internal bool FailRollback { get; set; }
        internal bool FailDispose { get; set; }
        internal Action? Save { get; set; }
        internal int Commits { get; private set; }
        internal int Rollbacks { get; private set; }
        internal int Disposals { get; private set; }
        internal int Discards { get; private set; }
        public IQueryable<Host> Records => new[] { Record }.AsQueryable();
        public ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken cancellationToken) {
            if (Failure == "begin") throw new IOException("begin unavailable");
            return new ValueTask<ICanopyWriteTransaction>(new Transaction(this));
        }
        public ValueTask SaveChangesAsync(CancellationToken cancellationToken) {
            Save?.Invoke();
            if (Failure == "save") throw new IOException("save unavailable");
            return default;
        }
        public void DiscardChanges() { Discards++; Record.Memory = StoredMemory; }

        private sealed class Transaction : ICanopyWriteTransaction {
            private readonly ObserverStore _store;
            internal Transaction(ObserverStore store) { _store = store; }
            public ValueTask CommitAsync(CancellationToken cancellationToken) {
                if (_store.Failure == "commit") throw new IOException("commit unavailable");
                _store.Commits++;
                _store.StoredMemory = _store.Record.Memory;
                return default;
            }
            public ValueTask RollbackAsync(CancellationToken cancellationToken) {
                _store.Rollbacks++;
                if (_store.FailRollback) throw new IOException("rollback unavailable");
                return default;
            }
            public ValueTask DisposeAsync() {
                _store.Disposals++;
                if (_store.FailDispose) throw new IOException("dispose unavailable");
                return default;
            }
        }
    }
}
