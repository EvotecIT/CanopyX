using System.Text;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>EF Core over a SQLite file gives the reference implementation's documents for random queries, with parameters only.</summary>
public sealed class EfCoreSqliteTests : IClassFixture<EfCoreSqliteTests.Database> {
    private readonly Database _database;

    public EfCoreSqliteTests(Database database) { _database = database; }

    public sealed class Database : IDisposable {
        public Database() {
            Hosts = Fleet.Hosts(1500, asciiOnly: true, seed: 21);
            Sqlite = new SqliteFleet(Hosts);
        }
        public List<Host> Hosts { get; }
        public SqliteFleet Sqlite { get; }
        public void Dispose() => Sqlite.Dispose();
    }

    private (CanopyRemoteHandler Reference, CanopyRemoteHandler Ef, FleetDb Db) Handlers(bool grouped = false, bool log = false, CanopyDataGridView? definition = null) {
        var view = definition ?? Fleet.View(grouped);
        var map = Fleet.Map(view);
        var db = _database.Sqlite.Create(log);
        var ef = new CanopyQueryableProvider<Host>(() => db.Hosts, map, new CanopyQueryOptions { Executor = new EfExecutor(), Revision = _ => new ValueTask<string>("r1") });
        var reference = new CanopyInMemoryProvider<Host>(map.Schema, () => _database.Hosts, host => host.Id.ToString(System.Globalization.CultureInfo.InvariantCulture), Harness.Values(), () => "r1");
        return (new CanopyRemoteHandler(map.Schema, reference), new CanopyRemoteHandler(map.Schema, ef), db);
    }

    [Fact]
    public async Task AutoComparison_StringKeysRemainDatabaseTranslated() {
        var map = Fleet.Map(Fleet.View()).Key(host => host.Name);
        using var db = _database.Sqlite.Create(log: true);
        var provider = new CanopyQueryableProvider<Host>(() => db.Hosts, map,
            new CanopyQueryOptions { Executor = new EfExecutor() });
        var handler = new CanopyRemoteHandler(map.Schema, provider);
        foreach (var sort in new[] { "[]", "[{\"column\":\"cores\",\"direction\":\"asc\"}]" }) {
            using var page = JsonDocument.Parse(await handler.QueryAsync("{\"offset\":7,\"limit\":13,\"sort\":" + sort + "}"));
            var ordered = sort == "[]" ? db.Hosts.OrderBy(host => host.Name) : db.Hosts.OrderBy(host => host.Cores == null).ThenBy(host => host.Cores).ThenBy(host => host.Name);
            Assert.Equal(ordered.Skip(7).Take(13).Select(host => host.Name).ToArray(),
                page.RootElement.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
        }
    }

    [Fact]
    public async Task RandomQueries_EfCoreMatchesReference() {
        var (reference, ef, db) = Handlers();
        using (db) {
            var queries = new RandomQueries(_database.Hosts, 31);
            var answers = new Answers();
            for (var i = 0; i < 300; i++) {
                var json = queries.Query(60);
                Assert.True(answers.Note(await LinqOracleTests.Answer(() => reference.QueryAsync(json))) == await LinqOracleTests.Answer(() => ef.QueryAsync(json)), "Query " + i + " differs: " + json);
            }
            answers.AssertMostlyAnswered(300);
        }
    }

    [Fact]
    public async Task RandomFacets_EfCoreMatchesReference() {
        var (reference, ef, db) = Handlers();
        using (db) {
            var queries = new RandomQueries(_database.Hosts, 32);
            var columns = new[] { "site", "os", "online", "cores", "owner", "memory", "lastSeen" };
            for (var i = 0; i < 140; i++) {
                var query = queries.Query(0).Replace("\"view\":\"fleet\"", "\"view\":\"fleet\",\"revision\":\"r1\"");
                var column = columns[i % columns.Length];
                var search = i % 3 == 0 && column != "lastSeen" && column != "memory" ? (column == "cores" ? "6" : "O") : "";
                var json = "{\"column\":\"" + column + "\",\"search\":\"" + search + "\",\"limit\":" + (1 + i % 9) + ",\"includeCurrentFilter\":" + (i % 2 == 0 ? "true" : "false") + ",\"query\":" + query + "}";
                Assert.True(await LinqOracleTests.Answer(() => reference.FacetAsync(json)) == await LinqOracleTests.Answer(() => ef.FacetAsync(json)), "Facet " + i + " differs: " + json);
            }
        }
    }

    [Fact]
    public async Task RandomSummariesAndGroupedPages_EfCoreMatchesReference() {
        var (reference, ef, db) = Handlers(grouped: true);
        using (db) {
            var queries = new RandomQueries(_database.Hosts, 33);
            var answers = new Answers();
            for (var i = 0; i < 80; i++) {
                var page = queries.Query(900, sortGroupingFirst: true);
                Assert.True(answers.Note(await LinqOracleTests.Answer(() => reference.QueryAsync(page))) == await LinqOracleTests.Answer(() => ef.QueryAsync(page)), "Grouped page " + i + " differs: " + page);
                var summary = page.Replace("\"view\":\"fleet\"", "\"view\":\"fleet\",\"revision\":\"r1\"");
                LinqOracleTests.AssertSameSummary(await LinqOracleTests.Answer(() => reference.SummaryAsync(summary)), await LinqOracleTests.Answer(() => ef.SummaryAsync(summary)), "Summary " + i + " differs: " + summary);
            }
            answers.AssertMostlyAnswered(80);
        }
    }

    [Fact]
    public async Task RandomMultiLevelGrouping_EfCoreMatchesReference() {
        var (reference, ef, db) = Handlers(log: true, definition: Fleet.DynamicView());
        using (db) {
            var queries = new RandomQueries(_database.Hosts, 34);
            var answers = new Answers();
            for (var i = 0; i < 120; i++) {
                var page = queries.GroupedQuery(1200);
                Assert.True(answers.Note(await LinqOracleTests.Answer(() => reference.QueryAsync(page))) == await LinqOracleTests.Answer(() => ef.QueryAsync(page)), "Grouped page " + i + " differs: " + page);
                var summary = MultiLevelGroupingTests.WithRevision(page);
                LinqOracleTests.AssertSameSummary(await LinqOracleTests.Answer(() => reference.SummaryAsync(summary)), await LinqOracleTests.Answer(() => ef.SummaryAsync(summary)), "Summary " + i + " differs: " + summary);
            }
            answers.AssertMostlyAnswered(120);
            // Several grouping columns become one GROUP BY, and distinct counts COUNT(DISTINCT ...), in the database.
            var sql = string.Join("\n", _database.Sqlite.Sql);
            Assert.Matches("GROUP BY \"[^\"]+\"\\.\"[^\"]+\", ", sql);
            Assert.Contains("COUNT(DISTINCT", sql, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task GroupedExport_EfCoreStreamsTheReferenceFile() {
        var (reference, ef, db) = Handlers(definition: Fleet.DynamicView());
        using (db) {
            const string query = "{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"os\",\"direction\":\"asc\",\"aggregate\":\"memoryAvg\"},{\"column\":\"site\",\"direction\":\"desc\"}],\"sort\":[{\"column\":\"lastSeen\",\"direction\":\"desc\"},{\"column\":\"name\",\"direction\":\"asc\"}]}";
            var request = "{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":" + query + ",\"values\":\"raw\"}";
            Assert.Equal(await Export(reference, request), await Export(ef, request));
        }
    }

    [Fact]
    public async Task ManySmallGroupsAndDefaultExecutor_MatchReference() {
        var view = Fleet.View(grouped: true, groupColumn: "memory");
        var map = Fleet.Map(view);
        using var db = _database.Sqlite.Create();
        // No executor: the default one counts through EF Core's asynchronous provider.
        var ef = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Host>(() => db.Hosts, map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") }));
        var reference = new CanopyRemoteHandler(map.Schema, new CanopyInMemoryProvider<Host>(map.Schema, () => _database.Hosts, host => host.Id.ToString(System.Globalization.CultureInfo.InvariantCulture), Harness.Values(), () => "r1"));
        var random = new Random(9);
        for (var i = 0; i < 30; i++) {
            var page = "{\"offset\":" + random.Next(0, 1400) + ",\"limit\":" + random.Next(1, 120) + ",\"sort\":[{\"column\":\"name\",\"direction\":\"asc\"}],\"filters\":[{\"column\":\"cores\",\"operator\":\"isNotNull\",\"values\":[]}]}";
            Assert.True(await LinqOracleTests.Answer(() => reference.QueryAsync(page)) == await LinqOracleTests.Answer(() => ef.QueryAsync(page)), "Grouped page " + i + " differs: " + page);
        }
    }

    [Fact]
    public async Task Exports_EfCoreStreamsTheReferenceFile() {
        var (reference, ef, db) = Handlers();
        using (db) {
            const string query = "{\"view\":\"fleet\",\"revision\":\"r1\",\"search\":\"o\",\"sort\":[{\"column\":\"lastSeen\",\"direction\":\"desc\"},{\"column\":\"name\",\"direction\":\"asc\"}],\"filters\":[{\"column\":\"cores\",\"operator\":\"ge\",\"values\":[4]}]}";
            foreach (var request in new[] {
                "{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":" + query + ",\"values\":\"display\"}",
                "{\"scope\":\"all\",\"revision\":\"r1\",\"query\":" + query + ",\"values\":\"raw\",\"columns\":[\"name\",\"lastSeen\",\"memory\",\"notes\"]}",
                "{\"scope\":\"selected\",\"revision\":\"r1\",\"query\":" + query + ",\"selection\":[\"5\",\"9\",\"1200\"]}"
            }) {
                Assert.Equal(await Export(reference, request), await Export(ef, request));
            }
        }
    }

    [Fact]
    public async Task HostileOperands_ReachTheDatabaseOnlyAsParameters() {
        var (_, ef, db) = Handlers(log: true);
        using (db) {
            const string hostile = "x'); DROP TABLE Hosts; --";
            var json = "{\"search\":" + RandomQueries.Json(hostile) + ",\"filters\":[{\"column\":\"name\",\"operator\":\"in\",\"values\":[" + RandomQueries.Json(hostile) + ",\"a%\"]}," +
                "{\"column\":\"notes\",\"operator\":\"contains\",\"values\":[\"%_[\"]}],\"filterGroup\":{\"operator\":\"or\",\"filters\":[{\"column\":\"site\",\"operator\":\"startsWith\",\"values\":[" + RandomQueries.Json(hostile) + "]}],\"groups\":[]}}";
            using var page = JsonDocument.Parse(await ef.QueryAsync(json));
            Assert.Equal(0, page.RootElement.GetProperty("matched").GetInt32());
            await ef.FacetAsync("{\"column\":\"site\",\"search\":" + RandomQueries.Json(hostile) + ",\"query\":{\"revision\":\"r1\"}}");
            var sql = string.Join("\n", _database.Sqlite.Sql);
            Assert.Contains("@", sql);
            Assert.DoesNotContain("DROP TABLE", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("a%", sql);
            Assert.Equal(_database.Hosts.Count, db.Hosts.Count());
        }
    }

    [Fact]
    public async Task Wildcards_MatchLiterally() {
        var (reference, ef, db) = Handlers();
        using (db) {
            foreach (var operand in new[] { "%", "_", "50%", "under_", "[", "\"" }) {
                var json = Harness.Where("{\"column\":\"notes\",\"operator\":\"contains\",\"values\":[" + RandomQueries.Json(operand) + "]}");
                Assert.Equal(await reference.QueryAsync(json), await ef.QueryAsync(json));
                var starts = Harness.Where("{\"column\":\"notes\",\"operator\":\"startsWith\",\"values\":[" + RandomQueries.Json(operand) + "]}");
                Assert.Equal(await reference.QueryAsync(starts), await ef.QueryAsync(starts));
            }
        }
    }

    private static async Task<string> Export(CanopyRemoteHandler handler, string request) {
        var job = await handler.PrepareExportAsync(request, "csv");
        using var stream = new MemoryStream();
        await job.WriteAsync(stream);
        return Encoding.UTF8.GetString(stream.ToArray());
    }
}
