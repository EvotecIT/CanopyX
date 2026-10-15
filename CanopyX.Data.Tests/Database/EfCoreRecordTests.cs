using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>EF Core over a SQLite file answers record requests exactly as LINQ to objects and the reference provider do, with
/// key lookups and parameters only.</summary>
public sealed class EfCoreRecordTests : IClassFixture<EfCoreRecordTests.Database> {
    private readonly Database _database;

    public EfCoreRecordTests(Database database) { _database = database; }

    public sealed class Database : IDisposable {
        public Database() {
            Assets = Tests.Assets.Create(300, seed: 29);
            Sqlite = new SqliteAssets(Assets);
        }
        public List<Asset> Assets { get; }
        public SqliteAssets Sqlite { get; }
        public void Dispose() => Sqlite.Dispose();
    }

    private (CanopyRemoteHandler Reference, CanopyRemoteHandler Linq, CanopyRemoteHandler Ef, AssetDb Db) Handlers(bool log = false) {
        var records = Assets.Records(Assets.Columns(Assets.View()));
        var db = _database.Sqlite.Create(log);
        var ef = new CanopyQueryableRecordProvider<Asset>(() => db.Assets.Where(asset => asset.Site != "Hidden"), records, new CanopyQueryOptions { Executor = new EfExecutor() });
        return (Assets.Handler(records, new CanopyInMemoryRecordProvider<Asset>(records, () => Assets.Scoped(_database.Assets))),
            Assets.Handler(records, new CanopyQueryableRecordProvider<Asset>(() => Assets.Scoped(_database.Assets).AsQueryable(), records)),
            Assets.Handler(records, ef), db);
    }

    [Fact]
    public async Task RandomRecordRequests_EfCoreMatchesLinqAndReference() {
        var (reference, linq, ef, db) = Handlers();
        using (db) {
            var requests = new RandomRecordRequests(_database.Assets, 41);
            var answered = 0;
            for (var i = 0; i < 400; i++) {
                var (json, canRead) = requests.Next();
                var expected = await RecordOracleTests.Answer(() => reference.RecordAsync(json, canRead));
                if (!expected.StartsWith("rejected:", StringComparison.Ordinal)) answered++;
                Assert.True(expected == await RecordOracleTests.Answer(() => linq.RecordAsync(json, canRead)), "LINQ request " + i + " differs: " + json);
                Assert.True(expected == await RecordOracleTests.Answer(() => ef.RecordAsync(json, canRead)), "EF Core request " + i + " differs: " + json);
            }
            Assert.True(answered > 130, "Only " + answered + " random requests found a record.");
        }
    }

    [Fact]
    public async Task CollectionPagesAndTotals_EfCoreMatchesReferenceForEveryRecord() {
        var (reference, _, ef, db) = Handlers();
        using (db) {
            foreach (var asset in _database.Assets.Where(asset => asset.Parts.Count > 25 || asset.Id % 37 == 0)) {
                var id = asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
                foreach (var extra in new[] { "", ",\"row\":true", ",\"field\":\"parts\",\"offset\":0,\"limit\":13", ",\"field\":\"parts\",\"offset\":13,\"limit\":13", ",\"field\":\"peers\",\"offset\":2,\"limit\":3" }) {
                    var json = Assets.Query(id, extra);
                    Assert.Equal(await RecordOracleTests.Answer(() => reference.RecordAsync(json)), await RecordOracleTests.Answer(() => ef.RecordAsync(json)));
                }
            }
        }
    }

    [Fact]
    public async Task Lookups_AreKeyedAndParameterized() {
        var (_, _, ef, db) = Handlers(log: true);
        using (db) {
            const string hostile = "1 OR 1=1; DROP TABLE Assets; --";
            await Assert.ThrowsAsync<CanopyRequestException>(() => ef.RecordAsync(Assets.Query(hostile)));
            var visible = _database.Assets.First(asset => asset.Site != "Hidden" && asset.Parts.Count > 3).Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
            await ef.RecordAsync(Assets.Query(visible, ",\"row\":true"));
            await ef.RecordAsync(Assets.Query(visible, ",\"field\":\"parts\",\"offset\":1,\"limit\":2"));
            var sql = string.Join("\n", _database.Sqlite.Sql);
            // An identity that is not a key's text never reaches the database; a key reaches it as a parameter in a key test.
            Assert.DoesNotContain("DROP TABLE", sql, StringComparison.OrdinalIgnoreCase);
            Assert.Matches("WHERE .*\"a\"\\.\"Id\" = @", sql);
            Assert.DoesNotContain("= " + visible + " ", sql);
            Assert.Contains("LIMIT @", sql);
            Assert.Equal(_database.Assets.Count, db.Assets.Count());
        }
    }
}
