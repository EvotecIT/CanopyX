using System.Text.Json;
using CanopyX.Data;

namespace CanopyX.Tests.Protocol;

/// <summary>Every accepted summary shorthand is expanded into the public protocol schema.</summary>
public sealed class RemoteSummarySchemaTests {
    [Theory]
    [InlineData("{\"revision\":\"r1\"}")]
    [InlineData("{\"revision\":\"r1\",\"offset\":12,\"limit\":3,\"cursor\":null,\"extra\":true}")]
    [InlineData("{\"revision\":\"r1\",\"sort\":[{\"column\":\"value\",\"extra\":true}],\"groupBy\":[]}")]
    [InlineData("{\"revision\":\"r1\",\"filters\":[{\"column\":\"value\",\"operator\":\"ge\",\"values\":[1],\"extra\":true}],\"filterGroup\":{\"operator\":\"or\",\"filters\":[{\"column\":\"site\",\"operator\":\"eq\",\"values\":[\"A\"]}],\"extra\":true}}")]
    public async Task SummaryFromAcceptedRequest_MatchesSchema(string request) {
        var summary = await CreateHandler().SummaryAsync(request);
        ProtocolSchema.AssertValid(summary, "summary of an accepted request");
    }

    [Theory]
    [InlineData(0, false, 37)]
    [InlineData(10001, false, 37)]
    [InlineData(0, true, 37)]
    [InlineData(10001, true, 37)]
    [InlineData(1, false, 1)]
    [InlineData(10000, true, 10000)]
    public async Task CodeBuiltSummaryWindow_EchoesSchemaValidLimit(int limit, bool derived, int expected) {
        var handler = CreateHandler();
        var query = derived
            ? new CanopyDataRequest(handler.Schema, revision: "r1").WithWindow(13, limit)
            : new CanopyDataRequest(handler.Schema, offset: 13, limit: limit, revision: "r1");
        var summary = await handler.SummaryAsync(new CanopySummaryRequest(query));
        ProtocolSchema.AssertValid(summary, "summary with a code-built result window");
        using var document = JsonDocument.Parse(summary);
        var root = document.RootElement;
        Assert.Equal(expected, root.GetProperty("query").GetProperty("limit").GetInt32());
        Assert.Equal(0, root.GetProperty("query").GetProperty("offset").GetInt32());
        Assert.Equal(1, root.GetProperty("matched").GetInt32());
        Assert.Single(root.GetProperty("groups").EnumerateArray());
    }

    private static CanopyRemoteHandler CreateHandler() {
        var view = new CanopyDataGridView("summary", "Summary") { Source = CanopyGridSource.HostedOffset(), PageSize = 37, Reporting = new CanopyGridReporting { Groupable = true } };
        view.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        view.Columns.Add(new CanopyColumn("value", "Value") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("site"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("count", "value", CanopyGridAggregateOperation.Count, "Count"));
        var map = new CanopyColumnMap<Record>(view).Key(row => row.Id).Column("site", row => row.Site).Column("value", row => row.Value);
        var provider = new CanopyQueryableProvider<Record>(new[] { new Record { Id = 1, Site = "A", Value = 2 } }.AsQueryable(), map,
            new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        return new CanopyRemoteHandler(map.Schema, provider);
    }

    private sealed class Record {
        public int Id { get; set; }
        public string Site { get; set; } = string.Empty;
        public int Value { get; set; }
    }
}
