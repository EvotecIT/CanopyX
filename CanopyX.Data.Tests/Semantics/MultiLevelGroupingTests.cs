using System.Globalization;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Runtime grouping levels: random queries agree between LINQ and the reference, pages follow their nested summaries,
/// and the nested summary has the protocol's shape.</summary>
public sealed class MultiLevelGroupingTests {
    private static readonly List<Host> Hosts = Fleet.Hosts(600);

    [Fact]
    public async Task RandomGroupedQueries_LinqMatchesReference() {
        var reference = new Harness(Hosts, ProviderKind.Reference, view: Fleet.DynamicView());
        var linq = new Harness(Hosts, ProviderKind.Linq, view: Fleet.DynamicView());
        var queries = new RandomQueries(Hosts, 14);
        var answers = new Answers();
        for (var i = 0; i < 250; i++) {
            var page = queries.GroupedQuery(400);
            Assert.True(answers.Note(await LinqOracleTests.Answer(() => reference.Handler.QueryAsync(page))) == await LinqOracleTests.Answer(() => linq.Handler.QueryAsync(page)), "Grouped page " + i + " differs: " + page);
            var summary = WithRevision(page);
            LinqOracleTests.AssertSameSummary(await LinqOracleTests.Answer(() => reference.Handler.SummaryAsync(summary)), await LinqOracleTests.Answer(() => linq.Handler.SummaryAsync(summary)), "Summary " + i + " differs: " + summary);
        }
        answers.AssertMostlyAnswered(250);
    }

    [Fact]
    public async Task RandomGroupedQueries_PagesFollowTheirSummaries() {
        foreach (var kind in new[] { ProviderKind.Reference, ProviderKind.Linq }) {
            var harness = new Harness(Hosts, kind, view: Fleet.DynamicView());
            var queries = new RandomQueries(Hosts, 15);
            var checkedGroups = 0;
            for (var i = 0; i < 120; i++) {
                var query = queries.GroupedQuery(0);
                // The whole result in one page, so every record position can be checked against its groups.
                var all = System.Text.RegularExpressions.Regex.Replace(query, "\"limit\":\\d+", "\"limit\":1000");
                string pageJson, summaryJson;
                try {
                    pageJson = await harness.Handler.QueryAsync(all);
                    summaryJson = await harness.Handler.SummaryAsync(WithRevision(all));
                } catch (CanopyRequestException) {
                    continue;
                }
                checkedGroups += CheckPageAgainstSummary(pageJson, summaryJson);
            }
            Assert.True(checkedGroups > 500, "Only " + checkedGroups + " groups were checked.");
        }
    }

    [Fact]
    public async Task GroupedExports_FollowThePageOrder() {
        var reference = new Harness(Hosts, ProviderKind.Reference, view: Fleet.DynamicView());
        var linq = new Harness(Hosts, ProviderKind.Linq, view: Fleet.DynamicView());
        const string query = "{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"owner\",\"direction\":\"desc\",\"aggregate\":\"memorySum\"},{\"column\":\"online\",\"direction\":\"asc\"}],\"sort\":[{\"column\":\"memory\",\"direction\":\"asc\"}]}";
        var request = "{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":" + query + ",\"values\":\"raw\",\"columns\":[\"name\",\"owner\",\"online\",\"memory\"]}";
        var expected = await Export(reference.Handler, request);
        Assert.Equal(expected, await Export(linq.Handler, request));
        var page = JsonDocument.Parse(await reference.Handler.QueryAsync(query.Replace("\"revision\":\"r1\",", "\"limit\":1000,"))).RootElement;
        var names = page.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("cells").GetProperty("name").ToString()).ToList();
        var lines = expected.TrimStart('﻿').Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries).Skip(1).Select(line => line.Split(',')[0]).ToList();
        Assert.Equal(names, lines);
    }

    [Fact]
    public async Task TwoLevels_NestGroupsWithAbsoluteOffsetsAndKeysUniqueAcrossLevels() {
        var hosts = new List<Host> {
            new Host { Id = 1, Name = "a", Site = "North", Os = OsFamily.Linux, Memory = 4, Online = true },
            new Host { Id = 2, Name = "b", Site = "North", Os = OsFamily.Windows, Memory = 8, Online = true },
            new Host { Id = 3, Name = "c", Site = "North", Os = OsFamily.Linux, Memory = 2, Online = false },
            new Host { Id = 4, Name = "d", Site = "South/East", Os = OsFamily.Linux, Memory = 1, Online = true },
            new Host { Id = 5, Name = "e", Site = null, Os = OsFamily.MacOs, Memory = 16, Online = true }
        };
        foreach (var kind in new[] { ProviderKind.Reference, ProviderKind.Linq }) {
            var harness = new Harness(hosts, kind, view: Fleet.DynamicView());
            var json = await harness.Handler.SummaryAsync("{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"site\",\"direction\":\"asc\"},{\"column\":\"os\",\"direction\":\"asc\"}]}");
            var root = JsonDocument.Parse(json).RootElement;
            var groups = root.GetProperty("groups").EnumerateArray().ToList();
            Assert.Equal(new[] { "s:North", "s:South/East", "null" }, groups.Select(group => group.GetProperty("key").GetString()));
            var north = groups[0].GetProperty("groups").EnumerateArray().ToList();
            Assert.Equal(new[] { "2:s:North/s:Linux", "2:s:North/s:Windows" }, north.Select(group => group.GetProperty("key").GetString()));
            Assert.Equal(new[] { 0, 2 }, north.Select(group => group.GetProperty("offset").GetInt32()));
            Assert.Equal(new[] { 2, 1 }, north.Select(group => group.GetProperty("count").GetInt32()));
            var south = groups[1].GetProperty("groups").EnumerateArray().Single();
            Assert.Equal("2:s:South\\/East/s:Linux", south.GetProperty("key").GetString());
            Assert.Equal(3, south.GetProperty("offset").GetInt32());
            Assert.Equal(4, groups[2].GetProperty("groups").EnumerateArray().Single().GetProperty("offset").GetInt32());
            Assert.False(south.TryGetProperty("groups", out _));
            Assert.Equal(0, north[0].GetProperty("aggregates").GetProperty("ownerDistinct").GetInt32());
            Assert.Equal("[{\"column\":\"site\",\"direction\":\"asc\"},{\"column\":\"os\",\"direction\":\"asc\"}]", root.GetProperty("query").GetProperty("groupBy").GetRawText());
        }
    }

    [Fact]
    public async Task DistinctCount_CountsDistinctNonmissingRawValues() {
        var hosts = new List<Host> {
            new Host { Id = 1, Name = "a", Site = "x", Owner = new Owner { Id = 1, Name = "Ann" }, LastSeen = Fleet.Epoch },
            new Host { Id = 2, Name = "b", Site = "x", Owner = new Owner { Id = 1, Name = "Ann" }, LastSeen = Fleet.Epoch },
            new Host { Id = 3, Name = "c", Site = "x", Owner = new Owner { Id = 2, Name = "ann" }, LastSeen = Fleet.Epoch.AddMilliseconds(1) },
            new Host { Id = 4, Name = "d", Site = "y", Owner = null, LastSeen = null }
        };
        foreach (var kind in new[] { ProviderKind.Reference, ProviderKind.Linq }) {
            var harness = new Harness(hosts, kind, view: Fleet.DynamicView());
            var root = JsonDocument.Parse(await harness.Handler.SummaryAsync("{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"site\",\"direction\":\"asc\"}]}")).RootElement;
            Assert.Equal(2, root.GetProperty("aggregates").GetProperty("ownerDistinct").GetInt32());
            Assert.Equal(2, root.GetProperty("aggregates").GetProperty("seenDistinct").GetInt32());
            var groups = root.GetProperty("groups").EnumerateArray().ToList();
            Assert.Equal(2, groups[0].GetProperty("aggregates").GetProperty("ownerDistinct").GetInt32());
            Assert.Equal(0, groups[1].GetProperty("aggregates").GetProperty("ownerDistinct").GetInt32());
            Assert.Equal(0, groups[1].GetProperty("aggregates").GetProperty("seenDistinct").GetInt32());
        }
    }

    [Fact]
    public async Task AggregateLevels_OrderGroupsByTheirAggregateWithMissingLast() {
        var hosts = new List<Host> {
            new Host { Id = 1, Name = "a", Site = "A", Cores = 2 }, new Host { Id = 2, Name = "b", Site = "A", Cores = 2 },
            new Host { Id = 3, Name = "c", Site = "B", Cores = 64 }, new Host { Id = 4, Name = "d", Site = "C", Cores = null },
            new Host { Id = 5, Name = "e", Site = "D", Cores = 4 }, new Host { Id = 6, Name = "f", Site = "E", Cores = 4 }
        };
        foreach (var kind in new[] { ProviderKind.Reference, ProviderKind.Linq }) {
            var harness = new Harness(hosts, kind, view: Fleet.DynamicView());
            const string query = "{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"site\",\"direction\":\"desc\",\"aggregate\":\"coresMax\"}],\"sort\":[{\"column\":\"name\",\"direction\":\"desc\"}]}";
            var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync(query)).RootElement;
            // Largest maximum first, equal maxima by value ascending, the group without a maximum last.
            Assert.Equal(new[] { "B", "D", "E", "A", "C" }, summary.GetProperty("groups").EnumerateArray().Select(group => group.GetProperty("value").GetString()));
            var (ids, _, _) = await harness.Ids(query.Replace("\"revision\":\"r1\",", ""));
            Assert.Equal(new[] { "3", "5", "6", "2", "1", "4" }, ids);
            // The aggregate level's sort entry is ascending; the sort the reader set stays inside the groups.
            Assert.Equal(new[] { "site", "name" }, summary.GetProperty("query").GetProperty("sort").EnumerateArray().Select(key => key.GetProperty("column").GetString()));
            Assert.Equal(new[] { "asc", "desc" }, summary.GetProperty("query").GetProperty("sort").EnumerateArray().Select(key => key.GetProperty("direction").GetString()));
        }
    }

    [Fact]
    public async Task EmptyGroupBy_IsUngroupedAndOmittedGroupByUsesTheDeclaredLevels() {
        var harness = new Harness(Hosts, ProviderKind.Linq, view: Fleet.DynamicView());
        var ungrouped = JsonDocument.Parse(await harness.Handler.SummaryAsync("{\"revision\":\"r1\",\"groupBy\":[]}")).RootElement;
        Assert.Equal(0, ungrouped.GetProperty("groups").GetArrayLength());
        Assert.Equal(Hosts.Count, ungrouped.GetProperty("matched").GetInt32());
        var declared = JsonDocument.Parse(await harness.Handler.SummaryAsync("{\"revision\":\"r1\"}")).RootElement;
        var first = declared.GetProperty("groups")[0];
        Assert.True(first.GetProperty("groups").GetArrayLength() > 0);
        Assert.StartsWith("2:", first.GetProperty("groups")[0].GetProperty("key").GetString());
    }

    [Fact]
    public async Task CodeBuiltRequests_EchoTheirLevels() {
        var harness = new Harness(Hosts, ProviderKind.Reference, view: Fleet.DynamicView());
        var schema = harness.Schema;
        var levels = new[] { new CanopySummaryLevel(schema.GetColumn("online"), true), new CanopySummaryLevel(schema.GetColumn("site"), false, schema.GetAggregate("memorySum")) };
        var sort = levels.Select(level => new CanopySortKey(level.Column, level.Aggregate == null && level.Descending)).ToList();
        var request = new CanopySummaryRequest(new CanopyDataRequest(schema, sort: sort, revision: "r1", levels: levels));
        var root = JsonDocument.Parse(await harness.Handler.SummaryAsync(request)).RootElement;
        Assert.Equal("[{\"column\":\"online\",\"direction\":\"desc\"},{\"column\":\"site\",\"direction\":\"asc\",\"aggregate\":\"memorySum\"}]", root.GetProperty("query").GetProperty("groupBy").GetRawText());
        Assert.True(root.GetProperty("groups")[0].GetProperty("value").GetBoolean());
    }

    [Fact]
    public async Task CustomAggregates_AreUnsupportedByTheBuiltInProviders() {
        var view = Fleet.DynamicView();
        view.Reporting!.Aggregates.Add(new CanopyGridAggregate("median", "memory", "median", "Median memory"));
        foreach (var kind in new[] { ProviderKind.Reference, ProviderKind.Linq }) {
            var harness = new Harness(Hosts, kind, view: view);
            var error = await Assert.ThrowsAsync<CanopyRequestException>(() => harness.Handler.SummaryAsync("{\"revision\":\"r1\"}"));
            Assert.Equal(CanopyRequestError.Unsupported, error.Error);
        }
    }

    [Fact]
    public async Task FixedGrouping_KeepsTheSingleLevelFormat() {
        var harness = new Harness(Hosts, ProviderKind.Linq, grouped: true);
        var root = JsonDocument.Parse(await harness.Handler.SummaryAsync("{\"revision\":\"r1\"}")).RootElement;
        Assert.False(root.GetProperty("query").TryGetProperty("groupBy", out _));
        foreach (var group in root.GetProperty("groups").EnumerateArray()) {
            Assert.False(group.TryGetProperty("groups", out _));
            Assert.Matches("^(s:|null$)", group.GetProperty("key").GetString());
        }
        await Assert.ThrowsAsync<CanopyRequestException>(() => harness.Handler.QueryAsync("{\"groupBy\":[]}"));
    }

    /// <summary>Checks every group range of a summary against the page rows (each record's value at each level) and the
    /// uniqueness of keys across levels, as the browser does before it accepts a summary; returns the number of groups checked.</summary>
    internal static int CheckPageAgainstSummary(string pageJson, string summaryJson) {
        var page = JsonDocument.Parse(pageJson).RootElement;
        var summary = JsonDocument.Parse(summaryJson).RootElement;
        var items = page.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(summary.GetProperty("matched").GetInt32(), items.Count);
        var levels = summary.GetProperty("query").TryGetProperty("groupBy", out var groupBy) ? groupBy.EnumerateArray().Select(level => level.GetProperty("column").GetString()!).ToList() : new List<string> { "site", "os" };
        var keys = new HashSet<string>(StringComparer.Ordinal);
        var count = 0;
        void Check(JsonElement groups, int depth, int start, int length) {
            var offset = start;
            foreach (var group in groups.EnumerateArray()) {
                Assert.True(keys.Add(group.GetProperty("key").GetString()!), "Duplicate key " + group.GetProperty("key").GetString());
                Assert.Equal(offset, group.GetProperty("offset").GetInt32());
                var size = group.GetProperty("count").GetInt32();
                var value = Raw(group.GetProperty("value"));
                for (var i = offset; i < offset + size; i++) {
                    var cell = items[i].GetProperty("cells").GetProperty(levels[depth]);
                    Assert.Equal(value, Raw(cell.ValueKind == JsonValueKind.Object ? cell.GetProperty("value") : cell));
                }
                if (depth + 1 < levels.Count) Check(group.GetProperty("groups"), depth + 1, offset, size);
                else Assert.False(group.TryGetProperty("groups", out _));
                offset += size;
                count++;
            }
            Assert.Equal(start + length, offset);
        }
        if (levels.Count > 0) Check(summary.GetProperty("groups"), 0, 0, items.Count);
        else Assert.Equal(0, summary.GetProperty("groups").GetArrayLength());
        return count;
    }

    private static string Raw(JsonElement value) => value.ValueKind switch {
        JsonValueKind.Number => value.GetDouble().ToString("R", CultureInfo.InvariantCulture),
        JsonValueKind.String when DateTime.TryParse(value.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out var date) && value.GetString()!.EndsWith("Z", StringComparison.Ordinal)
            => date.ToString("O", CultureInfo.InvariantCulture),
        JsonValueKind.String => "s:" + value.GetString(),
        _ => value.GetRawText()
    };

    internal static string WithRevision(string query) => query.Replace("\"view\":\"fleet\"", "\"view\":\"fleet\",\"revision\":\"r1\"");

    private static async Task<string> Export(CanopyRemoteHandler handler, string request) {
        var job = await handler.PrepareExportAsync(request, "csv");
        using var stream = new MemoryStream();
        await job.WriteAsync(stream);
        return System.Text.Encoding.UTF8.GetString(stream.ToArray());
    }
}
