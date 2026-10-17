using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Record reads keep the handler's revision and cancellation ownership across the provider's asynchronous work.</summary>
public sealed class RecordLifetimeTests {
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CanceledProviderRequests_DoNotInvokeTheirSourceFactory(bool queryable) {
        var calls = 0;
        var map = Assets.Records(Assets.Columns(Assets.View()));
        ICanopyRecordProvider provider = queryable
            ? new CanopyQueryableRecordProvider<Asset>(() => { calls++; return Array.Empty<Asset>().AsQueryable(); }, map)
            : new CanopyInMemoryRecordProvider<Asset>(map, () => { calls++; return Array.Empty<Asset>(); });
        var request = CanopyRequestParser.ParseRecord(Assets.Query("1"), map.Schema);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => provider.GetRecordAsync(request, cancellation.Token).AsTask());
        Assert.Equal(0, calls);
    }

    [Theory]
    [InlineData("lookup", false)]
    [InlineData("lookup", true)]
    [InlineData("count", false)]
    [InlineData("count", true)]
    [InlineData("window", false)]
    [InlineData("window", true)]
    public async Task QueryableProvider_ObservesCancellationAfterEachAwaitedRead(string stage, bool page) {
        var asset = new Asset { Id = 1, Name = "one", Parts = { new AssetPart { Id = 1, Name = "part" } } };
        var map = Assets.Records(Assets.Columns(Assets.View()));
        using var cancellation = new CancellationTokenSource();
        var executor = new CancelingExecutor(stage, cancellation);
        var provider = new CanopyQueryableRecordProvider<Asset>(new[] { asset }.AsQueryable(), map, new CanopyQueryOptions { Executor = executor });
        var request = CanopyRequestParser.ParseRecord(Assets.Query("1", page ? ",\"field\":\"parts\"" : ""), map.Schema);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => provider.GetRecordAsync(request, cancellation.Token).AsTask());
        Assert.Equal(stage, executor.CanceledAt);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RevisionChangedDuringTheRead_RejectsWholeRecordsAndCollectionPages(bool page) {
        var revision = "r1";
        var map = Assets.Records(Assets.Columns(Assets.View()));
        var provider = new Pending(map.Schema);
        var data = new CanopyQueryableProvider<Asset>(Array.Empty<Asset>().AsQueryable(), map.Columns,
            new CanopyQueryOptions { Revision = _ => new ValueTask<string>(revision) });
        var handler = new CanopyRemoteHandler(map.Columns.Schema, data, null, null, provider);
        var pending = handler.RecordAsync(Assets.Query("1", page ? ",\"field\":\"parts\",\"revision\":\"r1\"" : ",\"revision\":\"r1\""));
        await provider.Started.Task;
        revision = "r2";
        provider.Answer.SetResult(Answer(page));
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => pending);
        Assert.Equal(CanopyRequestError.StaleRevision, error.Error);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CancellationDuringTheRead_IsObservedBeforeUsingTheProviderAnswer(bool missing) {
        var map = Assets.Records(Assets.Columns(Assets.View()));
        var provider = new Pending(map.Schema);
        var handler = Assets.Handler(map, provider);
        using var cancellation = new CancellationTokenSource();
        var pending = handler.RecordAsync(Assets.Query("1"), cancellation.Token);
        await provider.Started.Task;
        cancellation.Cancel();
        provider.Answer.SetResult(missing ? null : Answer(false));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending);
    }

    private static CanopyGridRecord Answer(bool page) {
        var record = new CanopyGridRecord("1");
        if (page) {
            var list = new CanopyRecordList { Total = 0 };
            list.Columns.Add(new CanopyColumn("name", "Name"));
            record.Fields["parts"] = CanopyCell.Collection(list);
        } else record.Fields["notes"] = "one";
        return record;
    }

    private sealed class Pending : ICanopyRecordProvider {
        internal Pending(CanopyRecordSchema schema) { Schema = schema; }
        public CanopyRecordSchema Schema { get; }
        internal TaskCompletionSource<bool> Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal TaskCompletionSource<CanopyGridRecord?> Answer { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public ValueTask<CanopyGridRecord?> GetRecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken) {
            Started.SetResult(true);
            return new ValueTask<CanopyGridRecord?>(Answer.Task);
        }
    }

    /// <summary>An external query executor can complete just as cancellation arrives, without throwing itself.</summary>
    private sealed class CancelingExecutor : CanopyQueryExecutor {
        private readonly string _stage;
        private readonly CancellationTokenSource _cancellation;
        private int _lists;
        internal CancelingExecutor(string stage, CancellationTokenSource cancellation) { _stage = stage; _cancellation = cancellation; }
        internal string? CanceledAt { get; private set; }
        public override async Task<int> CountAsync<TSource>(IQueryable<TSource> query, CancellationToken cancellationToken) {
            var result = query.Count();
            await Task.Yield();
            Cancel("count");
            return result;
        }
        public override async Task<List<TSource>> ToListAsync<TSource>(IQueryable<TSource> query, CancellationToken cancellationToken) {
            var result = query.ToList();
            await Task.Yield();
            Cancel(++_lists == 1 ? "lookup" : "window");
            return result;
        }
        private void Cancel(string stage) {
            if (_stage != stage) return;
            CanceledAt = stage;
            _cancellation.Cancel();
        }
    }
}
