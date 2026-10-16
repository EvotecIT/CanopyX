using System.Text.Json;
using CanopyX.Data;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>The gridRangeQuery and gridRangePage documents: writers, invariants and the protocol schema.</summary>
public sealed class GridRangeContractTests {
    private static readonly DateTime From = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime To = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);

    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("maintenance", "Maintenance") { Source = CanopyGridSource.HostedOffset() };
        view.Columns.Add(new CanopyColumn("title", "Title") { Sortable = true });
        view.Columns.Add(new CanopyColumn("host", "Host"));
        view.Columns.Add(new CanopyColumn("starts", "Starts") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("ends", "Ends") { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("rule", "Repeats") { Hidden = true });
        view.Columns.Add(new CanopyColumn("seriesEnd", "Series end") { Kind = CanopyColumnKind.DateTime, Hidden = true });
        view.Columns.Add(new CanopyColumn("severity", "Severity") { Kind = CanopyColumnKind.Number });
        return view;
    }

    private static CanopyGridRangeQuery Request(CanopyDataGridView view) {
        var query = new CanopyGridQuery(view.Id) { Search = "patch", Revision = "r1" };
        query.Sort.Add(new CanopyGridSort("title"));
        var request = new CanopyGridRangeQuery(query, "starts", From, To) {
            End = "ends", Recurrence = "rule", SeriesEnd = "seriesEnd", Resource = "host", CalendarView = "month", Limit = 250
        };
        request.Resources.Add("host-1");
        request.Resources.Add("<script>");
        return request;
    }

    [Fact]
    public void RangeQuery_WritesTheSchemaValidRequest() {
        var view = View();
        var json = Request(view).ToJson(view);
        ProtocolSchema.AssertValid(json, "range request");
        Assert.DoesNotContain("<script>", json);
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal(new[] { "protocol", "type", "view", "query", "from", "to", "start", "end", "recurrence", "seriesEnd", "resource", "resources", "calendarView", "limit" },
            root.EnumerateObject().Select(property => property.Name));
        Assert.Equal("gridRangeQuery", root.GetProperty("type").GetString());
        Assert.Equal("2026-10-01T00:00:00Z", root.GetProperty("from").GetString());
        Assert.Equal("2026-11-01T00:00:00Z", root.GetProperty("to").GetString());
        Assert.Equal("gridQuery", root.GetProperty("query").GetProperty("type").GetString());
        Assert.Equal("r1", root.GetProperty("query").GetProperty("revision").GetString());
        Assert.Equal(new[] { "host-1", "<script>" }, root.GetProperty("resources").EnumerateArray().Select(item => item.GetString()));
        Assert.Equal(250, root.GetProperty("limit").GetInt32());

        var minimal = new CanopyGridRangeQuery(new CanopyGridQuery(view.Id), "starts", From.AddMilliseconds(5).AddTicks(9), To).ToJson(view);
        ProtocolSchema.AssertValid(minimal, "minimal range request");
        using var small = JsonDocument.Parse(minimal);
        Assert.Equal(new[] { "protocol", "type", "view", "query", "from", "to", "start", "limit" }, small.RootElement.EnumerateObject().Select(property => property.Name));
        Assert.Equal("2026-10-01T00:00:00.005Z", small.RootElement.GetProperty("from").GetString());
        Assert.Equal(5000, small.RootElement.GetProperty("limit").GetInt32());
    }

    [Fact]
    public void RangeQuery_RejectsInvalidWindowsBindingsAndBounds() {
        var view = View();
        var query = new CanopyGridQuery(view.Id);
        Assert.Throws<ArgumentException>(() => new CanopyGridRangeQuery(query, "starts", To, From));
        Assert.Throws<ArgumentException>(() => new CanopyGridRangeQuery(query, "starts", From, From.AddTicks(9999)));
        Assert.Throws<ArgumentException>(() => new CanopyGridRangeQuery(query, "starts", From, From.AddDays(3700).AddMilliseconds(1)));
        Assert.Throws<ArgumentException>(() => new CanopyGridRangeQuery(query, "", From, To));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridRangeQuery(query, "starts", DateTime.MinValue, To));
        _ = new CanopyGridRangeQuery(query, "starts", From, From.AddDays(3700)).ToJson(view);
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridRangeQuery(query, "starts", From, To) { Limit = 0 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridRangeQuery(query, "starts", From, To) { Limit = 10001 });

        void Rejects(Action<CanopyGridRangeQuery> change, CanopyGridQuery? other = null) {
            var request = new CanopyGridRangeQuery(other ?? new CanopyGridQuery(view.Id), "starts", From, To);
            change(request);
            Assert.Throws<InvalidOperationException>(() => request.ToJson(view));
        }
        Rejects(request => request.End = "title");
        Rejects(request => request.Recurrence = "starts");
        Rejects(request => request.SeriesEnd = "severity");
        Rejects(request => request.Resource = "missing");
        Rejects(request => request.Resources.Add("host-1"));
        Rejects(request => { request.Resource = "host"; request.Resources.Add("a"); request.Resources.Add("a"); });
        Rejects(request => { request.Resource = "host"; request.Resources.Add(""); });
        Rejects(request => { request.Resource = "host"; foreach (var i in Enumerable.Range(0, 1001)) request.Resources.Add("h" + i); });
        Rejects(request => request.CalendarView = "decade");
        Rejects(_ => { }, new CanopyGridQuery(view.Id) { Offset = 50 });
        Rejects(_ => { }, new CanopyGridQuery("another"));
        Assert.Throws<InvalidOperationException>(() => new CanopyGridRangeQuery(new CanopyGridQuery(view.Id), "title", From, To).ToJson(view));
        var cursor = View();
        cursor.Source = CanopyGridSource.HostedCursor();
        cursor.Presentation = CanopyGridPresentation.Paged;
        Assert.Throws<InvalidOperationException>(() => new CanopyGridRangeQuery(new CanopyGridQuery(cursor.Id), "starts", From, To).ToJson(cursor));
    }

    private static CanopyGridRow Row(string id, DateTime? starts) {
        var row = new CanopyGridRow(id);
        row.Cells["title"] = new CanopyCell("Patch " + id);
        if (starts != null) row.Cells["starts"] = new CanopyCell(starts.Value);
        return row;
    }

    [Fact]
    public void RangePage_WritesTheSchemaValidAnswer() {
        var view = View();
        var page = new CanopyGridRangePage(view.Id, "r1", "starts", From, To.AddMilliseconds(250), 3);
        page.Rows.Add(Row("b", From.AddDays(-2)));
        page.Rows.Add(Row("a", From.AddDays(1)));
        page.Rows.Add(Row("c", From.AddDays(1)));
        var json = page.ToJson(view);
        ProtocolSchema.AssertValid(json, "range answer");
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal(new[] { "protocol", "type", "view", "revision", "from", "to", "matched", "truncated", "items" }, root.EnumerateObject().Select(property => property.Name));
        Assert.Equal("2026-11-01T00:00:00.250Z", root.GetProperty("to").GetString());
        Assert.False(root.GetProperty("truncated").GetBoolean());
        var truncated = new CanopyGridRangePage(view.Id, "r1", "starts", From, To, 9);
        truncated.Rows.Add(Row("a", From));
        Assert.True(JsonDocument.Parse(truncated.ToJson(view)).RootElement.GetProperty("truncated").GetBoolean());
        ProtocolSchema.AssertValid(new CanopyGridRangePage(view.Id, "r1", "starts", From, To, 0).ToJson(view), "empty range answer");
    }

    [Fact]
    public void RangePage_RejectsBrokenCountsOrderAndBindings() {
        var view = View();
        void Rejects(int matched, string start, params CanopyGridRow[] rows) {
            var page = new CanopyGridRangePage(view.Id, "r1", start, From, To, matched);
            foreach (var row in rows) page.Rows.Add(row);
            Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        }
        Rejects(1, "starts", Row("a", From), Row("b", From));
        Rejects(2, "starts");
        Rejects(2, "starts", Row("b", From.AddDays(1)), Row("a", From));
        Rejects(1, "starts", Row("a", To));
        Rejects(1, "starts", Row("a", null));
        Rejects(2, "starts", Row("a", From), Row("a", From));
        Rejects(1, "title", Row("a", From));
        var unknown = Row("a", From);
        unknown.Cells["secret"] = new CanopyCell("x");
        Rejects(1, "starts", unknown);
        var other = new CanopyGridRangePage("other", "r1", "starts", From, To, 0);
        Assert.Throws<InvalidOperationException>(() => other.ToJson(view));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridRangePage(view.Id, "r1", "starts", From, To, -1));
        Assert.Throws<ArgumentException>(() => new CanopyGridRangePage(view.Id, "r1", "starts", To, From, 0));
        Assert.Throws<ArgumentException>(() => new CanopyGridRangePage(view.Id, "", "starts", From, To, 0));
    }

    [Theory]
    [InlineData("from", "\"2026-10-01T00:00:00+02:00\"")]
    [InlineData("limit", "10001")]
    [InlineData("limit", "0")]
    [InlineData("resources", "[]")]
    [InlineData("resources", "[\"a\",\"a\"]")]
    [InlineData("calendarView", "\"decade\"")]
    [InlineData("futureField", "true")]
    public void Schema_RejectsInvalidRangeRequests(string property, string value) {
        var view = View();
        var json = ProtocolSchema.Mutate(Request(view).ToJson(view), node => node[property] = System.Text.Json.Nodes.JsonNode.Parse(value));
        Assert.False(ProtocolSchema.Evaluate(json).IsValid, property + " = " + value);
    }

    [Theory]
    [InlineData("truncated", null)]
    [InlineData("matched", "-1")]
    [InlineData("to", "\"2026-11-01\"")]
    [InlineData("futureField", "true")]
    public void Schema_RejectsInvalidRangeAnswers(string property, string? value) {
        var view = View();
        var page = new CanopyGridRangePage(view.Id, "r1", "starts", From, To, 1);
        page.Rows.Add(Row("a", From));
        var json = ProtocolSchema.Mutate(page.ToJson(view), node => {
            if (value == null) node.Remove(property); else node[property] = System.Text.Json.Nodes.JsonNode.Parse(value);
        });
        Assert.False(ProtocolSchema.Evaluate(json).IsValid, property);
    }

    [Fact]
    public async Task RemoteHandler_AnswersSchemaValidRangePages() {
        var view = View();
        var map = new CanopyColumnMap<Record>(view).Key(row => row.Id).Column("title", row => row.Title).Column("host", row => row.Host)
            .Column("starts", row => row.Starts).Column("ends", row => row.Ends).Column("rule", row => row.Rule).Column("seriesEnd", row => row.SeriesEnd);
        var records = new[] {
            new Record { Id = 1, Title = "Patch", Host = "host-1", Starts = From.AddHours(3), Ends = From.AddHours(5) },
            new Record { Id = 2, Title = "Patch backup", Host = "<script>", Starts = From.AddDays(-3), Rule = "FREQ=DAILY" },
            new Record { Id = 3, Title = "Old", Host = "host-1", Starts = From.AddDays(-3), Ends = From.AddDays(-2) }
        };
        var handler = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Record>(records.AsQueryable(), map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") }));
        var answer = await handler.RangeAsync(CanopyRequestParser.FromRangeQuery(Request(view), map.Schema));
        ProtocolSchema.AssertValid(answer, "range answer of the handler");
        using var document = JsonDocument.Parse(answer);
        Assert.Equal(new[] { "2", "1" }, document.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetString()));
    }

    private sealed class Record {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Host { get; set; }
        public DateTime? Starts { get; set; }
        public DateTime? Ends { get; set; }
        public string? Rule { get; set; }
        public DateTime? SeriesEnd { get; set; }
    }
}
