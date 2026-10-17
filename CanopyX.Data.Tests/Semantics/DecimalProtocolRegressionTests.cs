using System.Globalization;
using System.Text.Json;
using Xunit;
using Xunit.Abstractions;
#if NET10_0_OR_GREATER
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
#endif

namespace CanopyX.Data.Tests;

/// <summary>Decimal numeric operations use the binary64 value read from emitted JSON, on every provider.</summary>
public sealed class DecimalProtocolRegressionTests {
    private readonly ITestOutputHelper _output;
    public DecimalProtocolRegressionTests(ITestOutputHelper output) { _output = output; }
    private const decimal Boundary = 10000000000000.099609375m;
    private const decimal EqualWire = 10000000000000.1m;
    private const decimal LowerWire = 10000000000000.09765625m;
    private const long WireBits = 4801453603149578291L;

    public static TheoryData<int> Backends => new TheoryData<int> { 0, 1
#if NET10_0_OR_GREATER
        , 2
#endif
    };

    [Theory]
    [InlineData("10000000000000.099609375", "10000000000000.1", WireBits)]
    [InlineData("-10000000000000.099609375", "-10000000000000.1", -4421918433705197517L)]
    [InlineData("0.0000000000000000000000000001", "1e-28", 4188260752279232537L)]
    [InlineData("10000000000000.0986328125", "10000000000000.098", WireBits - 1)]
    [InlineData("10000000000000.1005859375", "10000000000000.102", WireBits + 1)]
    [InlineData("9007199254740990.5", "9007199254740990", 4845873199050653694L)]
    [InlineData("0.0000000000000000000000000000", "0", 0L)]
    [InlineData("1.0000000000000000000000000000", "1", 4607182418800017408L)]
    public void DecimalSearchText_AgreesWithTheWireNumber(string exact, string expectedText, long expectedBits) {
        var value = decimal.Parse(exact, CultureInfo.InvariantCulture);
        var view = new CanopyDataGridView("wire", "Wire");
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Rows.Add(new CanopyGridRow("one") { Cells = { ["amount"] = new CanopyCell(value) } });
        var emitted = view.ToJson();
        _output.WriteLine("decimal-wire:" + emitted);
        using var json = JsonDocument.Parse(emitted);
        var wire = json.RootElement.GetProperty("rows")[0].GetProperty("cells").GetProperty("amount");
        Assert.Equal(value, wire.GetDecimal());
#if NET10_0_OR_GREATER
        // .NET Framework's JSON number parser misrounds some exact halfway texts; independent Node receipts cover those bytes.
        Assert.Equal(expectedBits, BitConverter.DoubleToInt64Bits(wire.GetDouble()));
#endif
        Assert.Equal(0, new CanopyGridGrouping("amount").CreateComparer(view).Compare(new CanopyCell(value), new CanopyCell(BitConverter.Int64BitsToDouble(expectedBits))));
        Assert.Equal(expectedText, CanopyDataValues.ToSearchText(value));
        // Identities remain exact text; this protocol correction only changes numeric-cell operations.
        Assert.Equal(exact, CanopyDataValues.FormatId(value));
    }

    [Theory]
    [InlineData("79228162514264337593543950335", 5039527983027585024L)]
    [InlineData("-79228162514264337593543950335", -4183844053827190784L)]
    public void DecimalCoefficientEndpoints_SearchTextRetainsTheIndependentBinary64Value(string exact, long expectedBits) {
        var value = decimal.Parse(exact, CultureInfo.InvariantCulture);
        var text = CanopyDataValues.ToSearchText(value)!;
        _output.WriteLine("decimal-endpoint:" + text);
        using var json = JsonDocument.Parse(text);
        Assert.Equal(expectedBits, BitConverter.DoubleToInt64Bits(json.RootElement.GetDouble()));
        Assert.Equal(exact, CanopyDataValues.FormatId(value));
    }

    [Theory, MemberData(nameof(Backends))]
    public async Task DecimalFiltersAndPageTies_AgreeWithEmittedCells(int backend) {
        using var fixture = new Fixture(backend);
        using var initial = JsonDocument.Parse(await fixture.Handler.QueryAsync("{}"));
        var items = initial.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(WireBits, BitConverter.DoubleToInt64Bits(items[0].GetProperty("cells").GetProperty("amount").GetDouble()));
        Assert.Equal(WireBits, BitConverter.DoubleToInt64Bits(items[1].GetProperty("cells").GetProperty("amount").GetDouble()));
        Assert.Equal(new[] { "1", "2" }, await fixture.Ids("{\"filters\":[{\"column\":\"amount\",\"operator\":\"eq\",\"values\":[10000000000000.1]}]}"));
        Assert.Equal(new[] { "3" }, await fixture.Ids("{\"filters\":[{\"column\":\"amount\",\"operator\":\"lt\",\"values\":[10000000000000.1]}]}"));
        Assert.Equal(new[] { "1" }, await fixture.Ids("{\"offset\":1,\"limit\":1,\"sort\":[{\"column\":\"amount\",\"direction\":\"asc\"}]}"));
    }

    [Theory, MemberData(nameof(Backends))]
    public async Task DecimalFacets_MergeWireValuesBeforeCountsOrderAndSearch(int backend) {
        using var fixture = new Fixture(backend);
        using var all = JsonDocument.Parse(await fixture.Handler.FacetAsync("{\"column\":\"amount\",\"limit\":2,\"query\":{\"revision\":\"r1\"}}"));
        var root = all.RootElement;
        Assert.Equal(4, root.GetProperty("matched").GetInt32());
        Assert.Equal(3, root.GetProperty("totalValues").GetInt32());
        Assert.True(root.GetProperty("truncated").GetBoolean());
        var buckets = root.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(new[] { 1, 2 }, buckets.Select(item => item.GetProperty("count").GetInt32()));
        Assert.Equal(WireBits - 1, BitConverter.DoubleToInt64Bits(buckets[0].GetProperty("value").GetDouble()));
        Assert.Equal(WireBits, BitConverter.DoubleToInt64Bits(buckets[1].GetProperty("value").GetDouble()));
        using var search = JsonDocument.Parse(await fixture.Handler.FacetAsync("{\"column\":\"amount\",\"search\":\".1\",\"limit\":1,\"query\":{\"revision\":\"r1\"}}"));
        Assert.Equal(1, search.RootElement.GetProperty("totalValues").GetInt32());
        Assert.Equal(2, search.RootElement.GetProperty("items")[0].GetProperty("count").GetInt32());
        Assert.Equal(WireBits, BitConverter.DoubleToInt64Bits(search.RootElement.GetProperty("items")[0].GetProperty("value").GetDouble()));
    }

    [Theory, MemberData(nameof(Backends))]
    public async Task DecimalAggregates_ReadWireNumbersAndCountWireDistinctValues(int backend) {
        using var fixture = new Fixture(backend);
        using var one = JsonDocument.Parse(await fixture.Handler.SummaryAsync("{\"revision\":\"r1\",\"filters\":[{\"column\":\"id\",\"operator\":\"eq\",\"values\":[2]}]}"));
        var values = one.RootElement.GetProperty("aggregates");
        foreach (var op in new[] { "sum", "avg", "min", "max" }) Assert.Equal(WireBits, BitConverter.DoubleToInt64Bits(values.GetProperty(op).GetDouble()));
        using var all = JsonDocument.Parse(await fixture.Handler.SummaryAsync("{\"revision\":\"r1\"}"));
        Assert.Equal(2, all.RootElement.GetProperty("aggregates").GetProperty("distinct").GetInt32());
        Assert.Equal(3, all.RootElement.GetProperty("aggregates").GetProperty("count").GetInt32());
    }

    [Theory, MemberData(nameof(Backends))]
    public async Task DecimalGroups_MergeWireKeysAndReconstructTheSamePageWindow(int backend) {
        using var fixture = new Fixture(backend);
        const string grouping = "\"groupBy\":[{\"column\":\"amount\",\"direction\":\"asc\"}]";
        using var summary = JsonDocument.Parse(await fixture.Handler.SummaryAsync("{\"revision\":\"r1\"," + grouping + "}"));
        var groups = summary.RootElement.GetProperty("groups").EnumerateArray().ToArray();
        Assert.Equal(3, groups.Length);
        Assert.Equal(new[] { 1, 2, 1 }, groups.Select(group => group.GetProperty("count").GetInt32()));
        Assert.Equal(WireBits, BitConverter.DoubleToInt64Bits(groups[1].GetProperty("value").GetDouble()));
        Assert.Equal(new[] { "1", "2" }, await fixture.Ids("{\"offset\":1,\"limit\":2," + grouping + "}"));
    }

    [Fact]
    public async Task TypedDecimalCommit_PassesWireNumbersAndOriginalsToTheWriter() {
        var view = View(); view.Columns[1].Editable = true;
        var map = new CanopyColumnMap<Record>(view).Key(row => row.Id).Column("id", row => row.Id).Column("amount", row => row.Amount);
        var writer = new RecordingWriter();
        var provider = new CanopyQueryableProvider<Record>(new[] { new Record { Id = 1, Amount = Boundary } }.AsQueryable(), map,
            new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        var handler = new CanopyRemoteHandler(map.Schema, provider, writer: writer);
        var row = new CanopyCommitRow("1", new Dictionary<string, object?> { ["amount"] = Boundary }, new Dictionary<string, object?> { ["amount"] = Boundary });
        using var result = JsonDocument.Parse(await handler.CommitAsync(new CanopyCommitBatch(map.Schema, "r1", new[] { row })));
        Assert.Equal("saved", result.RootElement.GetProperty("rows")[0].GetProperty("status").GetString());
        var received = Assert.Single(writer.Batch!.Rows);
        Assert.Equal(WireBits, BitConverter.DoubleToInt64Bits(Assert.IsType<double>(received.Values["amount"])));
        Assert.Equal(WireBits, BitConverter.DoubleToInt64Bits(Assert.IsType<double>(received.Original["amount"])));
    }

    private sealed class RecordingWriter : ICanopyDataWriter {
        public CanopyCommitTransaction Transaction => CanopyCommitTransaction.PerRow;
        public CanopyCommitBatch? Batch { get; private set; }
        public ValueTask<CanopyCommitResult> CommitAsync(CanopyCommitBatch batch, string revision, CancellationToken cancellationToken) {
            Batch = batch;
            return new ValueTask<CanopyCommitResult>(new CanopyCommitResult(batch.Rows.Select(row => CanopyCommitRowResult.Saved(row.Id)), revision));
        }
    }

    [Theory]
    [InlineData("10000000000000.1005859375")]
    [InlineData("10000000000000.1005859375e0")]
    [InlineData("100000000000001.005859375e-1")]
    [InlineData("10000000000000.100585937500000000000")]
    public async Task RawDecimalOperand_UsesTheBinary64ValueOfItsExactJsonText(string operand) {
        var map = new CanopyColumnMap<Record>(View()).Key(row => row.Id).Column("id", row => row.Id).Column("amount", row => row.Amount);
        var provider = new CanopyQueryableProvider<Record>(new[] { new Record { Id = 1, Amount = 10000000000000.1015625m } }.AsQueryable(), map);
        var handler = new CanopyRemoteHandler(map.Schema, provider);
        using var page = JsonDocument.Parse(await handler.QueryAsync("{\"filters\":[{\"column\":\"amount\",\"operator\":\"eq\",\"values\":[" + operand + "]}]}"));
        Assert.Equal(1, page.RootElement.GetProperty("matched").GetInt32());
    }

    [Theory]
    [InlineData("1e-100")]
    [InlineData("1.0000000000000001110223024625156541")]
    public void OtherNumericOperands_PreserveTheNativeNumberWithoutDecimalUnderflowOrRounding(string token) {
        using var native = JsonDocument.Parse(token);
        var expected = native.RootElement.GetDouble();
        var schema = new CanopyDataSchema(View());
        var request = CanopyRequestParser.ParseQuery("{\"filters\":[{\"column\":\"amount\",\"operator\":\"eq\",\"values\":[" + token + "]}]}", schema);
        var actual = Assert.IsType<double>(Assert.IsType<CanopyFilterCondition>(request.Filter).Values[0]);
        Assert.Equal(BitConverter.DoubleToInt64Bits(expected), BitConverter.DoubleToInt64Bits(actual));
        if (token == "1e-100") Assert.NotEqual(0, actual);
    }

    [Theory]
    [InlineData("10000000000000.1005859375")]
    [InlineData("100000000000001.005859375e-1")]
    public async Task RawDecimalCommit_UsesWireNumbersForChangedValuesAndOriginals(string token) {
        var view = View(); view.Columns[1].Editable = true;
        var map = new CanopyColumnMap<Record>(view).Key(row => row.Id).Column("id", row => row.Id).Column("amount", row => row.Amount);
        var writer = new RecordingWriter();
        var provider = new CanopyQueryableProvider<Record>(new[] { new Record { Id = 1 } }.AsQueryable(), map,
            new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        var handler = new CanopyRemoteHandler(map.Schema, provider, writer: writer);
        using var result = JsonDocument.Parse(await handler.CommitAsync("{\"revision\":\"r1\",\"rows\":[{\"id\":\"1\",\"values\":{\"amount\":" + token + "},\"original\":{\"amount\":" + token + "}}]}"));
        Assert.Equal("saved", result.RootElement.GetProperty("rows")[0].GetProperty("status").GetString());
        var received = Assert.Single(writer.Batch!.Rows);
        Assert.Equal(WireBits + 1, BitConverter.DoubleToInt64Bits(Assert.IsType<double>(received.Values["amount"])));
        Assert.Equal(WireBits + 1, BitConverter.DoubleToInt64Bits(Assert.IsType<double>(received.Original["amount"])));
    }

    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("decimal", "Decimal") { Source = CanopyGridSource.HostedOffset(), Reporting = new CanopyGridReporting { Groupable = true } };
        view.Columns.Add(new CanopyColumn("id", "Id") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Reporting.FacetColumns.Add("amount");
        foreach (var item in new[] { ("sum", CanopyGridAggregateOperation.Sum), ("avg", CanopyGridAggregateOperation.Average),
            ("min", CanopyGridAggregateOperation.Minimum), ("max", CanopyGridAggregateOperation.Maximum),
            ("distinct", CanopyGridAggregateOperation.DistinctCount), ("count", CanopyGridAggregateOperation.Count) })
            view.Reporting.Aggregates.Add(new CanopyGridAggregate(item.Item1, "amount", item.Item2, item.Item1));
        return view;
    }

    private sealed class Fixture : IDisposable {
        private readonly List<Record> _rows = new List<Record> { new Record { Id = 1, Amount = EqualWire }, new Record { Id = 2, Amount = Boundary }, new Record { Id = 3, Amount = LowerWire }, new Record { Id = 4 } };
#if NET10_0_OR_GREATER
        private readonly SqliteConnection? _connection;
        private readonly DecimalDb? _database;
#endif
        public Fixture(int backend) {
            var map = new CanopyColumnMap<Record>(View()).Key(row => row.Id).Column("id", row => row.Id).Column("amount", row => row.Amount);
            ICanopyDataProvider provider;
            if (backend == 0) provider = new CanopyInMemoryProvider<Record>(map.Schema, () => _rows, row => row.Id.ToString(CultureInfo.InvariantCulture),
                new Dictionary<string, Func<Record, object?>> { ["id"] = row => row.Id, ["amount"] = row => row.Amount }, () => "r1");
            else {
                IQueryable<Record> source = _rows.AsQueryable();
#if NET10_0_OR_GREATER
                if (backend == 2) {
                    _connection = new SqliteConnection("Data Source=:memory:;Pooling=False"); _connection.Open();
                    _database = new DecimalDb(new DbContextOptionsBuilder<DecimalDb>().UseSqlite(_connection).Options);
                    _database.Database.EnsureCreated(); _database.Rows.AddRange(_rows); _database.SaveChanges(); source = _database.Rows;
                }
#endif
                provider = new CanopyQueryableProvider<Record>(source, map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
            }
            Handler = new CanopyRemoteHandler(map.Schema, provider);
        }
        public CanopyRemoteHandler Handler { get; }
        public async Task<string[]> Ids(string request) {
            using var page = JsonDocument.Parse(await Handler.QueryAsync(request));
            return page.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetString()!).ToArray();
        }
        public void Dispose() {
#if NET10_0_OR_GREATER
            _database?.Dispose(); _connection?.Dispose();
#endif
        }
    }
    private sealed class Record { public int Id { get; set; } public decimal? Amount { get; set; } }
#if NET10_0_OR_GREATER
    private sealed class DecimalDb : DbContext {
        public DecimalDb(DbContextOptions<DecimalDb> options) : base(options) { }
        public DbSet<Record> Rows => Set<Record>();
    }
#endif
}
