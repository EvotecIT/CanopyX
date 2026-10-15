using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Record ids remain exact text across page projection, selection, exclusion and writer lookup.</summary>
public sealed class IntegerIdentityTests {
    [Fact]
    public async Task IntegerIdentities_RoundTripAcrossSelectionAndWrites() {
        await RoundTrip(new sbyte[] { sbyte.MinValue, sbyte.MaxValue });
        await RoundTrip(new long[] { 9007199254740992, long.MaxValue });
        await RoundTrip(new ulong[] { 9223372036854775808, 9223372036854775809, ulong.MaxValue });
    }

    private static async Task RoundTrip<TKey>(TKey[] keys) {
        var rows = keys.Select((key, i) => new Record<TKey> { Id = key, Value = i }).ToList();
        var view = new CanopyDataGridView("keys", "Keys");
        view.Columns.Add(new CanopyColumn("value", "Value") { Kind = CanopyColumnKind.Number, Editable = true });
        var map = new CanopyColumnMap<Record<TKey>>(view).Key(row => row.Id).Column("value", row => row.Value);
        var provider = new CanopyQueryableProvider<Record<TKey>>(rows.AsQueryable(), map);
        var query = new CanopyDataRequest(map.Schema);
        var ids = (await provider.QueryAsync(query, default)).Rows.Select(row => row.Id).ToArray();
        Assert.Equal(keys.Select(key => Convert.ToString(key, System.Globalization.CultureInfo.InvariantCulture)), ids);
        Assert.Equal(keys.Length, ids.Distinct(StringComparer.Ordinal).Count());
        var writer = new CanopyQueryableWriter<Record<TKey>>(map, new Store<TKey>(rows));
        foreach (var id in ids) {
            Assert.Equal(id, Assert.Single((await provider.QueryAsync(query.WithIdentities(new[] { id }, null), default)).Rows).Id);
            Assert.DoesNotContain((await provider.QueryAsync(query.WithIdentities(null, new[] { id }), default)).Rows, row => row.Id == id);
            var batch = CanopyRequestParser.ParseCommit("{\"view\":\"keys\",\"revision\":\"live\",\"rows\":[{\"id\":\"" + id + "\",\"values\":{\"value\":42},\"original\":{\"value\":" + Array.IndexOf(ids, id) + "}}]}", map.Schema);
            Assert.Equal(CanopyCommitStatus.Saved, Assert.Single((await writer.CommitAsync(batch, "live", default)).Rows).Status);
        }
        Assert.All(rows, row => Assert.Equal(42, row.Value));
    }

    private sealed class Record<TKey> {
        public TKey Id { get; set; } = default!;
        public int Value { get; set; }
    }
    private sealed class Store<TKey> : ICanopyWriteStore<Record<TKey>> {
        private readonly List<Record<TKey>> _rows;
        public Store(List<Record<TKey>> rows) { _rows = rows; }
        public IQueryable<Record<TKey>> Records => _rows.AsQueryable();
        public ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken cancellationToken) => new ValueTask<ICanopyWriteTransaction>(new Transaction());
        public ValueTask SaveChangesAsync(CancellationToken cancellationToken) => default;
        public void DiscardChanges() { }
    }
    private sealed class Transaction : ICanopyWriteTransaction {
        public ValueTask CommitAsync(CancellationToken cancellationToken) => default;
        public ValueTask RollbackAsync(CancellationToken cancellationToken) => default;
        public ValueTask DisposeAsync() => default;
    }
}
