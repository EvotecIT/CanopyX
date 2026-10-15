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
        var view = new CanopyDataGridView("summary", "Summary") { Source = CanopyGridSource.HostedOffset(), Reporting = new CanopyGridReporting { Groupable = true } };
        view.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        view.Columns.Add(new CanopyColumn("value", "Value") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("site"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("count", "value", CanopyGridAggregateOperation.Count, "Count"));
        var map = new CanopyColumnMap<Record>(view).Key(row => row.Id).Column("site", row => row.Site).Column("value", row => row.Value);
        var provider = new CanopyQueryableProvider<Record>(new[] { new Record { Id = 1, Site = "A", Value = 2 } }.AsQueryable(), map,
            new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        var summary = await new CanopyRemoteHandler(map.Schema, provider).SummaryAsync(request);
        ProtocolSchema.AssertValid(summary, "summary of an accepted request");
    }

    private sealed class Record {
        public int Id { get; set; }
        public string Site { get; set; } = string.Empty;
        public int Value { get; set; }
    }
}
