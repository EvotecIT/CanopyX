using System.Globalization;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class PivotQueryTests {
    [Theory]
    [InlineData(2, 200)]
    [InlineData(2, 3)]
    [InlineData(4, 200)]
    [InlineData(4, 3)]
    public async Task AllBuiltinsMatchRawRecordsAtEveryPrefixAndOtherWithOneGroupedSelect(int rowDepth, int cap) {
        var hosts = Records(); var view = View(); var definition = Definition(view, rowDepth, cap);
        using var store = new SqliteFleet(hosts); using var database = store.Create(log: true);
        var map = Fleet.Map(view);
        var sql = new CanopyQueryableProvider<Host>(() => database.Hosts, map, Options());
        foreach (var kind in new[] { ProviderKind.Reference, ProviderKind.Linq }) {
            var harness = new Harness(hosts, kind, view: view);
            var request = new CanopyPivotRequest(CanopyRequestParser.ParseQuery("{}", harness.Schema), definition);
            var result = await ((ICanopyPivotProvider)harness.Provider).PivotAsync(request, CancellationToken.None);
            AssertRecords(hosts, view, definition, result);
        }
        var actual = await sql.PivotAsync(new CanopyPivotRequest(CanopyRequestParser.ParseQuery("{}", map.Schema), definition), CancellationToken.None);
        AssertRecords(hosts, view, definition, actual);
        AssertGroupedSelect(store);
        Assert.Contains(actual.Rows, node => node.Path.Any(cell => cell == null));
        Assert.Contains(actual.Columns, node => node.Path.Any(cell => cell == null) || node.Other);
        Assert.Contains(actual.Rows, node => node.Path.Count == rowDepth);
        Assert.Equal(cap == 3, actual.ColumnsLimited);
    }

    [Fact]
    public async Task RemotePivotAppliesAcceptedCriteriaBeforeGroupingAndIgnoresPageWindow() {
        var hosts = Records(); var view = View();
        using var store = new SqliteFleet(hosts); using var database = store.Create(log: true);
        var map = Fleet.Map(view); var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, Options());
        var handler = new CanopyRemoteHandler(map.Schema, provider);
        const string query = """
            {"revision":"r1","offset":100,"limit":1,"search":"host","filters":[{"column":"memory","operator":"ge","values":[0]}],
             "filterGroup":{"operator":"or","filters":[{"column":"site","operator":"eq","values":["East"]},{"column":"site","operator":"isNull","values":[]}]},
             "tupleFilters":[{"columns":[{"column":"online"}],"values":[[true]],"exclude":false}],"groupBy":[{"column":"os","direction":"desc"}]}
            """;
        var requestJson = Envelope(query, """{"rows":[{"column":"site","direction":"asc"}],"columns":[{"column":"os","direction":"asc"}],"values":["coreCount","coresAvg","coresDistinct"]} """);
        var parsed = CanopyRequestParser.ParsePivot(requestJson, map.Schema);
        var accepted = hosts.Where(host => host.Name.Contains("host", StringComparison.OrdinalIgnoreCase) && host.Memory >= 0 &&
            (host.Site == "East" || host.Site == null) && host.Online).ToArray();
        Assert.NotEmpty(accepted);
        using var response = JsonDocument.Parse(await handler.PivotAsync(parsed));
        Assert.Equal(accepted.Length, response.RootElement.GetProperty("matched").GetInt32());
        Assert.Equal("gridPivot", response.RootElement.GetProperty("type").GetString());
        Assert.Equal("canopyx/2", response.RootElement.GetProperty("protocol").GetString());
        Assert.Equal("r1", response.RootElement.GetProperty("revision").GetString());
        var echo = response.RootElement.GetProperty("query");
        Assert.Equal(0, echo.GetProperty("offset").GetInt32());
        Assert.Equal(1, echo.GetProperty("limit").GetInt32());
        Assert.Equal("host", echo.GetProperty("search").GetString());
        Assert.Single(CanopyRequestParser.ParseQuery(echo.GetRawText(), map.Schema).TupleFilters);
        AssertGroupedSelect(store);
        store.Sql.Clear();
        var result = await provider.PivotAsync(parsed, CancellationToken.None);
        AssertRecords(accepted, view, parsed.Definition, result);
        AssertGroupedSelect(store);
        foreach (var kind in new[] { ProviderKind.Reference, ProviderKind.Linq }) {
            var harness = new Harness(hosts, kind, view: view);
            using var other = JsonDocument.Parse(await harness.Handler.PivotAsync(requestJson));
            Assert.Equal(accepted.Length, other.RootElement.GetProperty("matched").GetInt32());
            Assert.Single(CanopyRequestParser.ParseQuery(other.RootElement.GetProperty("query").GetRawText(), harness.Schema).TupleFilters);
        }
    }

    [Fact]
    public async Task DefaultCapKeeps199PathsAndExactOtherAcrossMoreThan200Columns() {
        var hosts = Fleet.Hosts(207);
        for (var i = 0; i < hosts.Count; i++) { hosts[i].Site = "C" + i.ToString("D3"); hosts[i].Cores = i % 7 == 0 ? null : i % 5; }
        var view = View(); var definition = new CanopyGridPivot { Columns = { new("site") }, Values = { "coresSum", "coresAvg", "coresDistinct", "coreCount" } };
        using var store = new SqliteFleet(hosts); using var database = store.Create(log: true);
        var map = Fleet.Map(view); var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, Options());
        var result = await provider.PivotAsync(new CanopyPivotRequest(new CanopyDataRequest(map.Schema), definition), CancellationToken.None);
        Assert.True(result.ColumnsLimited); Assert.Equal(207, result.DistinctColumns);
        Assert.Equal(199, result.RetainedColumns.Count);
        Assert.Equal(200, result.Columns.Count(node => node.Parent != null));
        var other = Assert.Single(result.Columns, node => node.Other);
        Assert.Equal(8, result.GetCell("r", other.Key).Count);
        AssertRecords(hosts, view, definition, result);
        AssertGroupedSelect(store);
    }

    [Fact]
    public async Task EmptyAcceptedQueryProducesZeroCountsAndMissingNumericValuesWithoutPhantomAxes() {
        var hosts = Records(); var view = View(); var definition = Definition(view, 4, 3);
        using var store = new SqliteFleet(hosts); using var database = store.Create(log: true);
        var map = Fleet.Map(view); var sql = new CanopyQueryableProvider<Host>(() => database.Hosts, map, Options());
        var query = CanopyRequestParser.ParseQuery("{\"search\":\"no-such-host\"}", map.Schema);
        var result = await sql.PivotAsync(new CanopyPivotRequest(query, definition), CancellationToken.None);
        AssertRecords(Array.Empty<Host>(), view, definition, result);
        Assert.Single(result.Rows); Assert.Single(result.Columns); Assert.Empty(result.RetainedColumns);
        Assert.Equal(0, result.DistinctColumns); Assert.False(result.ColumnsLimited);
        AssertGroupedSelect(store);
        foreach (var kind in new[] { ProviderKind.Reference, ProviderKind.Linq }) {
            var harness = new Harness(hosts, kind, view: view);
            var empty = await ((ICanopyPivotProvider)harness.Provider).PivotAsync(new CanopyPivotRequest(CanopyRequestParser.ParseQuery("{\"search\":\"no-such-host\"}", harness.Schema), definition), CancellationToken.None);
            AssertRecords(Array.Empty<Host>(), view, definition, empty);
            Assert.Single(empty.Rows); Assert.Single(empty.Columns);
        }
    }

    [Fact]
    public async Task MonthAndWidthBucketAxesMatchIndependentBoundaryMembership() {
        var hosts = Records();
        var dates = new DateTime?[] { new(2025, 1, 31, 23, 59, 59), new(2025, 2, 1), new(2025, 2, 28), new(2025, 3, 1), null };
        var numbers = new double[] { -10.01, -10, -0.01, 0, 9.99, 10, 20 };
        for (var i = 0; i < hosts.Count; i++) { hosts[i].LastSeen = dates[i % dates.Length]; hosts[i].Memory = numbers[i % numbers.Length]; }
        var view = View(); var definition = new CanopyGridPivot {
            Rows = { new("memory", bucket: CanopyBucket.FixedWidth(10)) },
            Columns = { new("lastSeen", bucket: CanopyBucket.Calendar(CanopyBucketKind.Month)) },
            Values = { "coreCount", "coresAvg", "coresDistinct", "memorySum" }
        };
        using var store = new SqliteFleet(hosts); using var database = store.Create(log: true);
        var map = Fleet.Map(view);
        var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, Options());
        var result = await provider.PivotAsync(new CanopyPivotRequest(new CanopyDataRequest(map.Schema), definition), CancellationToken.None);
        AssertRecords(hosts, view, definition, result);
        Assert.Equal(new double?[] { -2, -1, 0, 1, 2 }, result.Rows.Where(node => node.Depth == 1).Select(node => (double?)node.Path[0]?.Value));
        Assert.Contains(result.Columns, node => node.Depth == 1 && node.Path[0] == null);
        foreach (var kind in new[] { ProviderKind.Reference, ProviderKind.Linq }) {
            var harness = new Harness(hosts, kind, view: view);
            AssertRecords(hosts, view, definition, await ((ICanopyPivotProvider)harness.Provider).PivotAsync(new CanopyPivotRequest(new CanopyDataRequest(harness.Schema), definition), CancellationToken.None));
        }
        AssertGroupedSelect(store);
    }

    [Theory]
    [InlineData("maxColumnsZero", "{\"rows\":[],\"columns\":[],\"values\":[\"coreCount\"],\"maxColumns\":0}")]
    [InlineData("maxColumnsOver", "{\"rows\":[],\"columns\":[],\"values\":[\"coreCount\"],\"maxColumns\":201}")]
    [InlineData("topNZero", "{\"rows\":[],\"columns\":[],\"values\":[\"coreCount\"],\"topNColumns\":0}")]
    [InlineData("topNOver", "{\"rows\":[],\"columns\":[],\"values\":[\"coreCount\"],\"topNColumns\":201}")]
    [InlineData("emptyValues", "{\"rows\":[],\"columns\":[],\"values\":[]}")]
    [InlineData("unknownAggregate", "{\"rows\":[],\"columns\":[],\"values\":[\"unmapped\"]}")]
    [InlineData("duplicateAggregate", "{\"rows\":[],\"columns\":[],\"values\":[\"coreCount\",\"coreCount\"]}")]
    [InlineData("unknownField", "{\"rows\":[],\"columns\":[],\"values\":[\"coreCount\"],\"sql\":\"ignored\"}")]
    [InlineData("duplicateField", "{\"rows\":[],\"columns\":[],\"values\":[\"coreCount\"],\"maxColumns\":1,\"maxColumns\":2}")]
    [InlineData("invalidDirection", "{\"rows\":[{\"column\":\"site\",\"direction\":\"sideways\"}],\"columns\":[],\"values\":[\"coreCount\"]}")]
    [InlineData("fiveRows", "{\"rows\":[{\"column\":\"site\",\"direction\":\"asc\"},{\"column\":\"os\",\"direction\":\"asc\"},{\"column\":\"online\",\"direction\":\"asc\"},{\"column\":\"owner\",\"direction\":\"asc\"},{\"column\":\"name\",\"direction\":\"asc\"}],\"columns\":[],\"values\":[\"coreCount\"]}")]
    [InlineData("threeColumns", "{\"rows\":[],\"columns\":[{\"column\":\"site\",\"direction\":\"asc\"},{\"column\":\"os\",\"direction\":\"asc\"},{\"column\":\"online\",\"direction\":\"asc\"}],\"values\":[\"coreCount\"]}")]
    public void ParserRejectsInvalidDefinition(string caseId, string definition) {
        Assert.NotEmpty(caseId);
        var schema = Fleet.Map(View()).Schema;
        Assert.Equal(CanopyRequestError.InvalidDocument, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParsePivot(Envelope("{\"revision\":\"r1\"}", definition), schema)).Error);
    }

    [Fact]
    public void ParserAndTypedRequestEnforceOptInAllowlistRevisionAndSnapshot() {
        const string definition = """{"rows":[{"column":"site","direction":"asc"}],"columns":[],"values":["coreCount"]}""";
        var schema = Fleet.Map(View()).Schema;
        Assert.Equal(CanopyRequestError.InvalidDocument, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParsePivot(Envelope("{}", definition), schema)).Error);
        Assert.Equal(CanopyRequestError.UnknownColumn, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParsePivot(Envelope("{\"revision\":\"r1\"}", definition.Replace("site", "secret")), schema)).Error);
        var disabled = Fleet.Map(Fleet.View()).Schema;
        Assert.Equal(CanopyRequestError.Unsupported, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParsePivot(Envelope("{\"revision\":\"r1\"}", definition), disabled)).Error);
        Assert.Equal(CanopyRequestError.Unsupported, Assert.Throws<CanopyRequestException>(() => new CanopyPivotRequest(new CanopyDataRequest(disabled), new CanopyGridPivot { Values = { "coreCount" } })).Error);
        var blocked = View(); blocked.Columns.Single(column => column.Id == "site").Filterable = false;
        Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParsePivot(Envelope("{\"revision\":\"r1\"}", definition), Fleet.Map(blocked).Schema));
        var unsortable = View(); unsortable.Columns.Single(column => column.Id == "site").Sortable = false;
        Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParsePivot(Envelope("{\"revision\":\"r1\"}", definition), Fleet.Map(unsortable).Schema));
        var original = Definition(View(), 4, 200);
        var request = new CanopyPivotRequest(new CanopyDataRequest(schema), original);
        original.Rows.Clear(); original.Values.Clear();
        var copy = request.Definition; copy.Columns.Clear();
        Assert.Equal(4, request.Definition.Rows.Count); Assert.Equal(2, request.Definition.Columns.Count); Assert.NotEmpty(request.Aggregates);
        foreach (var cap in new[] { 1, 200 }) {
            var boundary = CanopyRequestParser.ParsePivot(Envelope("{\"revision\":\"r1\"}", definition[..^1] + ",\"maxColumns\":" + cap + ",\"topNColumns\":" + cap + "}"), schema);
            Assert.Equal(cap, boundary.Definition.MaxColumns); Assert.Equal(cap, boundary.Definition.TopNColumns);
        }
    }

    [Fact]
    public void ParserAndTypedRequestAccept32ValuesAndReject33() {
        var view = View(); view.Reporting!.Aggregates.Clear();
        for (var i = 0; i < 32; i++) view.Reporting.Aggregates.Add(new CanopyGridAggregate("v" + i, "cores", CanopyGridAggregateOperation.Count, "Count " + i));
        var schema = Fleet.Map(view).Schema;
        var definition = new CanopyGridPivot(); foreach (var aggregate in view.Reporting.Aggregates) definition.Values.Add(aggregate.Id);
        Assert.Equal(32, new CanopyPivotRequest(new CanopyDataRequest(schema), definition).Aggregates.Count);
        var values = JsonSerializer.Serialize(definition.Values);
        var json = "{\"rows\":[],\"columns\":[],\"values\":" + values + "}";
        Assert.Equal(32, CanopyRequestParser.ParsePivot(Envelope("{\"revision\":\"r1\"}", json), schema).Aggregates.Count);
        definition.Values.Add("v0");
        Assert.Throws<InvalidOperationException>(() => new CanopyPivotRequest(new CanopyDataRequest(schema), definition));
        json = "{\"rows\":[],\"columns\":[],\"values\":" + JsonSerializer.Serialize(definition.Values) + "}";
        Assert.Equal(CanopyRequestError.InvalidDocument, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParsePivot(Envelope("{\"revision\":\"r1\"}", json), schema)).Error);
    }

    [Fact]
    public async Task RemotePivotRejectsRevisionChangedAfterItsSingleGroupedSelect() {
        var hosts = Records(); var view = View(); var reads = 0;
        using var store = new SqliteFleet(hosts); using var database = store.Create(log: true);
        var map = Fleet.Map(view);
        var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>(++reads == 1 ? "r1" : "r2") });
        var handler = new CanopyRemoteHandler(map.Schema, provider);
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.PivotAsync(new CanopyPivotRequest(new CanopyDataRequest(map.Schema, revision: "r1"), Definition(view, 2, 3))));
        Assert.Equal(CanopyRequestError.StaleRevision, error.Error); Assert.Equal(2, reads);
        AssertGroupedSelect(store);
    }

    [Fact]
    public async Task RemotePivotRejectsStaleRevisionAndCancellationWithoutReadingTheStore() {
        var hosts = Records(); var view = View();
        using var store = new SqliteFleet(hosts); using var database = store.Create(log: true);
        var map = Fleet.Map(view); var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, Options());
        var handler = new CanopyRemoteHandler(map.Schema, provider);
        var request = new CanopyPivotRequest(new CanopyDataRequest(map.Schema, revision: "old"), Definition(view, 2, 3));
        Assert.Equal(CanopyRequestError.StaleRevision, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.PivotAsync(request))).Error);
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => handler.PivotAsync(new CanopyPivotRequest(new CanopyDataRequest(map.Schema, revision: "r1"), request.Definition), cancelled.Token));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await provider.PivotAsync(new CanopyPivotRequest(new CanopyDataRequest(map.Schema), request.Definition), cancelled.Token));
        Assert.DoesNotContain(store.Sql, statement => statement.Contains("SELECT", StringComparison.OrdinalIgnoreCase));
    }

    internal static CanopyDataGridView View() {
        var view = Fleet.View(); view.Reporting!.Pivotable = true; view.Reporting.Groupable = true;
        view.Columns.Single(column => column.Id == "notes").Sortable = true;
        foreach (var operation in new[] { CanopyGridAggregateOperation.Sum, CanopyGridAggregateOperation.Average, CanopyGridAggregateOperation.DistinctCount })
            view.Reporting.Aggregates.Add(new CanopyGridAggregate(operation == CanopyGridAggregateOperation.Sum ? "coresSum" : operation == CanopyGridAggregateOperation.Average ? "coresAvg" : "coresDistinct", "cores", operation, operation.ToString()));
        foreach (var column in new[] { "site", "os", "owner", "online", "lastSeen" })
            view.Reporting.Aggregates.Add(new CanopyGridAggregate(column + "Distinct", column, CanopyGridAggregateOperation.DistinctCount, column));
        return view;
    }

    internal static CanopyGridPivot Definition(CanopyDataGridView view, int rows, int cap) {
        var definition = new CanopyGridPivot { MaxColumns = cap };
        foreach (var column in new[] { "site", "os", "online", "owner" }.Take(rows)) definition.Rows.Add(new CanopyGridGroupLevel(column));
        definition.Columns.Add(new CanopyGridGroupLevel("cores")); definition.Columns.Add(new CanopyGridGroupLevel("notes"));
        foreach (var value in view.Reporting!.Aggregates) definition.Values.Add(value.Id);
        return definition;
    }

    internal static List<Host> Records() {
        var hosts = Fleet.Hosts(24);
        for (var i = 0; i < hosts.Count; i++) {
            hosts[i].Site = i % 5 == 0 ? null : i % 3 == 0 ? "West" : "East";
            hosts[i].Os = (OsFamily)(i % 2); hosts[i].Cores = i % 5 == 0 ? null : i % 4 == 0 ? 20 : 2;
            hosts[i].Memory = i % 4 == 0 ? -5 : i + 1; hosts[i].Online = i % 3 != 0;
            hosts[i].Notes = i % 4 == 0 ? null : i % 3 == 0 ? "B" : "A";
            hosts[i].LastSeen = i % 4 == 0 ? null : Fleet.Epoch.AddDays(i % 3);
        }
        // Keep one grouped contribution heavier than its siblings, with different numeric inputs.
        // An average of group averages and a sum of child distinct counts must both fail the raw-record oracle.
        foreach (var host in hosts.Skip(21)) {
            var source = hosts[1];
            host.Site = source.Site; host.Os = source.Os; host.Online = source.Online; host.Owner = source.Owner; host.OwnerId = source.OwnerId;
            host.Cores = source.Cores; host.Notes = source.Notes; host.LastSeen = source.LastSeen;
        }
        return hosts;
    }

    internal static CanopyQueryOptions Options() => new() { Revision = token => { token.ThrowIfCancellationRequested(); return new ValueTask<string>("r1"); } };
    internal static string Envelope(string query, string definition) => "{\"protocol\":\"canopyx/2\",\"type\":\"gridPivotQuery\",\"query\":" + query + ",\"definition\":" + definition + "}";

    internal static void AssertGroupedSelect(SqliteFleet store) {
        var select = Assert.Single(store.Sql, statement => statement.Contains("Executed DbCommand", StringComparison.Ordinal) && statement.Contains("SELECT", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("GROUP BY", select, StringComparison.OrdinalIgnoreCase);
    }

    internal static void AssertRecords(IReadOnlyList<Host> hosts, CanopyDataGridView view, CanopyGridPivot definition, CanopyPivotResult result) {
        Assert.Equal(hosts.Count, result.Matched);
        var expectedRows = new HashSet<string>(StringComparer.Ordinal) { "[]" };
        foreach (var host in hosts) for (var depth = 1; depth <= definition.Rows.Count; depth++)
            expectedRows.Add(JsonSerializer.Serialize(definition.Rows.Take(depth).Select(level => AxisValue(host, level)).ToArray()));
        Assert.Equal(expectedRows.OrderBy(key => key, StringComparer.Ordinal), result.Rows.Select(node => JsonSerializer.Serialize(node.Path.Select(cell => cell?.Value).ToArray())).OrderBy(key => key, StringComparer.Ordinal));
        var distinctColumns = hosts.Select(host => JsonSerializer.Serialize(definition.Columns.Select(level => AxisValue(host, level)).ToArray())).Distinct(StringComparer.Ordinal).Count();
        Assert.Equal(distinctColumns, result.DistinctColumns);
        var requested = Math.Min(definition.MaxColumns, definition.TopNColumns ?? definition.MaxColumns);
        Assert.Equal(distinctColumns > requested, result.ColumnsLimited);
        Assert.Equal(distinctColumns > requested ? Math.Min(requested, definition.MaxColumns - 1) : distinctColumns, result.RetainedColumns.Count);
        foreach (var row in result.Rows) foreach (var column in result.Columns) {
            var accepted = hosts.Where(host => Prefix(row.Path, definition.Rows, host) && (column.Other
                ? !result.RetainedColumns.Any(path => Prefix(path, definition.Columns, host)) : Prefix(column.Path, definition.Columns, host))).ToArray();
            var cell = result.GetCell(row.Key, column.Key);
            Assert.True(accepted.Length == cell.Count, $"Count differs at {row.Key}/{column.Key}: expected {accepted.Length}, actual {cell.Count}.");
            foreach (var id in definition.Values) {
                var aggregate = view.Reporting!.Aggregates.Single(item => item.Id == id);
                var raw = accepted.Select(host => Read(host, aggregate.Column)).Where(value => value != null).ToArray();
                double? expected = aggregate.Operation switch {
                    CanopyGridAggregateOperation.Count => raw.Length,
                    CanopyGridAggregateOperation.DistinctCount => raw.Distinct().Count(),
                    _ when raw.Length == 0 => null,
                    CanopyGridAggregateOperation.Sum => raw.Sum(value => Convert.ToDouble(value, CultureInfo.InvariantCulture)),
                    CanopyGridAggregateOperation.Average => raw.Average(value => Convert.ToDouble(value, CultureInfo.InvariantCulture)),
                    CanopyGridAggregateOperation.Minimum => raw.Min(value => Convert.ToDouble(value, CultureInfo.InvariantCulture)),
                    CanopyGridAggregateOperation.Maximum => raw.Max(value => Convert.ToDouble(value, CultureInfo.InvariantCulture)),
                    _ => throw new InvalidOperationException("Unexpected fixture aggregate.")
                };
                var actual = cell.Aggregates[id];
                Assert.True(expected.HasValue == actual.HasValue, $"Null differs for {id} at {row.Key}/{column.Key}.");
                if (expected.HasValue) Assert.True(Math.Abs(expected.Value - actual!.Value) < 1e-8, $"{id} at {row.Key}/{column.Key}: expected {expected}, actual {actual}.");
            }
        }
    }

    private static bool Prefix(IReadOnlyList<CanopyCell?> path, IList<CanopyGridGroupLevel> levels, Host host) {
        for (var i = 0; i < path.Count; i++) {
            if (!Equals(path[i]?.Value, AxisValue(host, levels[i]))) return false;
        }
        return true;
    }

    private static object? AxisValue(Host host, CanopyGridGroupLevel level) {
        var raw = Read(host, level.Column);
        if (raw == null || level.Bucket == null) return raw;
        return level.Bucket.Kind == CanopyBucketKind.Month
            ? (double)((((DateTime)raw).Year - 1) * 12 + ((DateTime)raw).Month - 1)
            : Math.Floor((Convert.ToDouble(raw, CultureInfo.InvariantCulture) - level.Bucket.Origin) / level.Bucket.Width);
    }

    private static object? Read(Host host, string column) => column switch {
        "site" => host.Site, "os" => host.Os.ToString(), "online" => host.Online, "owner" => host.Owner?.Name,
        "cores" => host.Cores.HasValue ? (double?)host.Cores.Value : null, "memory" => host.Memory, "notes" => host.Notes,
        "lastSeen" => host.LastSeen, "name" => host.Name, _ => throw new InvalidOperationException("Unexpected fixture column.")
    };
}
