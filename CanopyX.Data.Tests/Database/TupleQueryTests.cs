using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class TupleQueryTests {
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CorrelatedMembershipAndComplementKeepNullsAndRejectCrossProducts(bool exclude) {
        var hosts = CorrelatedRecords(); var view = PivotQueryTests.View();
        var query = new CanopyGridQuery("fleet") { Revision = "r1", Limit = 1000 };
        query.TupleFilters.Add(new CanopyGridTupleFilter(new[] { new CanopyGridTupleColumn("site"), new CanopyGridTupleColumn("cores") },
            new CanopyCell?[][] { new CanopyCell?[] { new("East"), new(2) }, new CanopyCell?[] { new("West"), new(8) }, new CanopyCell?[] { null, null } }, exclude));
        var json = query.ToJson(view);
        var expected = hosts.Where(host => ((host.Site == "East" && host.Cores == 2) || (host.Site == "West" && host.Cores == 8) ||
            (host.Site == null && host.Cores == null)) != exclude).Select(host => host.Id.ToString()).OrderBy(id => id, StringComparer.Ordinal).ToArray();
        Assert.Equal(exclude ? 5 : 4, expected.Length);
        using var store = new SqliteFleet(hosts); using var database = store.Create();
        var map = Fleet.Map(view); var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, PivotQueryTests.Options());
        var handler = new CanopyRemoteHandler(map.Schema, provider);
        await AssertIds(handler, json, expected);
        var typed = new CanopyDataRequest(map.Schema, limit: 1000, tupleFilters: new[] { new CanopyTupleFilter(map.Schema, query.TupleFilters[0]) });
        await AssertIds(handler, typed, expected);
        foreach (var kind in new[] { ProviderKind.Reference, ProviderKind.Linq }) {
            var harness = new Harness(hosts, kind, view: view);
            await AssertIds(harness.Handler, json, expected);
        }
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(200)]
    public async Task PivotDrillThroughReproducesEveryCellCountIncludingOtherAndMissingAxes(int cap) {
        var hosts = CorrelatedRecords(); var view = PivotQueryTests.View();
        var definition = new CanopyGridPivot {
            Rows = { new("site"), new("online") }, Columns = { new("cores"), new("notes") },
            Values = { "coreCount", "coresAvg", "coresDistinct" }, MaxColumns = cap
        };
        using var store = new SqliteFleet(hosts); using var database = store.Create(log: true);
        var map = Fleet.Map(view); var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, PivotQueryTests.Options());
        var handlers = new[] { new CanopyRemoteHandler(map.Schema, provider), new Harness(hosts, ProviderKind.Reference, view: view).Handler, new Harness(hosts, ProviderKind.Linq, view: view).Handler };
        var accepted = CanopyRequestParser.ParseQuery("{\"revision\":\"r1\",\"filters\":[{\"column\":\"memory\",\"operator\":\"ge\",\"values\":[0]}]}", map.Schema);
        var pivot = await provider.PivotAsync(new CanopyPivotRequest(accepted, definition), CancellationToken.None);
        PivotQueryTests.AssertGroupedSelect(store);
        PivotQueryTests.AssertRecords(hosts.Where(host => host.Memory >= 0).ToArray(), view, definition, pivot);
        foreach (var row in pivot.Rows) foreach (var column in pivot.Columns) {
            var query = new CanopyGridQuery("fleet") { Revision = "r1", Limit = 1000 };
            query.Filters.Add(new CanopyGridFilter("memory", CanopyGridFilterOperator.GreaterThanOrEqual, new CanopyCell(0)));
            foreach (var tuple in pivot.DrillThrough(row.Key, column.Key)) query.TupleFilters.Add(tuple);
            var wire = query.ToJson(view);
            foreach (var handler in handlers) {
                using var response = JsonDocument.Parse(await handler.QueryAsync(wire));
                Assert.Equal(pivot.GetCell(row.Key, column.Key).Count, response.RootElement.GetProperty("matched").GetInt32());
            }
        }
        if (pivot.ColumnsLimited && pivot.RetainedColumns.Count > 0) {
            var other = pivot.Columns.Single(node => node.Other);
            var exclusion = Assert.Single(pivot.DrillThrough("r", other.Key));
            Assert.True(exclusion.Exclude); Assert.Equal(2, exclusion.Columns.Count);
            Assert.Equal(pivot.RetainedColumns.Count, exclusion.Values.Count);
        }
    }

    [Fact]
    public async Task BucketDrillThroughUsesMonthAndWidthKeysOnEveryProvider() {
        var hosts = CorrelatedRecords(); var view = PivotQueryTests.View();
        var definition = new CanopyGridPivot { Rows = { new("memory", bucket: CanopyBucket.FixedWidth(10)) },
            Columns = { new("lastSeen", bucket: CanopyBucket.Calendar(CanopyBucketKind.Month)) }, Values = { "coreCount" }, MaxColumns = 2 };
        using var store = new SqliteFleet(hosts); using var database = store.Create(log: true);
        var map = Fleet.Map(view); var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, PivotQueryTests.Options());
        var pivot = await provider.PivotAsync(new CanopyPivotRequest(new CanopyDataRequest(map.Schema), definition), CancellationToken.None);
        PivotQueryTests.AssertGroupedSelect(store);
        foreach (var row in pivot.Rows) foreach (var column in pivot.Columns) {
            var query = new CanopyGridQuery("fleet") { Revision = "r1", Limit = 1000 };
            foreach (var tuple in pivot.DrillThrough(row.Key, column.Key)) query.TupleFilters.Add(tuple);
            foreach (var handler in new[] { new CanopyRemoteHandler(map.Schema, provider), new Harness(hosts, ProviderKind.Reference, view: view).Handler, new Harness(hosts, ProviderKind.Linq, view: view).Handler }) {
                using var response = JsonDocument.Parse(await handler.QueryAsync(query.ToJson(view)));
                Assert.Equal(pivot.GetCell(row.Key, column.Key).Count, response.RootElement.GetProperty("matched").GetInt32());
            }
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TypedAndParsedTupleQueriesSurviveSummaryAndPivotEcho(bool typed) {
        var hosts = CorrelatedRecords(); var view = PivotQueryTests.View();
        var map = Fleet.Map(view); var provider = new CanopyQueryableProvider<Host>(hosts.AsQueryable(), map, PivotQueryTests.Options());
        var handler = new CanopyRemoteHandler(map.Schema, provider);
        var tuple = new CanopyGridTupleFilter(new[] { new CanopyGridTupleColumn("site"), new CanopyGridTupleColumn("cores") },
            new CanopyCell?[][] { new CanopyCell?[] { new("East"), new(2) }, new CanopyCell?[] { null, null } });
        var core = new CanopyGridQuery("fleet") { Revision = "r1", Limit = 1000 }; core.TupleFilters.Add(tuple);
        var request = typed ? new CanopyDataRequest(map.Schema, revision: "r1", tupleFilters: new[] { new CanopyTupleFilter(map.Schema, tuple) })
            : CanopyRequestParser.ParseQuery(core.ToJson(view), map.Schema);
        var expected = hosts.Where(host => host.Site == "East" && host.Cores == 2 || host.Site == null && host.Cores == null).Select(host => host.Id.ToString()).OrderBy(id => id, StringComparer.Ordinal).ToArray();
        using var summary = JsonDocument.Parse(await handler.SummaryAsync(new CanopySummaryRequest(request)));
        using var pivot = JsonDocument.Parse(await handler.PivotAsync(new CanopyPivotRequest(request, new CanopyGridPivot { Values = { "coreCount" } })));
        foreach (var document in new[] { summary, pivot }) {
            var echo = document.RootElement.GetProperty("query");
            var reparsed = CanopyRequestParser.ParseQuery(echo.GetRawText(), map.Schema);
            var echoedTuple = Assert.Single(reparsed.TupleFilters);
            Assert.Equal(new[] { "site", "cores" }, echoedTuple.Columns.Select(column => column.Id));
            Assert.Equal(2, echoedTuple.Values.Count); Assert.Null(echoedTuple.Values[1][0]); Assert.Null(echoedTuple.Values[1][1]);
            await AssertIds(handler, reparsed, expected);
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public async Task FacetWithoutCurrentFilterRemovesItsAtomicTupleAndKeepsUnrelatedScopes(int providerKind) {
        var hosts = CorrelatedRecords(); var view = PivotQueryTests.View();
        const string query = """
            {"revision":"r1","tupleFilters":[{"columns":[{"column":"site"},{"column":"cores"}],"values":[["East",2],["West",8]],"exclude":false},
             {"columns":[{"column":"online"}],"values":[[true]],"exclude":false}]}
            """;
        using var store = new SqliteFleet(hosts); using var database = store.Create();
        var map = Fleet.Map(view); var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, PivotQueryTests.Options());
        var handler = providerKind == 0 ? new CanopyRemoteHandler(map.Schema, provider)
            : new Harness(hosts, providerKind == 1 ? ProviderKind.Reference : ProviderKind.Linq, view: view).Handler;
        using var current = JsonDocument.Parse(await handler.FacetAsync("{\"column\":\"site\",\"includeCurrentFilter\":true,\"limit\":200,\"query\":" + query + "}"));
        Assert.Equal(hosts.Count(host => host.Online && (host.Site == "East" && host.Cores == 2 || host.Site == "West" && host.Cores == 8)), current.RootElement.GetProperty("items").EnumerateArray().Sum(item => item.GetProperty("count").GetInt32()));
        using var facet = JsonDocument.Parse(await handler.FacetAsync("{\"column\":\"site\",\"includeCurrentFilter\":false,\"limit\":200,\"query\":" + query + "}"));
        // A tuple is one atomic correlated predicate. Removing its current field removes that predicate,
        // exactly as WithoutColumn replaces a matching condition by true; unrelated predicates stay active.
        var expected = hosts.Where(host => host.Online).ToArray();
        var counts = facet.RootElement.GetProperty("items").EnumerateArray().ToDictionary(item => item.GetProperty("value").ValueKind == JsonValueKind.Null ? "<null>" : item.GetProperty("value").GetString()!, item => item.GetProperty("count").GetInt32());
        Assert.Equal(expected.Length, counts.Values.Sum());
        foreach (var group in expected.GroupBy(host => host.Site ?? "<null>")) Assert.Equal(group.Count(), counts[group.Key]);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public async Task WithoutCriteriaResetsTuplesSearchAndFiltersButPreservesWindowSortAndIdentityScope(int providerKind) {
        var hosts = CorrelatedRecords();
        using var store = new SqliteFleet(hosts); using var database = store.Create();
        var map = Fleet.Map(PivotQueryTests.View());
        var harness = new Harness(hosts, providerKind == 1 ? ProviderKind.Reference : ProviderKind.Linq, view: PivotQueryTests.View());
        var schema = providerKind == 0 ? map.Schema : harness.Schema;
        var provider = providerKind == 0 ? new CanopyQueryableProvider<Host>(() => database.Hosts, map, PivotQueryTests.Options()) : harness.Provider;
        var original = CanopyRequestParser.ParseQuery("""
            {"revision":"r1","offset":1,"limit":3,"search":"absent","sort":[{"column":"name","direction":"desc"}],"filters":[{"column":"site","operator":"eq","values":["East"]}],
             "tupleFilters":[{"columns":[{"column":"cores"}],"values":[[2]],"exclude":false}]}
            """, schema).WithIdentities(hosts.Take(6).Select(host => host.Id.ToString()), new[] { "2" });
        var reset = original.WithoutCriteria();
        Assert.Null(reset.Filter); Assert.Empty(reset.TupleFilters); Assert.Empty(reset.SearchTerms); Assert.Equal("", reset.Search);
        Assert.Single(original.TupleFilters); Assert.NotNull(original.Filter); Assert.Equal("absent", original.Search);
        Assert.Equal(original.Offset, reset.Offset); Assert.Equal(original.Limit, reset.Limit); Assert.Equal("r1", reset.Revision);
        Assert.Equal(original.Sort, reset.Sort); Assert.Equal(original.Ids, reset.Ids); Assert.Equal(original.ExcludedIds, reset.ExcludedIds);
        var page = await provider.QueryAsync(reset, CancellationToken.None);
        var expected = hosts.Take(6).Where(host => host.Id != 2).OrderByDescending(host => host.Name, StringComparer.Ordinal).Skip(1).Take(3).Select(host => host.Id.ToString());
        Assert.Equal(5, page.Matched); Assert.Equal(expected, page.Rows.Select(row => row.Id));
    }

    [Theory]
    [InlineData("site", "true")]
    [InlineData("site", "false")]
    [InlineData("online", "\"not-a-boolean\"")]
    [InlineData("online", "\"true\"")]
    public async Task WrongTypedStringAndBooleanTupleOperandsReturnNoMatchesWithoutThrowing(string column, string operand) {
        var hosts = CorrelatedRecords(); var view = PivotQueryTests.View();
        var query = "{\"tupleFilters\":[{\"columns\":[{\"column\":\"" + column + "\"}],\"values\":[[" + operand + "]],\"exclude\":false}]}";
        using var store = new SqliteFleet(hosts); using var database = store.Create();
        var map = Fleet.Map(view);
        foreach (var handler in new[] { new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Host>(() => database.Hosts, map, PivotQueryTests.Options())),
            new Harness(hosts, ProviderKind.Reference, view: view).Handler, new Harness(hosts, ProviderKind.Linq, view: view).Handler })
            await AssertIds(handler, query, Array.Empty<string>());
    }

    [Theory]
    [InlineData("site")]
    [InlineData("online")]
    public void ParserRejectsNumericTupleOperandsOnTextKindColumns(string column) {
        var query = "{\"tupleFilters\":[{\"columns\":[{\"column\":\"" + column + "\"}],\"values\":[[2]]}]}";
        Assert.Equal(CanopyRequestError.InvalidOperand, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseQuery(query, Fleet.Map(PivotQueryTests.View()).Schema)).Error);
    }

    private static List<Host> CorrelatedRecords() {
        var sites = new string?[] { "East", "East", "West", "West", null, null, "East", "West", null };
        var cores = new int?[] { 2, 8, 2, 8, null, 2, null, null, null };
        return Enumerable.Range(0, sites.Length).Select(i => new Host { Id = i + 1, Name = "host-" + (i + 1).ToString("D2"), Site = sites[i], Cores = cores[i],
            Online = i % 3 != 0, Memory = i == 1 ? -1 : i * 10, Notes = i % 2 == 0 ? null : "A", LastSeen = i % 4 == 0 ? null : new DateTime(2026, i % 3 + 1, 1) }).ToList();
    }

    private static async Task AssertIds(CanopyRemoteHandler handler, string query, IReadOnlyList<string> expected) {
        using var response = JsonDocument.Parse(await handler.QueryAsync(query)); AssertIds(response, expected);
    }
    private static async Task AssertIds(CanopyRemoteHandler handler, CanopyDataRequest query, IReadOnlyList<string> expected) {
        using var response = JsonDocument.Parse(await handler.QueryAsync(query)); AssertIds(response, expected);
    }
    private static void AssertIds(JsonDocument response, IReadOnlyList<string> expected) {
        Assert.Equal(expected.Count, response.RootElement.GetProperty("matched").GetInt32());
        Assert.Equal(expected, response.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetString()!).OrderBy(id => id, StringComparer.Ordinal));
    }
}
