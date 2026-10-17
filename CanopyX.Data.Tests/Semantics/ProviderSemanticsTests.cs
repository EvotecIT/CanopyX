using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Operator, null, case, search, ordering and window rules, checked on the reference and on LINQ to objects.</summary>
public sealed class ProviderSemanticsTests {
    [Theory, MemberData(nameof(Kinds))]
    public async Task NonFiniteNumbers_AreMissingForFiltersOrderingAndAggregates(ProviderKind kind) {
        var hosts = new[] { 10d, 20d, double.NaN, double.NegativeInfinity, double.PositiveInfinity }
            .Select((memory, index) => new Host { Id = index + 1, Name = "host-" + index, Memory = memory }).ToList();
        var view = Fleet.View();
        view.Reporting!.Aggregates.Add(new CanopyGridAggregate("memoryCount", "memory", CanopyGridAggregateOperation.Count, "Memory count"));
        var harness = new Harness(hosts, kind, view: view);
        Assert.Equal(new[] { "3", "4", "5" }, (await harness.Ids(Harness.Where(F("memory", "isNull", "")))).Ids);
        Assert.Equal(new[] { "1", "2" }, (await harness.Ids(Harness.Where(F("memory", "isNotNull", "")))).Ids);
        Assert.Equal(new[] { "2" }, (await harness.Ids(Harness.Where(F("memory", "ne", "10")))).Ids);
        Assert.Equal(new[] { "2", "1", "3", "4", "5" }, (await harness.Ids(Harness.Where("", sort: "[{\"column\":\"memory\",\"direction\":\"desc\"}]"))).Ids);
        using var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync("{\"revision\":\"r1\"}"));
        var aggregates = summary.RootElement.GetProperty("aggregates");
        Assert.Equal(30, aggregates.GetProperty("memorySum").GetDouble());
        Assert.Equal(15, aggregates.GetProperty("memoryAvg").GetDouble());
        Assert.Equal(2, aggregates.GetProperty("memoryCount").GetDouble());
    }
    private static readonly Owner TeamA = new Owner { Id = 1, Name = "Team A" };
    private static readonly DateTime Noon = new DateTime(2026, 3, 1, 12, 0, 0, DateTimeKind.Utc);

    private static readonly List<Host> Small = new List<Host> {
        new Host { Id = 1, Name = "alpha", Site = "Oslo", Os = OsFamily.Linux, Cores = 4, Memory = 16, Online = true, LastSeen = Noon, Owner = TeamA, Notes = "50% capacity" },
        new Host { Id = 2, Name = "Beta", Site = "oslo", Os = OsFamily.Windows, Cores = 8, Memory = 32.5, Online = false, LastSeen = Noon.AddMilliseconds(1), Notes = "under_score" },
        new Host { Id = 3, Name = "gamma", Site = null, Os = OsFamily.MacOs, Cores = null, Memory = 8, Online = true, LastSeen = null, Owner = TeamA, Notes = null },
        new Host { Id = 4, Name = "ÉCOLE", Site = "Zürich", Os = OsFamily.FreeBsd, Cores = 2, Memory = 64, Online = true, LastSeen = Noon.AddDays(-1), Notes = "école" },
        new Host { Id = 5, Name = "delta", Site = "", Os = OsFamily.Linux, Cores = 16, Memory = 0.5, Online = false, LastSeen = Noon.AddTicks(5000), Notes = "=SUM(A1)" }
    };

    public static TheoryData<ProviderKind> Kinds => new TheoryData<ProviderKind> { ProviderKind.Reference, ProviderKind.Linq };

    private static Task<(string[] Ids, int Matched, int Total)> Run(ProviderKind kind, string filters, string search = "", string mode = "substring", string? sort = null) {
        var harness = new Harness(Small, kind);
        return sort == null ? harness.Ids(Harness.Where(filters, search, mode)) : harness.Ids(Harness.Where(filters, search, mode, sort: sort));
    }

    private static string F(string column, string op, string values) => "{\"column\":\"" + column + "\",\"operator\":\"" + op + "\",\"values\":[" + values + "]}";

    [Theory, MemberData(nameof(Kinds))]
    public async Task TextOperators_AreCaseInsensitiveAndFoldNonAscii(ProviderKind kind) {
        Assert.Equal(new[] { "2", "1" }, (await Run(kind, F("site", "eq", "\"OSLO\""))).Ids);
        Assert.Equal(new[] { "4" }, (await Run(kind, F("name", "eq", "\"école\""))).Ids);
        Assert.Equal(new[] { "4" }, (await Run(kind, F("site", "contains", "\"ZÜR\""))).Ids);
        Assert.Equal(new[] { "2", "4" }, (await Run(kind, F("name", "startsWith", "\"\""))).Ids.Where(id => id == "2" || id == "4").ToArray());
        Assert.Equal(new[] { "2", "1", "5" }, (await Run(kind, F("site", "in", "\"oslo\",\"\""))).Ids);
        Assert.Equal(new[] { "1" }, (await Run(kind, F("notes", "contains", "\"%\""))).Ids);
        Assert.Equal(new[] { "2" }, (await Run(kind, F("notes", "contains", "\"_\""))).Ids);
    }

    [Theory, MemberData(nameof(Kinds))]
    public async Task NullsAndEmptyText_FollowTheProtocol(ProviderKind kind) {
        // ne never matches a missing value; isNull is the only way to include it, and the empty string is a value.
        Assert.Equal(new[] { "1", "2", "4", "5" }.OrderBy(id => id), (await Run(kind, F("site", "ne", "\"x\""))).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "3" }, (await Run(kind, F("site", "isNull", ""))).Ids);
        Assert.Equal(new[] { "5" }, (await Run(kind, F("site", "eq", "\"\""))).Ids);
        Assert.Equal(new[] { "1", "2", "4", "5" }.OrderBy(id => id), (await Run(kind, F("cores", "ne", "3"))).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "3" }, (await Run(kind, F("owner", "isNotNull", "") + "," + F("cores", "isNull", ""))).Ids);
        Assert.Equal(new[] { "2", "4", "5" }.OrderBy(id => id), (await Run(kind, F("owner", "isNull", ""))).Ids.OrderBy(id => id));
        Assert.Empty((await Run(kind, F("name", "isNull", ""))).Ids);
    }

    [Theory, MemberData(nameof(Kinds))]
    public async Task Numbers_CompareByValueIncludingFractionalOperands(ProviderKind kind) {
        Assert.Equal(new[] { "2", "5" }.OrderBy(id => id), (await Run(kind, F("cores", "gt", "4"))).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "2", "5" }.OrderBy(id => id), (await Run(kind, F("cores", "gt", "4.5"))).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "1", "2", "5" }.OrderBy(id => id), (await Run(kind, F("cores", "ge", "3.5"))).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "1", "4" }.OrderBy(id => id), (await Run(kind, F("cores", "lt", "4.5"))).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "4" }, (await Run(kind, F("cores", "le", "3.9"))).Ids);
        Assert.Empty((await Run(kind, F("cores", "eq", "4.5"))).Ids);
        Assert.Equal(new[] { "1", "2", "4", "5" }.OrderBy(id => id), (await Run(kind, F("cores", "ne", "4.5"))).Ids.OrderBy(id => id));
        Assert.Empty((await Run(kind, F("cores", "gt", "9007199254740991"))).Ids);
        Assert.Equal(4, (await Run(kind, F("cores", "gt", "-9007199254740991"))).Ids.Length);
        Assert.Equal(new[] { "2" }, (await Run(kind, F("memory", "eq", "32.5"))).Ids);
        Assert.Equal(new[] { "1", "2", "4" }.OrderBy(id => id), (await Run(kind, F("cores", "in", "2,8,4,4.5"))).Ids.OrderBy(id => id));
    }

    [Theory, MemberData(nameof(Kinds))]
    public async Task Dates_CompareUtcInstantsAtMillisecondPrecision(ProviderKind kind) {
        Assert.Equal(new[] { "1", "5" }.OrderBy(id => id), (await Run(kind, F("lastSeen", "eq", "\"2026-03-01T14:00:00+02:00\""))).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "2" }, (await Run(kind, F("lastSeen", "gt", "\"2026-03-01T12:00:00Z\""))).Ids);
        Assert.Equal(new[] { "1", "2", "5" }.OrderBy(id => id), (await Run(kind, F("lastSeen", "ge", "\"2026-03-01T12:00:00.000Z\""))).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "4" }, (await Run(kind, F("lastSeen", "lt", "\"2026-03-01T12:00:00Z\""))).Ids);
        Assert.Equal(new[] { "1", "4", "5" }.OrderBy(id => id), (await Run(kind, F("lastSeen", "le", "\"2026-03-01T07:00:00-05:00\""))).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "2", "4" }.OrderBy(id => id), (await Run(kind, F("lastSeen", "ne", "\"2026-03-01T12:00:00Z\""))).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "2", "4" }.OrderBy(id => id), (await Run(kind, F("lastSeen", "in", "\"2026-03-01T12:00:00.001Z\",\"2026-02-28T12:00:00Z\""))).Ids.OrderBy(id => id));
    }

    [Theory, MemberData(nameof(Kinds))]
    public async Task EnumerationsAndBooleans_MatchTheirRawText(ProviderKind kind) {
        Assert.Equal(new[] { "1", "5" }, (await Run(kind, F("os", "eq", "\"LINUX\""))).Ids.OrderBy(id => id).ToArray());
        Assert.Equal(new[] { "2", "3" }.OrderBy(id => id), (await Run(kind, F("os", "contains", "\"o\""))).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "2", "5" }.OrderBy(id => id), (await Run(kind, F("online", "eq", "false"))).Ids.OrderBy(id => id));
        Assert.Empty((await Run(kind, F("online", "eq", "\"false\""))).Ids);
        Assert.Equal(5, (await Run(kind, F("online", "ne", "\"true\""))).Ids.Length);
        Assert.Equal(new[] { "1", "3", "4" }.OrderBy(id => id), (await Run(kind, F("online", "contains", "\"RU\""))).Ids.OrderBy(id => id));
        Assert.Empty((await Run(kind, F("os", "eq", "\"Solaris\""))).Ids);
    }

    [Theory, MemberData(nameof(Kinds))]
    public async Task Groups_CombineWithAndOr(ProviderKind kind) {
        var harness = new Harness(Small, kind);
        var json = "{\"sort\":[{\"column\":\"name\",\"direction\":\"asc\"}],\"filters\":[" + F("online", "eq", "true") + "]," +
            "\"filterGroup\":{\"operator\":\"or\",\"filters\":[" + F("site", "isNull", "") + "],\"groups\":[{\"operator\":\"and\",\"filters\":[" + F("cores", "ge", "2") + "," + F("cores", "le", "4") + "],\"groups\":[]}]}}";
        Assert.Equal(new[] { "1", "3", "4" }, (await harness.Ids(json)).Ids.OrderBy(id => id).ToArray());
    }

    [Theory, MemberData(nameof(Kinds))]
    public async Task Search_SubstringAndWords(ProviderKind kind) {
        Assert.Equal(new[] { "4" }, (await Run(kind, "", "ÉCO")).Ids);
        Assert.Equal(new[] { "1", "3" }.OrderBy(id => id), (await Run(kind, "", "team a")).Ids.OrderBy(id => id));
        Assert.Empty((await Run(kind, "", "team alpha")).Ids);
        Assert.Equal(new[] { "1" }, (await Run(kind, "", "team alpha", "words")).Ids);
        Assert.Equal(new[] { "1", "3" }.OrderBy(id => id), (await Run(kind, "", "\"team a\"", "words")).Ids.OrderBy(id => id));
        Assert.Equal(new[] { "2" }, (await Run(kind, "", "8")).Ids);
        Assert.Equal(new[] { "5" }, (await Run(kind, "", "16")).Ids);
        Assert.Equal(5, (await Run(kind, "", "\"\" ", "words")).Ids.Length);
    }

    [Theory, MemberData(nameof(Kinds))]
    public async Task Sorting_PutsMissingValuesLastInBothDirections(ProviderKind kind) {
        Assert.Equal(new[] { "4", "1", "2", "5", "3" }, (await Run(kind, "", sort: "[{\"column\":\"cores\",\"direction\":\"asc\"}]")).Ids);
        Assert.Equal(new[] { "5", "2", "1", "4", "3" }, (await Run(kind, "", sort: "[{\"column\":\"cores\",\"direction\":\"desc\"}]")).Ids);
        Assert.Equal(new[] { "2", "1", "4", "3" }, (await Run(kind, F("name", "ne", "\"delta\""), sort: "[{\"column\":\"lastSeen\",\"direction\":\"desc\"}]")).Ids);
        // Ordinal text: "" before uppercase before lowercase, then non-ASCII.
        Assert.Equal(new[] { "5", "1", "4", "2", "3" }, (await Run(kind, "", sort: "[{\"column\":\"site\",\"direction\":\"asc\"}]")).Ids);
        Assert.Equal(new[] { "4", "5", "1", "3", "2" }, (await Run(kind, "", sort: "[{\"column\":\"os\",\"direction\":\"asc\"},{\"column\":\"name\",\"direction\":\"desc\"}]")).Ids);
        Assert.Equal(new[] { "2", "5", "1", "3", "4" }, (await Run(kind, "", sort: "[{\"column\":\"online\",\"direction\":\"asc\"}]")).Ids);
        Assert.Equal(new[] { "1", "2", "3", "4", "5" }, (await Run(kind, "", sort: "[]")).Ids);
    }

    [Theory, MemberData(nameof(Kinds))]
    public async Task Windows_ReturnExactRangesAndCounts(ProviderKind kind) {
        var harness = new Harness(Small, kind);
        var page = await harness.Ids("{\"offset\":3,\"limit\":10,\"sort\":[{\"column\":\"name\",\"direction\":\"asc\"}],\"filters\":[]}");
        Assert.Equal(2, page.Ids.Length);
        Assert.Equal(5, page.Matched);
        Assert.Equal(5, page.Total);
        var end = await harness.Ids("{\"offset\":5,\"limit\":10}");
        Assert.Empty(end.Ids);
        var beyond = await Assert.ThrowsAsync<CanopyRequestException>(() => harness.Handler.QueryAsync("{\"offset\":6,\"limit\":10}"));
        Assert.Equal(CanopyRequestError.OffsetOutOfRange, beyond.Error);
        var stale = await Assert.ThrowsAsync<CanopyRequestException>(() => harness.Handler.QueryAsync("{\"revision\":\"r0\"}"));
        Assert.Equal(CanopyRequestError.StaleRevision, stale.Error);
        Assert.Equal(409, stale.StatusCode);
    }

    [Theory, MemberData(nameof(Kinds))]
    public async Task Facets_CountCaseInsensitiveBucketsWithNullsLast(ProviderKind kind) {
        var harness = new Harness(Small, kind);
        using var page = JsonDocument.Parse(await harness.Handler.FacetAsync(
            "{\"column\":\"site\",\"limit\":10,\"query\":{\"revision\":\"r1\",\"filters\":[]}}"));
        var items = page.RootElement.GetProperty("items").EnumerateArray().Select(item => (item.GetProperty("value").ValueKind == JsonValueKind.Null ? null : item.GetProperty("value").GetString(), item.GetProperty("count").GetInt32())).ToArray();
        Assert.Equal(new (string?, int)[] { ("", 1), ("Oslo", 2), ("Zürich", 1), (null, 1) }, items);
        Assert.Equal(4, page.RootElement.GetProperty("totalValues").GetInt32());
        Assert.False(page.RootElement.GetProperty("truncated").GetBoolean());
        using var searched = JsonDocument.Parse(await harness.Handler.FacetAsync(
            "{\"column\":\"os\",\"search\":\"N\",\"limit\":1,\"query\":{\"revision\":\"r1\",\"filters\":[]}}"));
        Assert.Equal(2, searched.RootElement.GetProperty("totalValues").GetInt32());
        Assert.True(searched.RootElement.GetProperty("truncated").GetBoolean());
        Assert.Equal("Linux", searched.RootElement.GetProperty("items")[0].GetProperty("value").GetString());
        using var numbers = JsonDocument.Parse(await harness.Handler.FacetAsync(
            "{\"column\":\"cores\",\"includeCurrentFilter\":false,\"query\":{\"revision\":\"r1\",\"filters\":[" + F("cores", "eq", "4") + "]}}"));
        Assert.Equal(5, numbers.RootElement.GetProperty("matched").GetInt32());
        Assert.Equal(new double?[] { 2, 4, 8, 16, null }, numbers.RootElement.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("value").ValueKind == JsonValueKind.Null ? (double?)null : item.GetProperty("value").GetDouble()));
    }

    [Theory, MemberData(nameof(Kinds))]
    public async Task Summary_ReturnsAggregatesAndOrderedGroups(ProviderKind kind) {
        var harness = new Harness(Small, kind, grouped: true);
        using var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync(
            "{\"protocol\":\"canopyx/2\",\"type\":\"gridQuery\",\"view\":\"fleet\",\"revision\":\"r1\",\"offset\":0,\"limit\":50,\"search\":\"\",\"sort\":[{\"column\":\"site\",\"direction\":\"asc\"}],\"filters\":[]}"));
        var root = summary.RootElement;
        Assert.Equal(5, root.GetProperty("matched").GetInt32());
        Assert.Equal(4, root.GetProperty("aggregates").GetProperty("coreCount").GetDouble());
        Assert.Equal(121, root.GetProperty("aggregates").GetProperty("memorySum").GetDouble(), 6);
        Assert.Equal(2, root.GetProperty("aggregates").GetProperty("coresMin").GetDouble());
        Assert.Equal("r1", root.GetProperty("query").GetProperty("revision").GetString());
        var groups = root.GetProperty("groups").EnumerateArray().ToArray();
        Assert.Equal(new object?[] { "", "Oslo", "Zürich", "oslo", null }, groups.Select(group => group.GetProperty("value").ValueKind == JsonValueKind.Null ? null : (object)group.GetProperty("value").GetString()!));
        Assert.Equal(new[] { 0, 1, 2, 3, 4 }, groups.Select(group => group.GetProperty("offset").GetInt32()));
        var missing = groups[4].GetProperty("aggregates");
        Assert.Equal(0, missing.GetProperty("coreCount").GetDouble());
        Assert.Equal(JsonValueKind.Null, missing.GetProperty("coresMax").ValueKind);
        var page = await harness.Ids("{\"offset\":0,\"limit\":5,\"sort\":[{\"column\":\"name\",\"direction\":\"asc\"}]}");
        Assert.Equal(new[] { "5", "1", "4", "2", "3" }, page.Ids);
    }
}
