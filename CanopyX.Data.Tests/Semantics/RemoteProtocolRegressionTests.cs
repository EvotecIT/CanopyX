using System.Globalization;
using System.Runtime.Serialization;
using System.Text.Json;
using Xunit;
#if NET10_0_OR_GREATER
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
#endif

namespace CanopyX.Data.Tests;

/// <summary>Protocol precision and emitted enum text agree across the reference, LINQ and SQL request boundaries.</summary>
public sealed class RemoteProtocolRegressionTests {
    private static readonly DateTime Epoch = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
#if NET10_0_OR_GREATER
    [InlineData(3)]
#endif
    public async Task NumericFilters_CompareStoredValuesInBinary64(int backend) {
        using var fixture = new Fixture(backend, new[] {
            new Record { Id = 1, Single = 1.0000001f, Amount = 1.0000000000000000000000000001m },
            new Record { Id = 2, Single = 1, Amount = 1m },
            new Record { Id = 3, Single = 2, Amount = 2m },
            new Record { Id = 4 }
        });
        Assert.Equal(new[] { "1", "3" }, await Ids(fixture.Handler, Filter("single", "gt", "1.0000001")));
        Assert.Empty(await Ids(fixture.Handler, Filter("single", "eq", "1.0000001")));
        Assert.Equal(new[] { "1", "2" }, await Ids(fixture.Handler, Filter("amount", "eq", "1")));
        Assert.Equal(new[] { "3" }, await Ids(fixture.Handler, Filter("amount", "gt", "1")));
        Assert.Equal(new[] { "3" }, await Ids(fixture.Handler, Filter("amount", "ne", "1")));
        Assert.Equal(new[] { "1", "2", "3", "4" }, await Ids(fixture.Handler, "{\"sort\":[{\"column\":\"amount\",\"direction\":\"asc\"}]}"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
#if NET10_0_OR_GREATER
    [InlineData(3)]
#endif
    public async Task Facets_MergeProtocolBucketsBeforeLimitAndCount(int backend) {
        using var fixture = new Fixture(backend, new[] {
            new Record { Id = 1, Amount = 1.0000000000000000000000000001m, Instant = Epoch.AddTicks(9000), Offset = new DateTimeOffset(Epoch.AddTicks(9000)) },
            new Record { Id = 2, Amount = 1m, Instant = Epoch.AddTicks(1000), Offset = new DateTimeOffset(Epoch.AddTicks(1000)).ToOffset(TimeSpan.FromHours(2)) },
            new Record { Id = 3, Amount = 2m, Instant = Epoch.AddMilliseconds(1), Offset = new DateTimeOffset(Epoch.AddMilliseconds(1)) },
            new Record { Id = 4 }
        });
        foreach (var column in backend == 3 ? new[] { "amount", "instant" } : new[] { "amount", "instant", "offset" }) {
            using var result = JsonDocument.Parse(await fixture.Handler.FacetAsync("{\"column\":\"" + column + "\",\"limit\":2,\"query\":{\"revision\":\"live\"}}"));
            var root = result.RootElement;
            Assert.Equal(4, root.GetProperty("matched").GetInt32());
            Assert.Equal(3, root.GetProperty("totalValues").GetInt32());
            Assert.True(root.GetProperty("truncated").GetBoolean());
            var items = root.GetProperty("items").EnumerateArray().ToArray();
            Assert.Equal(2, items.Length);
            Assert.Equal(new[] { 2, 1 }, items.Select(item => item.GetProperty("count").GetInt32()));
            if (column == "amount") Assert.Equal(new[] { 1d, 2d }, items.Select(item => item.GetProperty("value").GetDouble()));
            else Assert.Equal(new[] { Epoch, Epoch.AddMilliseconds(1) }, items.Select(item => item.GetProperty("value").GetDateTime()));
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public async Task DateSorts_ProtocolMillisecondTiesUseIdentity(int backend) {
        using var fixture = new Fixture(backend, new[] {
            new Record { Id = 1, Instant = Epoch.AddTicks(9000), Offset = new DateTimeOffset(Epoch.AddTicks(9000)).ToOffset(TimeSpan.FromHours(2)) },
            new Record { Id = 2, Instant = Epoch.AddTicks(1000), Offset = new DateTimeOffset(Epoch.AddTicks(1000)) },
            new Record { Id = 3, Instant = Epoch.AddMilliseconds(1), Offset = new DateTimeOffset(Epoch.AddMilliseconds(1)) },
            new Record { Id = 4 }
        });
        foreach (var column in new[] { "instant", "offset" }) {
            Assert.Equal(new[] { "1", "2", "3", "4" }, await Ids(fixture.Handler, "{\"sort\":[{\"column\":\"" + column + "\",\"direction\":\"asc\"}]}"));
            Assert.Equal(new[] { "3", "1", "2", "4" }, await Ids(fixture.Handler, "{\"sort\":[{\"column\":\"" + column + "\",\"direction\":\"desc\"}]}"));
            Assert.Equal(new[] { "2" }, await Ids(fixture.Handler, "{\"offset\":1,\"limit\":1,\"sort\":[{\"column\":\"" + column + "\",\"direction\":\"asc\"}]}"));
        }
    }

#if NET10_0_OR_GREATER
    [Theory]
    [InlineData("instant")]
    [InlineData("offset")]
    public async Task DateSorts_SqlWithoutExplicitPrecisionMappingFailsClearly(string column) {
        using var fixture = new Fixture(3, new[] {
            new Record { Id = 1, Instant = Epoch.AddTicks(9000), Offset = new DateTimeOffset(Epoch.AddTicks(9000)) },
            new Record { Id = 2, Instant = Epoch.AddTicks(1000), Offset = new DateTimeOffset(Epoch.AddTicks(1000)) }
        });
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => fixture.Handler.QueryAsync("{\"sort\":[{\"column\":\"" + column + "\",\"direction\":\"asc\"}]}"));
        Assert.Equal(CanopyRequestError.Unsupported, error.Error);
        Assert.Contains("SortBy", error.Message);
        var exportError = await Assert.ThrowsAsync<CanopyRequestException>(() => fixture.Handler.PrepareExportAsync(
            "{\"scope\":\"all\",\"revision\":\"live\",\"query\":{\"sort\":[{\"column\":\"" + column + "\",\"direction\":\"asc\"}]}}", "csv"));
        Assert.Equal(CanopyRequestError.Unsupported, exportError.Error);
    }

    [Fact]
    public async Task DateSorts_SqlCanUseIndexedHostMillisecondKeys() {
        using var fixture = new Fixture(3, new[] {
            new Record { Id = 1, Instant = Epoch.AddTicks(9000), InstantMilliseconds = 0, Offset = new DateTimeOffset(Epoch.AddTicks(9000)).ToOffset(TimeSpan.FromHours(2)), OffsetMilliseconds = 0 },
            new Record { Id = 2, Instant = Epoch.AddTicks(1000), InstantMilliseconds = 0, Offset = new DateTimeOffset(Epoch.AddTicks(1000)), OffsetMilliseconds = 0 },
            new Record { Id = 3, Instant = Epoch.AddMilliseconds(1), InstantMilliseconds = 1, Offset = new DateTimeOffset(Epoch.AddMilliseconds(1)), OffsetMilliseconds = 1 },
            new Record { Id = 4 }
        }, dateSortKeys: true);
        foreach (var column in new[] { "instant", "offset" }) {
            Assert.Equal(new[] { "1", "2", "3", "4" }, await Ids(fixture.Handler, "{\"sort\":[{\"column\":\"" + column + "\",\"direction\":\"asc\"}]}"));
            Assert.Equal(new[] { "3", "1", "2", "4" }, await Ids(fixture.Handler, "{\"sort\":[{\"column\":\"" + column + "\",\"direction\":\"desc\"}]}"));
            Assert.Equal(new[] { "2" }, await Ids(fixture.Handler, "{\"offset\":1,\"limit\":1,\"sort\":[{\"column\":\"" + column + "\",\"direction\":\"asc\"}]}"));
        }
    }
#endif

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
#if NET10_0_OR_GREATER
    [InlineData(3)]
#endif
    public async Task FlagCombinations_SearchFilterAndFacetTheirEmittedText(int backend) {
        using var fixture = new Fixture(backend, new[] {
            new Record { Id = 1, Access = Access.Read | Access.Write },
            new Record { Id = 2, Access = Access.Read },
            new Record { Id = 3, Access = Access.Write },
            new Record { Id = 4, Access = Access.None }
        });
        Assert.Equal(new[] { "1", "2" }, await Ids(fixture.Handler, "{\"search\":\"canread\"}"));
        Assert.Equal(new[] { "1", "2" }, await Ids(fixture.Handler, Filter("access", "contains", "\"CANREAD\"")));
        Assert.Equal(new[] { "1" }, await Ids(fixture.Handler, Filter("access", "eq", "\"CanRead, Write\"")));
        Assert.Equal(new[] { "2", "1", "4", "3" }, await Ids(fixture.Handler, "{\"sort\":[{\"column\":\"access\",\"direction\":\"asc\"}]}"));
        using var facets = JsonDocument.Parse(await fixture.Handler.FacetAsync("{\"column\":\"access\",\"search\":\"write\",\"limit\":1,\"query\":{\"revision\":\"live\"}}"));
        Assert.Equal(2, facets.RootElement.GetProperty("totalValues").GetInt32());
        Assert.True(facets.RootElement.GetProperty("truncated").GetBoolean());
        Assert.Equal("CanRead, Write", facets.RootElement.GetProperty("items")[0].GetProperty("value").GetString());
        Assert.Equal(1, facets.RootElement.GetProperty("items")[0].GetProperty("count").GetInt32());
    }

    [Fact]
    public void FlagMapping_RejectsDomainsThatCannotBeBoundedForSql() {
        var view = new CanopyDataGridView("flags", "Flags");
        view.Columns.Add(new CanopyColumn("flags", "Flags"));
        var map = new CanopyColumnMap<LargeFlagsRecord>(view).Key(row => row.Id);
        var error = Assert.Throws<ArgumentException>(() => map.Column("flags", row => row.Flags));
        Assert.Contains("at most eight bits", error.Message);
    }

    [Fact]
    public async Task FormattedRealCells_NonFiniteValuesStayMissingWithoutDisplayedZero() {
        var rows = new[] {
            new FormatRecord { Id = 1, Single = 10, Double = 20, OptionalSingle = 30, OptionalDouble = 40 },
            new FormatRecord { Id = 2, Single = float.NaN, Double = double.NaN, OptionalSingle = float.NaN, OptionalDouble = double.NaN },
            new FormatRecord { Id = 3, Single = float.PositiveInfinity, Double = double.PositiveInfinity, OptionalSingle = float.PositiveInfinity, OptionalDouble = double.PositiveInfinity },
            new FormatRecord { Id = 4, Single = float.NegativeInfinity, Double = double.NegativeInfinity }
        };
        var view = new CanopyDataGridView("formatted", "Formatted");
        foreach (var id in new[] { "single", "double", "optionalSingle", "optionalDouble" })
            view.Columns.Add(new CanopyColumn(id, id) { Kind = CanopyColumnKind.Number });
        var nonnullableCalls = 0;
        var nullableMissingCalls = 0;
        CanopyCell Unit(double value) { nonnullableCalls++; return new CanopyCell(value) { Text = value.ToString(CultureInfo.InvariantCulture) + " GB" }; }
        CanopyCell? Optional(double? value) {
            if (!value.HasValue) { nullableMissingCalls++; return null; }
            return new CanopyCell(value.Value) { Text = value.Value.ToString(CultureInfo.InvariantCulture) + " GB" };
        }
        var map = new CanopyColumnMap<FormatRecord>(view).Key(row => row.Id)
            .Column("single", row => row.Single, column => column.Cell(value => Unit(value)))
            .Column("double", row => row.Double, column => column.Cell(Unit))
            .Column("optionalSingle", row => row.OptionalSingle, column => column.Cell(value => Optional(value)))
            .Column("optionalDouble", row => row.OptionalDouble, column => column.Cell(Optional));
        var provider = new CanopyQueryableProvider<FormatRecord>(rows.AsQueryable(), map);
        var page = await provider.QueryAsync(new CanopyDataRequest(map.Schema), default);
        Assert.Equal("10 GB", page.Rows[0].Cells["single"]!.Text);
        Assert.Equal("20 GB", page.Rows[0].Cells["double"]!.Text);
        Assert.Equal("30 GB", page.Rows[0].Cells["optionalSingle"]!.Text);
        Assert.Equal("40 GB", page.Rows[0].Cells["optionalDouble"]!.Text);
        Assert.All(page.Rows.Skip(1), row => Assert.All(row.Cells.Values, cell => Assert.Null(cell)));
        Assert.Equal(2, nonnullableCalls);
        Assert.Equal(6, nullableMissingCalls);
    }

    private static string Filter(string column, string op, string value) => "{\"filters\":[{\"column\":\"" + column + "\",\"operator\":\"" + op + "\",\"values\":[" + value + "]}]}";

    private static async Task<string[]> Ids(CanopyRemoteHandler handler, string request) {
        using var page = JsonDocument.Parse(await handler.QueryAsync(request));
        return page.RootElement.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("id").GetString()!).ToArray();
    }

    [Flags]
    public enum Access { None = 0, [EnumMember(Value = "CanRead")] Read = 1, Write = 2, Execute = 4 }
    [Flags]
    private enum LargeFlags { All = 511 }
    private sealed class LargeFlagsRecord { public int Id { get; set; } public LargeFlags Flags { get; set; } }
    public sealed class Record {
        public int Id { get; set; }
        public float? Single { get; set; }
        public decimal? Amount { get; set; }
        public DateTime? Instant { get; set; }
        public DateTimeOffset? Offset { get; set; }
        public long? InstantMilliseconds { get; set; }
        public long? OffsetMilliseconds { get; set; }
        public Access Access { get; set; }
    }
    private sealed class FormatRecord {
        public int Id { get; set; }
        public float Single { get; set; }
        public double Double { get; set; }
        public float? OptionalSingle { get; set; }
        public double? OptionalDouble { get; set; }
    }

    private sealed class Fixture : IDisposable {
#if NET10_0_OR_GREATER
        private readonly SqliteConnection? _connection;
        private readonly ProtocolDb? _database;
#endif
        internal Fixture(int backend, IReadOnlyList<Record> records, bool dateSortKeys = false) {
            var view = new CanopyDataGridView("protocol", "Protocol") { Source = CanopyGridSource.HostedOffset(), Reporting = new CanopyGridReporting() };
            foreach (var id in new[] { "single", "amount", "instant", "offset", "access" }) {
                view.Columns.Add(new CanopyColumn(id, id) { Kind = id == "single" || id == "amount" ? CanopyColumnKind.Number : id == "access" ? CanopyColumnKind.Text : CanopyColumnKind.DateTime, Sortable = true });
                view.Reporting.FacetColumns.Add(id);
            }
            view.SearchColumns.Add("access");
            var map = new CanopyColumnMap<Record>(view).Key(row => row.Id)
                .Column("single", row => row.Single).Column("amount", row => row.Amount)
                .Column("instant", row => row.Instant, column => { if (dateSortKeys) column.SortBy(row => row.InstantMilliseconds); })
                .Column("offset", row => row.Offset, column => { if (dateSortKeys) column.SortBy(row => row.OffsetMilliseconds); })
                .Column("access", row => row.Access);
            IQueryable<Record> source = records.AsQueryable();
#if NET10_0_OR_GREATER
            if (backend == 3) {
                _connection = new SqliteConnection("Data Source=:memory:");
                _connection.Open();
                _database = new ProtocolDb(new DbContextOptionsBuilder<ProtocolDb>().UseSqlite(_connection).Options);
                _database.Database.EnsureCreated();
                _database.Records.AddRange(records);
                _database.SaveChanges();
                source = _database.Records;
            }
#endif
            ICanopyDataProvider provider = backend == 0
                ? new CanopyInMemoryProvider<Record>(map.Schema, () => records, row => row.Id.ToString(CultureInfo.InvariantCulture), new Dictionary<string, Func<Record, object?>> {
                    ["single"] = row => row.Single, ["amount"] = row => row.Amount, ["instant"] = row => row.Instant, ["offset"] = row => row.Offset, ["access"] = row => row.Access
                }, () => "live")
                : new CanopyQueryableProvider<Record>(source, map, new CanopyQueryOptions { TextComparison = backend == 2 ? CanopyTextComparison.Lowercase : CanopyTextComparison.Auto });
            Handler = new CanopyRemoteHandler(map.Schema, provider);
        }
        internal CanopyRemoteHandler Handler { get; }
        public void Dispose() {
#if NET10_0_OR_GREATER
            _database?.Dispose(); _connection?.Dispose();
#endif
        }
    }
#if NET10_0_OR_GREATER
    private sealed class ProtocolDb : DbContext {
        internal ProtocolDb(DbContextOptions<ProtocolDb> options) : base(options) { }
        public DbSet<Record> Records => Set<Record>();
        protected override void OnModelCreating(ModelBuilder modelBuilder) {
            modelBuilder.Entity<Record>().HasIndex(row => row.InstantMilliseconds);
            modelBuilder.Entity<Record>().HasIndex(row => row.OffsetMilliseconds);
        }
    }
#endif
}
