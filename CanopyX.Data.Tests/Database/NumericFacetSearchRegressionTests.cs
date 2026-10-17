using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;
using Xunit.Abstractions;

namespace CanopyX.Data.Tests;

/// <summary>Database value-list search reads the same binary64 text as the protocol's reference provider.</summary>
public sealed class NumericFacetSearchRegressionTests {
    private readonly ITestOutputHelper _output;
    public NumericFacetSearchRegressionTests(ITestOutputHelper output) { _output = output; }

    [Theory]
    [InlineData("real", "-7", 3)]
    [InlineData("single", "-7", 4)]
    [InlineData("amount", "-7", 3)]
    [InlineData("real", "-07", 0)]
    [InlineData("single", "-07", 0)]
    [InlineData("amount", "-07", 0)]
    [InlineData("real", "E-7", 3)]
    [InlineData("single", "E-7", 4)]
    [InlineData("amount", "E-7", 3)]
    public async Task SqliteFacetSearch_UsesCanonicalExponentTextBeforeOrderedLimit(string column, string search, int total) {
        using var fixture = new Fixture();
        var result = await AssertFacet(fixture, column, search, 2);
        Assert.Equal(13, result.Matched);
        Assert.Equal(total, result.Total);
        Assert.Equal(total > 2, result.Truncated);
        if (total != 0) {
            Assert.Equal(2, result.Values.Length);
            Assert.True(result.Values[0] < 0);
            Assert.True(result.Values[1] > 0);
            Assert.Equal(new[] { 1, 2 }, result.Counts);
        } else Assert.Empty(result.Values);
    }

    [Theory]
    [InlineData("real", "4567", 1)]
    [InlineData("real", ".0", 1)]
    [InlineData("amount", ".0", 1)]
    [InlineData("amount", "1e-7", 1)]
    [InlineData("single", ".0", 3)]
    [InlineData("integer", "-7", 1)]
    public async Task SqliteFacetSearch_UsesFullPrecisionAndProtocolSuffixes(string column, string search, int total) {
        using var fixture = new Fixture();
        var result = await AssertFacet(fixture, column, search, 20);
        Assert.Equal(total, result.Total);
        Assert.False(result.Truncated);
        if (column == "real" && search == "4567") Assert.Equal(new double?[] { 1.2345678901234567 }, result.Values);
        if (search == ".0" && column != "single") Assert.Equal(new double?[] { 1e-6 }, result.Values);
        if (column == "amount" && search == "1e-7") Assert.Equal(new[] { 2 }, result.Counts);
    }

    [Theory]
    [InlineData(false, 12, 3)]
    [InlineData(true, 4, 0)]
    public async Task SqliteFacetSearch_PreservesEffectiveQueryAndMatchedCount(bool includeCurrentFilter, int matched, int total) {
        using var fixture = new Fixture();
        var request = JsonSerializer.Serialize(new { column = "amount", search = "-7", limit = 2, includeCurrentFilter,
            query = new { revision = "r1", filters = new object[] {
                new { column = "active", @operator = "eq", values = new[] { true } },
                new { column = "amount", @operator = "ge", values = new[] { 1 } }
            } } });
        var result = await AssertFacet(fixture, request);
        Assert.Equal(matched, result.Matched);
        Assert.Equal(total, result.Total);
        if (!includeCurrentFilter) Assert.Equal(new[] { 1, 1 }, result.Counts);
    }

    [Fact]
    public async Task SqliteFacetSearch_MergesBinary64DecimalBucketsAndStreamsGroupedPrefix() {
        using var fixture = new Fixture();
        var result = await AssertFacet(fixture, "amount", "1", 3);
        Assert.Equal(5, result.Total);
        Assert.True(result.Truncated);
        Assert.Equal(new double?[] { 1e-7, 1e-6, 1 }, result.Values);
        Assert.Equal(new[] { 2, 1, 2 }, result.Counts);
        var sql = string.Join(Environment.NewLine, fixture.Sql);
        Assert.Contains("GROUP BY", sql, StringComparison.OrdinalIgnoreCase);
        _output.WriteLine(sql);
    }

    [Theory]
    [InlineData("real")]
    [InlineData("single")]
    [InlineData("amount")]
    [InlineData("integer")]
    public async Task SqliteNumericFacets_KeepEmptySearchOrderAndMissingCounts(string column) {
        using var fixture = new Fixture();
        var result = await AssertFacet(fixture, column, "", 20);
        Assert.Equal(9, result.Total);
        Assert.Equal(13, result.Matched);
        Assert.False(result.Truncated);
        Assert.Null(result.Values[result.Values.Length - 1]);
        Assert.Equal(2, result.Counts[result.Counts.Length - 1]);
        Assert.Equal(2, result.Counts[Array.IndexOf(result.Values, 0d)]);
        var missing = await AssertFacet(fixture, column, "null", 20);
        Assert.Equal(0, missing.Total);
        Assert.Equal(13, missing.Matched);
    }

    [Fact]
    public async Task SqliteQuickSearch_PreservesStoreTextAndSupportsCanonicalHostAlias() {
        using var fixture = new Fixture();
        var alias = fixture.SqlHandler(searchAlias: true);
        Assert.Equal(0, await Matches(fixture.SqlHandler(), "-7"));
        Assert.Equal(4, await Matches(fixture.SqlHandler(), "-07"));
        Assert.Equal(4, await Matches(alias, "-7"));
        Assert.Equal(0, await Matches(alias, "-07"));
    }

    private static async Task<int> Matches(CanopyRemoteHandler handler, string search) {
        using var result = JsonDocument.Parse(await handler.QueryAsync(JsonSerializer.Serialize(new { search })));
        return result.RootElement.GetProperty("matched").GetInt32();
    }

    private static Task<Facet> AssertFacet(Fixture fixture, string column, string search, int limit) =>
        AssertFacet(fixture, JsonSerializer.Serialize(new { column, search, limit, query = new { revision = "r1" } }));

    private static async Task<Facet> AssertFacet(Fixture fixture, string request) {
        var expected = Facet.Read(await fixture.Reference.FacetAsync(request));
        var actual = Facet.Read(await fixture.SqlHandler().FacetAsync(request));
        Assert.Equal(expected.Matched, actual.Matched);
        Assert.Equal(expected.Total, actual.Total);
        Assert.Equal(expected.Truncated, actual.Truncated);
        Assert.Equal(expected.Values, actual.Values);
        Assert.Equal(expected.Counts, actual.Counts);
        return actual;
    }

    private sealed class Facet {
        public int Matched { get; private set; }
        public int Total { get; private set; }
        public bool Truncated { get; private set; }
        public double?[] Values { get; private set; } = Array.Empty<double?>();
        public int[] Counts { get; private set; } = Array.Empty<int>();
        public static Facet Read(string json) {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var items = root.GetProperty("items").EnumerateArray().ToArray();
            return new Facet { Matched = root.GetProperty("matched").GetInt32(), Total = root.GetProperty("totalValues").GetInt32(),
                Truncated = root.GetProperty("truncated").GetBoolean(),
                Values = items.Select(item => item.GetProperty("value").ValueKind == JsonValueKind.Null ? (double?)null : item.GetProperty("value").GetDouble()).ToArray(),
                Counts = items.Select(item => item.GetProperty("count").GetInt32()).ToArray() };
        }
    }

    private sealed class Fixture : IDisposable {
        private readonly SqliteConnection _connection = new SqliteConnection("Data Source=:memory:;Pooling=False");
        private readonly NumericDb _database;
        private readonly List<NumericRow> _rows = new List<NumericRow> {
            Row(1, -2e-7, -2e-7f, -0.0000002m, -7), Row(2, 1e-7, 1e-7f, 0.0000001m, 7),
            Row(3, 1e-7, 1e-7f, 0.0000001m, 7, false), Row(4, 2e-7, 2e-7f, 0.0000002m, 17),
            Row(5, 1, 1, 1.0m, 10), Row(6, 1, 1, 1.0000000000000000000000000001m, 10),
            Row(7, 1.2345678901234567, 1.2345679f, 1.2345678901234567m, 1234567), Row(8, null, null, null, null),
            Row(9, 0, -0f, 0m, 0), Row(10, 1e-6, 1e-6f, 0.000001m, 1000000), Row(11, 1e10, 1e10f, 10000000000m, 10000000000),
            Row(12, -0d, 0, 0m, 0), Row(13, double.PositiveInfinity, float.PositiveInfinity, null, null)
        };
        public Fixture() {
            _connection.Open();
            _database = new NumericDb(new DbContextOptionsBuilder<NumericDb>().UseSqlite(_connection)
                .LogTo(Sql.Add, new[] { DbLoggerCategory.Database.Command.Name }).Options);
            _database.Database.EnsureCreated();
            _database.Rows.AddRange(_rows);
            _database.SaveChanges();
            Sql.Clear();
            var map = Map(false);
            Reference = new CanopyRemoteHandler(map.Schema, new CanopyInMemoryProvider<NumericRow>(map.Schema, () => _rows,
                row => row.Id.ToString(CultureInfo.InvariantCulture), new Dictionary<string, Func<NumericRow, object?>> {
                    ["real"] = row => row.Real, ["single"] = row => row.Single, ["amount"] = row => row.Amount,
                    ["integer"] = row => row.Integer, ["active"] = row => row.Active
                }, () => "r1"));
        }
        public List<string> Sql { get; } = new List<string>();
        public CanopyRemoteHandler Reference { get; }
        public CanopyRemoteHandler SqlHandler(bool searchAlias = false) {
            var map = Map(searchAlias);
            return new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<NumericRow>(_database.Rows, map,
                new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") }));
        }
        private static CanopyColumnMap<NumericRow> Map(bool searchAlias) {
            var view = new CanopyDataGridView("numeric", "Numeric") { Source = CanopyGridSource.HostedOffset() };
            foreach (var id in new[] { "real", "single", "amount", "integer" }) view.Columns.Add(new CanopyColumn(id, id) { Kind = CanopyColumnKind.Number, Sortable = true });
            view.Columns.Add(new CanopyColumn("active", "Active"));
            view.SearchColumns.Add("real");
            view.Reporting = new CanopyGridReporting();
            foreach (var id in new[] { "real", "single", "amount", "integer" }) view.Reporting.FacetColumns.Add(id);
            return new CanopyColumnMap<NumericRow>(view).Key(row => row.Id)
                .Column("real", row => row.Real, column => { if (searchAlias) column.SearchBy(row => row.SearchText); })
                .Column("single", row => row.Single).Column("amount", row => row.Amount).Column("integer", row => row.Integer).Column("active", row => row.Active);
        }
        private static NumericRow Row(int id, double? real, float? single, decimal? amount, long? integer, bool active = true) =>
            new NumericRow { Id = id, Real = real, Single = single, Amount = amount, Integer = integer, Active = active,
                SearchText = CanopyDataValues.ToSearchText(real) };
        public void Dispose() { _database.Dispose(); _connection.Dispose(); }
    }

    private sealed class NumericDb : DbContext {
        public NumericDb(DbContextOptions<NumericDb> options) : base(options) { }
        public DbSet<NumericRow> Rows => Set<NumericRow>();
    }
    private sealed class NumericRow {
        public int Id { get; set; }
        public double? Real { get; set; }
        public float? Single { get; set; }
        public decimal? Amount { get; set; }
        public long? Integer { get; set; }
        public bool Active { get; set; }
        public string? SearchText { get; set; }
    }
}
