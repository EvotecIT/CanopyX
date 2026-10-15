using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Summary ownership uses the accepted query, including normalized shorthand and derived requests.</summary>
public sealed class SummaryEchoRegressionTests {
    private static readonly List<Host> Hosts = new List<Host> {
        new Host { Id = 1, Name = "team alpha", Site = "A", Cores = 2, LastSeen = new DateTime(2026, 3, 1, 12, 0, 0, DateTimeKind.Utc) },
        new Host { Id = 2, Name = "team beta", Site = "B", Cores = 4, LastSeen = new DateTime(2026, 3, 2, 12, 0, 0, DateTimeKind.Utc) },
        new Host { Id = 3, Name = "gamma", Site = "A", Cores = 8 }
    };

    [Theory]
    [InlineData("fixed")]
    [InlineData("dynamic")]
    [InlineData("ungrouped")]
    public async Task ShorthandSummary_EchoesCompleteQueryAndEffectiveGroups(string grouping) {
        var view = grouping == "dynamic" ? Fleet.DynamicView() : Fleet.View(grouped: grouping == "fixed");
        var harness = new Harness(Hosts, ProviderKind.Linq, view: view);
        using var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync("{\"revision\":\"r1\"}"));
        var root = summary.RootElement;
        var echo = root.GetProperty("query");
        AssertEnvelope(echo, 50);
        Assert.Equal(string.Empty, echo.GetProperty("search").GetString());
        Assert.Empty(echo.GetProperty("filters").EnumerateArray());
        Assert.Equal(3, root.GetProperty("matched").GetInt32());
        var sort = echo.GetProperty("sort").EnumerateArray().ToArray();
        Assert.Equal(grouping == "dynamic" ? new[] { "site", "os" } : grouping == "fixed" ? new[] { "site" } : Array.Empty<string>(), sort.Select(key => key.GetProperty("column").GetString()));
        Assert.Equal(grouping == "dynamic", echo.TryGetProperty("groupBy", out var levels));
        if (grouping == "dynamic") Assert.Equal(new[] { "site", "os" }, levels.EnumerateArray().Select(level => level.GetProperty("column").GetString()));
        using var repeated = JsonDocument.Parse(await harness.Handler.SummaryAsync(echo.GetRawText()));
        Assert.Equal(root.GetProperty("groups").GetRawText(), repeated.RootElement.GetProperty("groups").GetRawText());
    }

    [Fact]
    public async Task CodeBuiltSummary_EchoesEffectiveGroupingBeforeInnerSort() {
        var harness = new Harness(Hosts, ProviderKind.Linq, view: Fleet.DynamicView());
        var schema = harness.Schema;
        var levels = new[] { new CanopySummaryLevel(schema.GetColumn("site"), true, schema.GetAggregate("coreCount")) };
        var query = new CanopyDataRequest(schema, sort: new[] { new CanopySortKey(schema.GetColumn("name"), true) },
            offset: 13, limit: 7, revision: "r1", levels: levels);
        using var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync(new CanopySummaryRequest(query)));
        var root = summary.RootElement;
        var echo = root.GetProperty("query");
        AssertEnvelope(echo, 7);
        Assert.Equal(3, root.GetProperty("matched").GetInt32());
        Assert.Equal(new[] { "site", "name" }, echo.GetProperty("sort").EnumerateArray().Select(key => key.GetProperty("column").GetString()));
        Assert.Equal(new[] { "asc", "desc" }, echo.GetProperty("sort").EnumerateArray().Select(key => key.GetProperty("direction").GetString()));
        Assert.Equal("[{\"column\":\"site\",\"direction\":\"desc\",\"aggregate\":\"coreCount\"}]", echo.GetProperty("groupBy").GetRawText());
        Assert.Equal(new[] { "A", "B" }, root.GetProperty("groups").EnumerateArray().Select(group => group.GetProperty("value").GetString()));
        using var repeated = JsonDocument.Parse(await harness.Handler.SummaryAsync(echo.GetRawText()));
        Assert.Equal(root.GetProperty("groups").GetRawText(), repeated.RootElement.GetProperty("groups").GetRawText());
    }

    [Fact]
    public async Task Summary_NormalizesWindowAndGroupingAndOmitsIgnoredFields() {
        var harness = new Harness(Hosts, ProviderKind.Linq, view: Fleet.DynamicView());
        const string request = "{\"revision\":\"r1\",\"offset\":17,\"limit\":7,\"search\":\"team\",\"searchMode\":\"substring\",\"cursor\":null,\"unknown\":{\"type\":\"ignored\"}," +
            "\"sort\":[{\"column\":\"name\",\"unknown\":true}],\"groupBy\":[{\"column\":\"site\",\"direction\":\"desc\",\"unknown\":true}]," +
            "\"filters\":[{\"column\":\"cores\",\"operator\":\"ge\",\"values\":[2],\"unknown\":true}]," +
            "\"filterGroup\":{\"operator\":\"or\",\"filters\":[{\"column\":\"site\",\"operator\":\"eq\",\"values\":[\"A\"],\"unknown\":true}],\"unknown\":true}}";
        using var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync(request));
        var root = summary.RootElement;
        var echo = root.GetProperty("query");
        AssertEnvelope(echo, 7);
        Assert.Equal("team", echo.GetProperty("search").GetString());
        Assert.Equal("substring", echo.GetProperty("searchMode").GetString());
        Assert.Equal(1, root.GetProperty("matched").GetInt32());
        Assert.Equal(new[] { "site", "name" }, echo.GetProperty("sort").EnumerateArray().Select(key => key.GetProperty("column").GetString()));
        Assert.Equal(new[] { "desc", "asc" }, echo.GetProperty("sort").EnumerateArray().Select(key => key.GetProperty("direction").GetString()));
        Assert.Equal("[{\"column\":\"site\",\"direction\":\"desc\"}]", echo.GetProperty("groupBy").GetRawText());
        Assert.False(echo.TryGetProperty("cursor", out _));
        Assert.DoesNotContain("unknown", echo.GetRawText());
        Assert.Empty(echo.GetProperty("filterGroup").GetProperty("groups").EnumerateArray());
        using var repeated = JsonDocument.Parse(await harness.Handler.SummaryAsync(echo.GetRawText()));
        Assert.Equal(root.GetProperty("matched").GetInt32(), repeated.RootElement.GetProperty("matched").GetInt32());
        Assert.Equal(root.GetProperty("groups").GetRawText(), repeated.RootElement.GetProperty("groups").GetRawText());
    }

    [Fact]
    public async Task Summary_PreservesPredicateShapeAndOperandTextUntilCriteriaChange() {
        var harness = new Harness(Hosts, ProviderKind.Linq, view: Fleet.DynamicView());
        const string request = "{\"revision\":\"r1\",\"limit\":9,\"search\":\"team alpha\",\"searchMode\":\"words\",\"groupBy\":[]," +
            "\"filters\":[{\"column\":\"lastSeen\",\"operator\":\"eq\",\"values\":[\"2026-03-01T14:00:00+02:00\"]}]," +
            "\"filterGroup\":{\"operator\":\"or\",\"filters\":[{\"column\":\"site\",\"operator\":\"eq\",\"values\":[\"A\"]}],\"groups\":[]}}";
        using var sent = JsonDocument.Parse(request);
        var parsed = CanopyRequestParser.ParseSummary(request, harness.Schema);
        using var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync(parsed));
        var echo = summary.RootElement.GetProperty("query");
        AssertEnvelope(echo, 9);
        Assert.Equal(1, summary.RootElement.GetProperty("matched").GetInt32());
        Assert.Equal("words", echo.GetProperty("searchMode").GetString());
        Assert.Equal(JsonSerializer.Serialize(sent.RootElement.GetProperty("filters")), echo.GetProperty("filters").GetRawText());
        Assert.Equal(JsonSerializer.Serialize(sent.RootElement.GetProperty("filterGroup")), echo.GetProperty("filterGroup").GetRawText());
        Assert.Empty(echo.GetProperty("groupBy").EnumerateArray());

        var changed = parsed.Query.WithoutCriteria().WithWindow(31, 6);
        using var unrestricted = JsonDocument.Parse(await harness.Handler.SummaryAsync(new CanopySummaryRequest(changed)));
        var changedEcho = unrestricted.RootElement.GetProperty("query");
        AssertEnvelope(changedEcho, 6);
        Assert.Equal(3, unrestricted.RootElement.GetProperty("matched").GetInt32());
        Assert.Equal(string.Empty, changedEcho.GetProperty("search").GetString());
        Assert.Empty(changedEcho.GetProperty("filters").EnumerateArray());
        Assert.False(changedEcho.TryGetProperty("filterGroup", out _));
        Assert.Empty(changedEcho.GetProperty("groupBy").EnumerateArray());
    }

    private static void AssertEnvelope(JsonElement query, int limit) {
        Assert.Equal("canopyx/2", query.GetProperty("protocol").GetString());
        Assert.Equal("gridQuery", query.GetProperty("type").GetString());
        Assert.Equal("fleet", query.GetProperty("view").GetString());
        Assert.Equal("r1", query.GetProperty("revision").GetString());
        Assert.Equal(0, query.GetProperty("offset").GetInt32());
        Assert.Equal(limit, query.GetProperty("limit").GetInt32());
        Assert.Equal(JsonValueKind.Array, query.GetProperty("sort").ValueKind);
        Assert.Equal(JsonValueKind.Array, query.GetProperty("filters").ValueKind);
    }
}
