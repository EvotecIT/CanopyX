using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>EF Core over SQLite answers date-range requests with the reference implementation's documents, in one translated
/// predicate with parameters only, composed on the host's scoped base query.</summary>
public sealed class EfCoreRangeTests : IClassFixture<EfCoreRangeTests.Database> {
    private readonly Database _database;

    public EfCoreRangeTests(Database database) { _database = database; }

    public sealed class Database : IDisposable {
        public Database() {
            Slots = Schedule.Slots(1200, seed: 17);
            Sqlite = new SqliteSchedule(Slots);
            Edges = RangeOracleTests.Boundaries();
            EdgeSqlite = new SqliteSchedule(Edges);
        }
        public List<Slot> Slots { get; }
        public SqliteSchedule Sqlite { get; }
        public List<Slot> Edges { get; }
        public SqliteSchedule EdgeSqlite { get; }
        public void Dispose() {
            Sqlite.Dispose();
            EdgeSqlite.Dispose();
        }
    }

    private static CanopyRemoteHandler Ef(CanopyColumnMap<Slot> map, Func<IQueryable<Slot>> source) =>
        new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Slot>(source, map, new CanopyQueryOptions { Executor = new EfExecutor(), Revision = _ => new ValueTask<string>("r1") }));

    [Fact]
    public async Task RandomRanges_EfCoreMatchesLinqAndReference() {
        var map = Schedule.Map();
        using var db = _database.Sqlite.Create();
        var reference = Schedule.Reference(map.Schema, _database.Slots);
        var linq = Schedule.Linq(map, _database.Slots);
        var ef = Ef(map, () => db.Slots);
        var ranges = new RandomRanges(_database.Slots, 43);
        var answers = new Answers();
        for (var i = 0; i < 400; i++) {
            var json = ranges.Next();
            var expected = answers.Note(await LinqOracleTests.Answer(() => reference.RangeAsync(json)));
            Assert.True(expected == await LinqOracleTests.Answer(() => linq.RangeAsync(json)), "LINQ range " + i + " differs: " + json);
            Assert.True(expected == await LinqOracleTests.Answer(() => ef.RangeAsync(json)), "EF Core range " + i + " differs: " + json);
        }
        answers.AssertMostlyAnswered(400);
    }

    [Theory]
    [MemberData(nameof(RangeOracleTests.BoundaryCases), MemberType = typeof(RangeOracleTests))]
    public async Task Boundaries_EfCoreFollowsTheOverlapRules(string columns, string extra, int matched, string[] expected) {
        var map = Schedule.Map();
        using var db = _database.EdgeSqlite.Create();
        var json = Schedule.Range(Schedule.Epoch, Schedule.Epoch.AddDays(7), columns, "{}", extra);
        var answer = await Ef(map, () => db.Slots).RangeAsync(json);
        Assert.Equal(await Schedule.Reference(map.Schema, _database.Edges).RangeAsync(json), answer);
        var read = RangeOracleTests.Read(answer);
        Assert.Equal(expected, read.Ids);
        Assert.Equal(matched, read.Matched);
    }

    [Fact]
    public async Task ScopedBaseQuery_StillRestrictsTheRange() {
        var map = Schedule.Map();
        using var db = _database.Sqlite.Create();
        var scoped = Ef(map, () => db.Slots.Where(slot => slot.Kind == "incident"));
        var reference = Schedule.Reference(map.Schema, _database.Slots.Where(slot => slot.Kind == "incident").ToList());
        var json = Schedule.Range(Schedule.Epoch.AddDays(-30), Schedule.Epoch.AddDays(30), extra: ",\"limit\":10000");
        var answer = await scoped.RangeAsync(json);
        Assert.Equal(await reference.RangeAsync(json), answer);
        Assert.True(RangeOracleTests.Read(answer).Matched > 0);
        Assert.DoesNotContain("maintenance", answer, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CalendarOverrideMetadata_OrdinaryQueryTranslatesAndKeepsTheScopedSource() {
        var map = Schedule.Map();
        var records = CalendarOverrideMetadataFixture.Rows();
        using var sqlite = new SqliteSchedule(records);
        using var db = sqlite.Create();
        var scoped = Ef(map, () => db.Slots.Where(row => row.Kind == "public"));
        var reference = Schedule.Reference(map.Schema, records.Where(row => row.Kind == "public").ToList());
        var linq = Schedule.Linq(map, records.Where(row => row.Kind == "public").ToList());
        var query = CalendarOverrideMetadataFixture.Query();

        var answer = await scoped.QueryAsync(query);

        Assert.Equal(await reference.QueryAsync(query), answer);
        Assert.Equal(await linq.QueryAsync(query), answer);
        using var document = System.Text.Json.JsonDocument.Parse(answer);
        Assert.Equal(new[] { "moved-resource", "moved-window" }, document.RootElement.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
    }

    [Fact]
    public async Task HostileOperands_ReachTheDatabaseOnlyAsParameters_InOneCountAndOneRead() {
        var map = Schedule.Map();
        lock (_database.Sqlite.Sql) _database.Sqlite.Sql.Clear();
        using var db = _database.Sqlite.Create(log: true);
        const string hostile = "x'); DROP TABLE Slots; --";
        var json = Schedule.Range(Schedule.Epoch, Schedule.Epoch.AddDays(31), ",\"end\":\"ends\",\"recurrence\":\"rule\",\"seriesEnd\":\"seriesEnd\",\"resource\":\"host\",\"resources\":[" +
            RandomQueries.Json(hostile) + ",\"host-1\"]", "{\"filterGroup\":{\"operator\":\"or\",\"filters\":[{\"column\":\"title\",\"operator\":\"contains\",\"values\":[\"a%\"]},{\"column\":\"kind\",\"operator\":\"eq\",\"values\":[\"maintenance\"]}],\"groups\":[]}}");
        var read = RangeOracleTests.Read(await Ef(map, () => db.Slots).RangeAsync(json));
        Assert.Equal(RangeOracleTests.Read(await Schedule.Reference(map.Schema, _database.Slots).RangeAsync(json)).Ids, read.Ids);
        Assert.True(read.Matched > 0);
        string[] commands;
        lock (_database.Sqlite.Sql) commands = _database.Sqlite.Sql.ToArray();
        var sql = string.Join("\n", commands);
        Assert.Contains("@", sql);
        Assert.DoesNotContain("DROP TABLE", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("a%", sql);
        Assert.DoesNotContain("2026-10", sql);
        Assert.Contains("ORDER BY", sql);
        Assert.Equal(_database.Slots.Count, db.Slots.Count());
    }

    [Fact]
    public async Task DatabaseStartOrdering_RequiresSortBy() {
        var view = Schedule.View();
        var map = new CanopyColumnMap<Slot>(view).Key(x => x.Id).Column("title", x => x.Title).Column("starts", x => x.Starts).Column("ends", x => x.Ends);
        using var db = _database.Sqlite.Create();
        var json = Schedule.Range(Schedule.Epoch, Schedule.Epoch.AddDays(1), ",\"end\":\"ends\"");
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => Ef(map, () => db.Slots).RangeAsync(json));
        Assert.Equal(CanopyRequestError.Unsupported, error.Error);
        // In memory, LINQ to objects orders by the protocol's UTC milliseconds without a SortBy mapping.
        Assert.Equal(await Schedule.Reference(map.Schema, _database.Slots).RangeAsync(json), await Schedule.Linq(map, _database.Slots).RangeAsync(json));
    }
}
