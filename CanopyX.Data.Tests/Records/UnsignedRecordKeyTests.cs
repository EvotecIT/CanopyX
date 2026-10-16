using System.Globalization;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Record lookups use the same exact unsigned identity text as grid rows, including values above Int64.MaxValue.</summary>
public sealed class UnsignedRecordKeyTests {
    private const ulong High = 9223372036854775808UL;

    [Theory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task UnsignedRootKeys_RoundTripBetweenGridRowsAndRecordLookups(bool queryable, bool nullable) {
        var keys = new ulong[] { 0, 1, 9007199254740991UL, 9007199254740992UL, (ulong)long.MaxValue, High, High + 1, ulong.MaxValue };
        var rows = keys.Select((key, i) => new UnsignedRecord { Id = key, NullableId = key, Name = "row-" + i, Note = "note-" + i }).ToList();
        var columns = Columns(nullable);
        var map = new CanopyRecordMap<UnsignedRecord>(columns).Field("notes", row => row.Note);
        var grid = new CanopyQueryableProvider<UnsignedRecord>(rows.AsQueryable(), columns);
        var page = await grid.QueryAsync(new CanopyDataRequest(columns.Schema), default);
        Assert.Equal(keys.Select(Text).OrderBy(id => id, StringComparer.Ordinal), page.Rows.Select(row => row.Id).OrderBy(id => id, StringComparer.Ordinal));
        var source = rows.ToList();
        if (nullable) source.Add(new UnsignedRecord { Id = 42, NullableId = null, Name = "without-key" });
        var provider = Provider(map, source, queryable);
        var handler = Handler(map, provider);
        foreach (var row in rows) {
            using var record = JsonDocument.Parse(await handler.RecordAsync(Assets.Query(Text(row.Id), ",\"row\":true")));
            Assert.Equal(Text(row.Id), record.RootElement.GetProperty("id").GetString());
            Assert.Equal(Text(row.Id), record.RootElement.GetProperty("row").GetProperty("id").GetString());
            Assert.Equal(row.Note, record.RootElement.GetProperty("fields").GetProperty("notes").GetString());
        }
        if (nullable) Assert.Equal(CanopyRequestError.RecordNotFound, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RecordAsync(Assets.Query("42")))).Error);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task UnsignedRootKeys_RejectNoncanonicalAndOutOfRangeTextBeforeReadingRecords(bool queryable) {
        var map = new CanopyRecordMap<UnsignedRecord>(Columns(true)).Field("notes", row => row.Note);
        var rows = new[] { new UnsignedRecord { Id = 0, NullableId = 0, Name = "zero", Note = "note" } };
        var executor = new CountingExecutor();
        var enumerations = 0;
        ICanopyRecordProvider provider = queryable
            ? new CanopyQueryableRecordProvider<UnsignedRecord>(rows.AsQueryable(), map, new CanopyQueryOptions { Executor = executor })
            : new CanopyInMemoryRecordProvider<UnsignedRecord>(map, () => { enumerations++; return rows; });
        var handler = Handler(map, provider);
        foreach (var id in new[] { "-1", "-0", "+0", "00", "01", "1.0", "1e0", "18446744073709551616", "184467440737095516150", " 1", "1 ", "١" }) {
            var error = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RecordAsync(Assets.Query(id)));
            Assert.Equal(CanopyRequestError.RecordNotFound, error.Error);
        }
        Assert.Equal(0, executor.Reads);
        Assert.Equal(0, enumerations);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task UnsignedRelatedKeys_KeepExactDefaultScopeAndCollectionPages(bool queryable) {
        var root = new UnsignedRecord { Id = High, NullableId = High, Name = "root", Replaces = High + 1 };
        var peer = new UnsignedRecord { Id = High + 1, NullableId = High + 1, Name = "peer" };
        var hidden = new UnsignedRecord { Id = ulong.MaxValue, NullableId = ulong.MaxValue, Name = "hidden" };
        root.Peers.AddRange(new[] { hidden, peer, root });
        var map = new CanopyRecordMap<UnsignedRecord>(Columns(true))
            .Link("replaces", row => row.Replaces, row => row.Name)
            .Collection("peers", row => row.Peers, list => list.Key(row => row.NullableId).Column(new CanopyColumn("name", "Name"), row => row.Name).PageSize(1));
        var handler = Handler(map, Provider(map, new[] { root, peer }, queryable));
        using (var whole = JsonDocument.Parse(await handler.RecordAsync(Assets.Query(Text(High))))) {
            var fields = whole.RootElement.GetProperty("fields");
            Assert.Equal(Text(High + 1), fields.GetProperty("replaces").GetProperty("ref").GetProperty("id").GetString());
            var list = fields.GetProperty("peers").GetProperty("records");
            Assert.Equal(2, list.GetProperty("total").GetInt32());
            Assert.Equal(Text(High), Assert.Single(list.GetProperty("rows").EnumerateArray()).GetProperty("id").GetString());
        }
        using (var page = JsonDocument.Parse(await handler.RecordAsync(Assets.Query(Text(High), ",\"field\":\"peers\",\"offset\":1,\"limit\":1")))) {
            var list = page.RootElement.GetProperty("fields").GetProperty("peers").GetProperty("records");
            Assert.Equal(Text(High + 1), Assert.Single(list.GetProperty("rows").EnumerateArray()).GetProperty("id").GetString());
            Assert.Equal(2, list.GetProperty("total").GetInt32());
        }
        root.Replaces = hidden.Id;
        using var outside = JsonDocument.Parse(await handler.RecordAsync(Assets.Query(Text(High))));
        Assert.False(outside.RootElement.GetProperty("fields").TryGetProperty("replaces", out _));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task UnsignedChildKeys_WorkForLinksCollectionsTimelinesAndChanges(bool queryable) {
        var children = new[] {
            new UnsignedRecord { Id = ulong.MaxValue, Name = "max" }, new UnsignedRecord { Id = High + 1, Name = "upper" }, new UnsignedRecord { Id = High, Name = "lower" }
        };
        var parent = new Parent { Id = 1, Name = "parent", Target = ulong.MaxValue, Children = children.ToList() };
        var columns = new CanopyColumnMap<Parent>(Assets.View()).Key(row => row.Id).Column("name", row => row.Name);
        var map = new CanopyRecordMap<Parent>(columns)
            .Link("replaces", row => row.Target, view: "other")
            .Collection("parts", row => row.Children, list => list.Key(child => child.Id).Column(new CanopyColumn("name", "Name"), child => child.Name).PageSize(2))
            .Timeline("events", row => row.Children, list => list.Key(child => child.Id).Time(child => child.Time).Summary(child => child.Name))
            .Changes("changes", row => row.Children, list => list.Key(child => child.Id).Name(child => child.Name).Before(child => child.Note).After(child => child.Name));
        ICanopyRecordProvider provider = queryable ? new CanopyQueryableRecordProvider<Parent>(new[] { parent }.AsQueryable(), map)
            : new CanopyInMemoryRecordProvider<Parent>(map, () => new[] { parent });
        var handler = Handler(map, provider);
        using var whole = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
        var fields = whole.RootElement.GetProperty("fields");
        Assert.Equal(Text(ulong.MaxValue), fields.GetProperty("replaces").GetProperty("ref").GetProperty("id").GetString());
        var parts = fields.GetProperty("parts").GetProperty("records");
        Assert.Equal(new[] { Text(High), Text(High + 1) }, parts.GetProperty("rows").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
        Assert.Equal(3, parts.GetProperty("total").GetInt32());
        Assert.Equal(new[] { "lower", "upper", "max" }, fields.GetProperty("events").GetProperty("events").EnumerateArray().Select(item => item.GetProperty("summary").GetString()));
        Assert.Equal(new[] { "lower", "upper", "max" }, fields.GetProperty("changes").GetProperty("changes").EnumerateArray().Select(item => item.GetProperty("name").GetString()));
        using var page = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1", ",\"field\":\"parts\",\"offset\":2,\"limit\":2")));
        Assert.Equal(Text(ulong.MaxValue), Assert.Single(page.RootElement.GetProperty("fields").GetProperty("parts").GetProperty("records").GetProperty("rows").EnumerateArray()).GetProperty("id").GetString());
    }

    [Fact]
    public async Task ExistingSignedAndSmallerUnsignedKeys_KeepTheirCanonicalRecordRoundTrips() {
        await ExistingKeys(new[] { sbyte.MinValue, sbyte.MaxValue });
        await ExistingKeys(new[] { uint.MinValue, uint.MaxValue });
        await ExistingKeys(new[] { long.MinValue, long.MaxValue });
    }

    private static async Task ExistingKeys<TKey>(TKey[] keys) {
        var rows = keys.Select(key => new Keyed<TKey> { Id = key, Name = "value" }).ToArray();
        var columns = new CanopyColumnMap<Keyed<TKey>>(Assets.View()).Key(row => row.Id).Column("name", row => row.Name);
        var map = new CanopyRecordMap<Keyed<TKey>>(columns).Field("notes", row => row.Name);
        foreach (var provider in new ICanopyRecordProvider[] { new CanopyQueryableRecordProvider<Keyed<TKey>>(rows.AsQueryable(), map), new CanopyInMemoryRecordProvider<Keyed<TKey>>(map, () => rows) }) {
            var handler = Handler(map, provider);
            foreach (var key in keys) {
                var id = Convert.ToString(key, CultureInfo.InvariantCulture)!;
                using var record = JsonDocument.Parse(await handler.RecordAsync(Assets.Query(id, ",\"row\":true")));
                Assert.Equal(id, record.RootElement.GetProperty("row").GetProperty("id").GetString());
            }
        }
    }

    private static CanopyColumnMap<UnsignedRecord> Columns(bool nullable) {
        var columns = new CanopyColumnMap<UnsignedRecord>(Assets.View());
        if (nullable) columns.Key(row => row.NullableId); else columns.Key(row => row.Id);
        return columns.Column("name", row => row.Name);
    }
    private static ICanopyRecordProvider Provider(CanopyRecordMap<UnsignedRecord> map, IEnumerable<UnsignedRecord> source, bool queryable) =>
        queryable ? new CanopyQueryableRecordProvider<UnsignedRecord>(source.AsQueryable(), map) : new CanopyInMemoryRecordProvider<UnsignedRecord>(map, () => source);
    private static CanopyRemoteHandler Handler<T>(CanopyRecordMap<T> map, ICanopyRecordProvider provider) => new CanopyRemoteHandler(map.Columns.Schema,
        new CanopyQueryableProvider<T>(Array.Empty<T>().AsQueryable(), map.Columns, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") }), null, null, provider);
    private static string Text(ulong value) => value.ToString(CultureInfo.InvariantCulture);

    public sealed class UnsignedRecord {
        public ulong Id { get; set; }
        public ulong? NullableId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Note { get; set; } = "note";
        public ulong? Replaces { get; set; }
        public DateTime Time { get; set; } = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        public List<UnsignedRecord> Peers { get; } = new();
    }
    public sealed class Parent {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public ulong Target { get; set; }
        public List<UnsignedRecord> Children { get; set; } = new();
    }
    private sealed class Keyed<TKey> {
        public TKey Id { get; set; } = default!;
        public string Name { get; set; } = string.Empty;
    }
    private sealed class CountingExecutor : CanopyQueryExecutor {
        internal int Reads { get; private set; }
        public override Task<List<T>> ToListAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) { Reads++; return base.ToListAsync(query, cancellationToken); }
        public override Task<int> CountAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) { Reads++; return base.CountAsync(query, cancellationToken); }
    }
}
