using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Range requests are validated against the allow-list, the protocol bounds and the endpoint limits before any provider runs.</summary>
public sealed class RangeParserTests {
    private static readonly CanopyColumnMap<Slot> Map = Schedule.Map();
    private static readonly CanopyDataSchema Schema = Map.Schema;
    private const string Window = "\"from\":\"2026-10-01T00:00:00Z\",\"to\":\"2026-11-01T00:00:00Z\"";

    private static string Doc(string body, string query = "{}") => "{\"query\":" + query + "," + Window + ",\"start\":\"starts\"" + body + "}";

    [Fact]
    public void ParseRange_CompleteDocument_ResolvesTypedRequest() {
        var request = CanopyRequestParser.ParseRange("""
            {"protocol":"canopyx/2","type":"gridRangeQuery","view":"schedule",
             "query":{"protocol":"canopyx/2","type":"gridQuery","view":"schedule","offset":0,"limit":100,"search":"patch","revision":"r1",
                      "sort":[{"column":"severity","direction":"desc"}],"filters":[{"column":"kind","operator":"eq","values":["maintenance"]}]},
             "from":"2026-10-01T00:00:00.1239Z","to":"2026-11-01T00:00:00Z","start":"starts","end":"ends","recurrence":"rule","seriesEnd":"seriesEnd",
             "resource":"host","resources":["host-1","host-2"],"calendarView":"month","limit":250,"futureField":true}
            """, Schema);
        Assert.Equal(new DateTime(2026, 10, 1, 0, 0, 0, 123, DateTimeKind.Utc), request.From);
        Assert.Equal(DateTimeKind.Utc, request.To.Kind);
        Assert.Equal("starts", request.Start.Id);
        Assert.Equal("ends", request.End!.Id);
        Assert.Equal("rule", request.Recurrence!.Id);
        Assert.Equal("seriesEnd", request.SeriesEnd!.Id);
        Assert.Equal("host", request.Resource!.Id);
        Assert.Equal(new[] { "host-1", "host-2" }, request.Resources);
        Assert.Equal("month", request.CalendarView);
        Assert.Equal(250, request.Limit);
        Assert.Equal("r1", request.Query.Revision);
        // The selection is ungrouped, sorted by start only and windowed by the range limit; the query's sort does not apply.
        var selection = request.Selection;
        Assert.Equal(new[] { "starts" }, selection.Sort.Select(key => key.Column.Id));
        Assert.Empty(selection.Levels);
        Assert.Equal(0, selection.Offset);
        Assert.Equal(250, selection.Limit);
        Assert.Equal("patch", selection.Search);
        Assert.Equal("r1", selection.Revision);
        var root = Assert.IsType<CanopyFilterGroup>(selection.Filter);
        Assert.Equal(3, root.Children.Count);
        var resources = Assert.IsType<CanopyFilterCondition>(root.Children[1]);
        Assert.Equal(CanopyGridFilterOperator.In, resources.Operator);
    }

    [Theory]
    [InlineData("""{"type":"gridQuery"}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"protocol":"canopyx/1"}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"view":"other"}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""[]""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{oops""", CanopyRequestError.InvalidJson)]
    public void ParseRange_BadEnvelope_IsRejected(string envelope, CanopyRequestError error) {
        var json = envelope.StartsWith("{\"", StringComparison.Ordinal) ? envelope.Substring(0, envelope.Length - 1) + ",\"query\":{}," + Window + ",\"start\":\"starts\"}" : envelope;
        Assert.Equal(error, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRange(json, Schema)).Error);
    }

    [Theory]
    // Missing or malformed parts.
    [InlineData("{" + Window + ",\"start\":\"starts\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{},\"to\":\"2026-11-01T00:00:00Z\",\"start\":\"starts\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{}," + Window + "}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{\"type\":\"gridCursorQuery\"}," + Window + ",\"start\":\"starts\"}", CanopyRequestError.Unsupported)]
    [InlineData("{\"query\":{\"filters\":[{\"column\":\"secret\",\"operator\":\"eq\",\"values\":[\"x\"]}]}," + Window + ",\"start\":\"starts\"}", CanopyRequestError.UnknownColumn)]
    // Instants: UTC with Z only, reversed, empty and too long windows, out of range years.
    [InlineData("{\"query\":{},\"from\":\"2026-10-01T00:00:00+02:00\",\"to\":\"2026-11-01T00:00:00Z\",\"start\":\"starts\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{},\"from\":\"2026-10-01\",\"to\":\"2026-11-01T00:00:00Z\",\"start\":\"starts\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{},\"from\":\"2026-13-01T00:00:00Z\",\"to\":\"2027-11-01T00:00:00Z\",\"start\":\"starts\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{},\"from\":1,\"to\":\"2026-11-01T00:00:00Z\",\"start\":\"starts\"}", CanopyRequestError.InvalidJson)]
    [InlineData("{\"query\":{},\"from\":\"2026-11-01T00:00:00Z\",\"to\":\"2026-10-01T00:00:00Z\",\"start\":\"starts\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{},\"from\":\"2026-11-01T00:00:00Z\",\"to\":\"2026-11-01T00:00:00.0001Z\",\"start\":\"starts\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{},\"from\":\"2016-01-01T00:00:00Z\",\"to\":\"2026-11-01T00:00:00Z\",\"start\":\"starts\"}", CanopyRequestError.LimitExceeded)]
    [InlineData("{\"query\":{},\"from\":\"0001-01-01T00:00:00Z\",\"to\":\"0001-02-01T00:00:00Z\",\"start\":\"starts\"}", CanopyRequestError.InvalidDocument)]
    // Columns: on the allow-list, filterable and of the right kind.
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"secret\"}", CanopyRequestError.UnknownColumn)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"title\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"end\":\"severity\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"recurrence\":\"seriesEnd\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"seriesEnd\":\"rule\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"resource\":\"notes\"}", CanopyRequestError.ColumnNotFilterable)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"resource\":\"Password\"}", CanopyRequestError.UnknownColumn)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":5}", CanopyRequestError.InvalidJson)]
    // Resources: 1 to 1,000 unique nonempty strings, with the resource column.
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"resources\":[\"host-1\"]}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"resource\":\"host\",\"resources\":[]}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"resource\":\"host\",\"resources\":[\"\"]}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"resource\":\"host\",\"resources\":[\"a\",\"a\"]}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"resource\":\"host\",\"resources\":[1]}", CanopyRequestError.InvalidJson)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"resource\":\"host\",\"resources\":\"host-1\"}", CanopyRequestError.InvalidJson)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"resource\":\"host\",\"resources\":[\"\\ud800\"]}", CanopyRequestError.InvalidJson)]
    // Limit and calendar view.
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"limit\":0}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"limit\":10001}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"limit\":2.5}", CanopyRequestError.InvalidJson)]
    [InlineData("{\"query\":{}," + Window + ",\"start\":\"starts\",\"calendarView\":\"decade\"}", CanopyRequestError.InvalidDocument)]
    public void ParseRange_InvalidRequest_IsRejected(string json, CanopyRequestError error) =>
        Assert.Equal(error, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRange(json, Schema)).Error);

    [Fact]
    public void ParseRange_Resources_AreBounded() {
        string Many(int count) => Doc(",\"resource\":\"host\",\"resources\":[" + string.Join(",", Enumerable.Range(0, count).Select(i => "\"h" + i + "\"")) + "]");
        var limits = new CanopyRemoteLimits { MaxRequestBytes = 1048576 };
        Assert.Equal(1000, CanopyRequestParser.ParseRange(Many(1000), Schema, limits).Resources!.Count);
        Assert.Equal(CanopyRequestError.LimitExceeded, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRange(Many(1001), Schema, limits)).Error);
        var narrow = new CanopyRemoteLimits { MaxInValues = 10 };
        Assert.Equal(CanopyRequestError.LimitExceeded, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRange(Many(11), Schema, narrow)).Error);
        var shortOperands = new CanopyRemoteLimits { MaxOperandLength = 8 };
        Assert.Equal(CanopyRequestError.LimitExceeded, Assert.Throws<CanopyRequestException>(() =>
            CanopyRequestParser.ParseRange(Doc(",\"resource\":\"host\",\"resources\":[\"" + new string('h', 9) + "\"]"), Schema, shortOperands)).Error);
    }

    [Fact]
    public void ParseRange_Limit_DefaultsAndClampsToTheEndpointLimit() {
        Assert.Equal(5000, new CanopyRemoteLimits().MaxRangeRows);
        Assert.Equal(5000, CanopyRequestParser.ParseRange(Doc(""), Schema).Limit);
        Assert.Equal(10, CanopyRequestParser.ParseRange(Doc(",\"limit\":10"), Schema).Limit);
        var limits = new CanopyRemoteLimits { MaxRangeRows = 100 };
        Assert.Equal(100, CanopyRequestParser.ParseRange(Doc(",\"limit\":10000"), Schema, limits).Limit);
        Assert.Equal(100, CanopyRequestParser.ParseRange(Doc(""), Schema, limits).Limit);
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxRangeRows = 0 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxRangeRows = 10001 });
        Assert.Equal(10000, new CanopyRemoteLimits { MaxRangeRows = 10000 }.MaxRangeRows);
    }

    [Fact]
    public void ParseRange_LargeOrDeepRequest_IsRejectedBeforeParsing() {
        var limits = new CanopyRemoteLimits { MaxRequestBytes = 1024 };
        var large = Doc("", "{\"search\":\"" + new string('x', 2000) + "\"}");
        Assert.Equal(CanopyRequestError.LimitExceeded, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRange(large, Schema, limits)).Error);
        var deep = Doc(",\"futureField\":" + new string('[', 100) + new string(']', 100));
        Assert.Equal(CanopyRequestError.InvalidJson, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRange(deep, Schema)).Error);
    }

    [Fact]
    public void ParseRange_ErrorMessages_DoNotEchoClientInput() {
        var hostile = "<script>" + new string('x', 300);
        foreach (var json in new[] {
            "{\"query\":{}," + Window + ",\"start\":\"" + hostile + "\"}",
            "{\"query\":{},\"from\":\"" + hostile + "\",\"to\":\"2026-11-01T00:00:00Z\",\"start\":\"starts\"}",
            "{\"query\":{}," + Window + ",\"start\":\"starts\",\"calendarView\":\"" + hostile + "\"}"
        }) {
            var error = Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRange(json, Schema));
            Assert.DoesNotContain("script", error.Message);
            Assert.True(error.Message.Length < 200);
        }
    }

    [Fact]
    public async Task RangeAsync_StaleRevision_AnswersConflict() {
        var handler = Schedule.Reference(Schema, RangeOracleTests.Boundaries());
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RangeAsync(Doc("", "{\"revision\":\"r0\"}")));
        Assert.Equal(CanopyRequestError.StaleRevision, error.Error);
        Assert.Equal(409, error.StatusCode);
        Assert.Contains("\"revision\":\"r1\"", await handler.RangeAsync(Doc("", "{\"revision\":\"r1\"}")));
    }

    [Fact]
    public async Task RangeAsync_ProviderWithoutTheCapability_IsUnsupported() {
        var handler = new CanopyRemoteHandler(Schema, new PlainProvider());
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RangeAsync(Doc("")));
        Assert.Equal(CanopyRequestError.Unsupported, error.Error);
        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task RangeAsync_ProviderAnswerThatChangedMidway_AnswersStale() {
        var handler = new CanopyRemoteHandler(Schema, new ShortProvider());
        Assert.Equal(CanopyRequestError.StaleRevision, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RangeAsync(Doc("")))).Error);
    }

    [Fact]
    public async Task FromRangeQuery_TypedRequest_RoundTripsThroughTheWire() {
        var query = new CanopyGridQuery("schedule") { Search = "patch", Revision = "r1" };
        query.Filters.Add(new CanopyGridFilter("kind", CanopyGridFilterOperator.Equal, "maintenance"));
        var typed = new CanopyGridRangeQuery(query, "starts", Schedule.Epoch, Schedule.Epoch.AddDays(7)) {
            End = "ends", Recurrence = "rule", SeriesEnd = "seriesEnd", Resource = "host", CalendarView = "week", Limit = 20
        };
        typed.Resources.Add("host-1");
        var request = CanopyRequestParser.FromRangeQuery(typed, Schema);
        Assert.Equal(Schedule.Epoch, request.From);
        Assert.Equal(new[] { "host-1" }, request.Resources);
        Assert.Equal(20, request.Limit);
        var slots = Schedule.Slots(300);
        Assert.Equal(await Schedule.Reference(Schema, slots).RangeAsync(request), await Schedule.Linq(Map, slots).RangeAsync(request));
    }

    [Fact]
    public void RangeRequest_CodeBuilt_ValidatesItsColumnsAndWindow() {
        var query = new CanopyDataRequest(Schema);
        var starts = Schema.GetColumn("starts");
        Assert.Throws<ArgumentException>(() => new CanopyRangeRequest(query, Schedule.Epoch, Schedule.Epoch, starts));
        Assert.Throws<ArgumentException>(() => new CanopyRangeRequest(query, Schedule.Epoch, Schedule.Epoch.AddDays(3701), starts));
        Assert.Throws<ArgumentException>(() => new CanopyRangeRequest(query, Schedule.Epoch, Schedule.Epoch.AddDays(1), Schema.GetColumn("title")));
        Assert.Throws<ArgumentException>(() => new CanopyRangeRequest(query, Schedule.Epoch, Schedule.Epoch.AddDays(1), Fleet.Map(Fleet.View()).Schema.GetColumn("lastSeen")));
        Assert.Throws<ArgumentException>(() => new CanopyRangeRequest(query, Schedule.Epoch, Schedule.Epoch.AddDays(1), starts, resources: new[] { "host-1" }));
        Assert.Throws<ArgumentException>(() => new CanopyRangeRequest(query, Schedule.Epoch, Schedule.Epoch.AddDays(1), starts, resource: Schema.GetColumn("host"), resources: new string[0]));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRangeRequest(query, Schedule.Epoch, Schedule.Epoch.AddDays(1), starts, limit: 0));
        var local = new CanopyRangeRequest(query, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Unspecified).AddTicks(1234), Schedule.Epoch.AddDays(1), starts);
        Assert.Equal(Schedule.Epoch, local.From);
        Assert.Equal(DateTimeKind.Utc, local.From.Kind);
    }

    private class PlainProvider : ICanopyDataProvider {
        public ValueTask<string> GetRevisionAsync(CancellationToken cancellationToken) => new ValueTask<string>("r1");
        public ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    /// <summary>Reports more overlapping records than it returns below the limit, as a store written between the count and the read would.</summary>
    private sealed class ShortProvider : PlainProvider, ICanopyRangeProvider {
        public ValueTask<CanopyRangeResult> RangeAsync(CanopyRangeRequest request, CancellationToken cancellationToken) =>
            new ValueTask<CanopyRangeResult>(new CanopyRangeResult(3, Array.Empty<CanopyGridRow>()));
    }
}
