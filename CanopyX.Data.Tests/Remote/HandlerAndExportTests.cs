using System.Text;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class HandlerAndExportTests {
    private static readonly List<Host> Hosts = new List<Host> {
        new Host { Id = 1, Name = "alpha", Site = "Oslo", Os = OsFamily.Linux, Cores = 4, Memory = 1234.5, Online = true, LastSeen = new DateTime(2026, 3, 1, 12, 30, 0, DateTimeKind.Utc), Notes = "=SUM(A1)" },
        new Host { Id = 2, Name = "beta, \"quoted\"", Site = null, Os = OsFamily.Windows, Cores = null, Memory = -2, Online = false, LastSeen = null, Notes = "line\nbreak" },
        new Host { Id = 3, Name = "gamma", Site = "Austin", Os = OsFamily.MacOs, Cores = 16, Memory = 0.25, Online = true, LastSeen = new DateTime(2026, 3, 2, 0, 0, 0, 5, DateTimeKind.Utc), Notes = "+cmd|' /C calc'!A0" },
        new Host { Id = 4, Name = "-delta", Site = "Oslo", Os = OsFamily.Linux, Cores = 2, Memory = 8, Online = true, LastSeen = null, Notes = "@user" }
    };

    private static async Task<string> Csv(CanopyRemoteHandler handler, string request, string format = "csv") {
        var job = await handler.PrepareExportAsync(request, format);
        using var stream = new MemoryStream();
        await job.WriteAsync(stream);
        var bytes = stream.ToArray();
        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes.Take(3));
        return Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
    }

    private const string Query = "{\"view\":\"fleet\",\"revision\":\"r1\",\"sort\":[{\"column\":\"name\",\"direction\":\"asc\"}],\"filters\":[{\"column\":\"online\",\"operator\":\"eq\",\"values\":[true]}]}";

    [Theory]
    [InlineData(ProviderKind.Reference)]
    [InlineData(ProviderKind.Linq)]
    public async Task Csv_DisplayValues_QuoteAndProtectFormulas(ProviderKind kind) {
        var handler = new Harness(Hosts, kind).Handler;
        var csv = await Csv(handler, "{\"scope\":\"all\",\"revision\":\"r1\",\"query\":" + Query + ",\"columns\":[\"name\",\"cores\",\"memory\",\"online\",\"lastSeen\",\"notes\"]}");
        Assert.Equal(
            "Name,Cores,Memory (GB),Online,Last seen,Notes\r\n" +
            "'-delta,2,8,Yes,,'@user\r\n" +
            "alpha,4,\"1,234.5\",Yes,2026-03-01 12:30 UTC,'=SUM(A1)\r\n" +
            "\"beta, \"\"quoted\"\"\",,'-2,No,,\"line\nbreak\"\r\n" +
            "gamma,16,0.25,Yes,2026-03-02 00:00 UTC,'+cmd|' /C calc'!A0\r\n", csv);
    }

    [Theory]
    [InlineData(ProviderKind.Reference)]
    [InlineData(ProviderKind.Linq)]
    public async Task Csv_RawValues_KeepNumbersNumericAndDatesIso(ProviderKind kind) {
        var handler = new Harness(Hosts, kind).Handler;
        var csv = await Csv(handler, "{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":" + Query + ",\"values\":\"raw\",\"columns\":[\"name\",\"memory\",\"lastSeen\",\"os\"],\"recordCount\":3}");
        Assert.Equal("Name,Memory (GB),Last seen,Operating system\r\n'-delta,8,,Linux\r\nalpha,1234.5,2026-03-01T12:30:00Z,Linux\r\ngamma,0.25,2026-03-02T00:00:00.005Z,MacOs\r\n", csv);
    }

    [Theory]
    [InlineData(ProviderKind.Reference)]
    [InlineData(ProviderKind.Linq)]
    public async Task Export_Scopes_SelectTheirRecords(ProviderKind kind) {
        var handler = new Harness(Hosts, kind).Handler;
        var selected = await Csv(handler, "{\"scope\":\"selected\",\"revision\":\"r1\",\"query\":" + Query + ",\"selection\":[\"2\",\"3\"],\"columns\":[\"name\"]}");
        Assert.Equal("Name\r\n\"beta, \"\"quoted\"\"\"\r\ngamma\r\n", selected);
        var everyMatch = await Csv(handler, "{\"scope\":\"selected\",\"revision\":\"r1\",\"query\":" + Query + ",\"selection\":[],\"columns\":[\"name\"]," +
            "\"querySelection\":{\"kind\":\"query\",\"revision\":\"r1\",\"query\":" + Query + ",\"excludedIds\":[\"1\"]}}");
        Assert.Equal("Name\r\n'-delta\r\ngamma\r\n", everyMatch);
        var missing = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.PrepareExportAsync("{\"scope\":\"selected\",\"revision\":\"r1\",\"query\":{},\"selection\":[\"2\",\"99\"]}", "csv"));
        Assert.Equal(CanopyRequestError.InvalidExport, missing.Error);
        var changed = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.PrepareExportAsync("{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":" + Query + ",\"recordCount\":2}", "csv"));
        Assert.Equal(CanopyRequestError.StaleRevision, changed.Error);
        var stale = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.PrepareExportAsync("{\"scope\":\"all\",\"revision\":\"r0\",\"query\":{}}", "csv"));
        Assert.Equal(CanopyRequestError.StaleRevision, stale.Error);
        var format = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.PrepareExportAsync("{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{}}", "xlsx"));
        Assert.Equal(CanopyRequestError.UnknownFormat, format.Error);
    }

    [Fact]
    public async Task Export_RecordsThatChangeWhileWriting_FailTheFile() {
        var harness = new Harness(Hosts, ProviderKind.Reference);
        var handler = new CanopyRemoteHandler(harness.Schema, new ShrinkingProvider(harness.Provider));
        var job = await handler.PrepareExportAsync("{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{}}", "csv");
        Assert.Equal(4, job.RecordCount);
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => job.WriteAsync(Stream.Null));
        Assert.Equal(CanopyRequestError.StaleRevision, error.Error);
    }

    [Fact]
    public async Task Csv_RawTextInANumberColumn_IsStillProtected() {
        var view = Fleet.View();
        var map = new CanopyColumnMap<Host>(view).Key(x => x.Id).Column("name", x => x.Name)
            .Column("memory", x => x.Memory, c => c.Cell(_ => new CanopyCell("=HYPERLINK(\"x\")")))
            .Column("cores", x => x.Cores).Column("site", x => x.Site).Column("os", x => x.Os).Column("online", x => x.Online)
            .Column("lastSeen", x => x.LastSeen).Column("owner", x => x.Owner!.Name);
        var handler = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Host>(Hosts.AsQueryable(), map));
        var csv = await Csv(handler, "{\"scope\":\"all\",\"revision\":\"live\",\"query\":{},\"values\":\"raw\",\"columns\":[\"memory\"]}");
        Assert.DoesNotContain("\r\n=", csv);
        Assert.Contains("\"'=HYPERLINK(\"\"x\"\")\"", csv);
    }

    private sealed class ShrinkingProvider : ICanopyDataProvider {
        private readonly ICanopyDataProvider _inner;
        public ShrinkingProvider(ICanopyDataProvider inner) { _inner = inner; }
        public ValueTask<string> GetRevisionAsync(CancellationToken cancellationToken) => _inner.GetRevisionAsync(cancellationToken);
        public ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken) => _inner.QueryAsync(request, cancellationToken);
        public ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken cancellationToken) => _inner.CountAsync(request, cancellationToken);
        public IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, CancellationToken cancellationToken) => _inner.ReadAsync(request.WithWindow(request.Offset, request.Limit - 1), cancellationToken);
        public ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken) => _inner.FacetAsync(request, cancellationToken);
        public ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken cancellationToken) => _inner.SummarizeAsync(request, cancellationToken);
    }

    [Fact]
    public async Task Export_RowLimit_RejectsBeforeWriting() {
        var options = new CanopyRemoteOptions();
        options.Limits.MaxExportRows = 3;
        var handler = new Harness(Hosts, ProviderKind.Linq, options: options).Handler;
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.PrepareExportAsync("{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{}}", "csv"));
        Assert.Equal(CanopyRequestError.LimitExceeded, error.Error);
        var job = await handler.PrepareExportAsync("{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":" + Query + "}", "csv");
        Assert.Equal(3, job.RecordCount);
        Assert.Equal("text/csv; charset=utf-8", job.ContentType);
        Assert.Equal("fleet.csv", job.FileName);
        await job.WriteAsync(Stream.Null);
        await Assert.ThrowsAsync<InvalidOperationException>(() => job.WriteAsync(Stream.Null));
    }

    [Fact]
    public async Task Export_CustomFormat_IsOfferedAndStreams() {
        var options = new CanopyRemoteOptions();
        options.ExportFormats.Add(new LinesFormat());
        options.ExportFormats.Add(new CanopyCsvExportFormat(';'));
        var handler = new Harness(Hosts, ProviderKind.Reference, options: options).Handler;
        Assert.Contains("lines", handler.ExportFormats);
        var job = await handler.PrepareExportAsync("{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":" + Query + ",\"columns\":[\"name\",\"memory\"],\"locale\":\"de-DE\"}", "lines");
        using var stream = new MemoryStream();
        await job.WriteAsync(stream);
        Assert.Equal("-delta|8\nalpha|1.234,5\ngamma|0,25\n", Encoding.UTF8.GetString(stream.ToArray()));
        var semicolons = await Csv(handler, "{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":" + Query + ",\"columns\":[\"name\",\"site\"]}");
        Assert.StartsWith("Name;Site\r\n", semicolons);
        Assert.Throws<ArgumentException>(() => new CanopyRemoteHandler(handler.Schema, handler.Provider, Bad()));
    }

    private static CanopyRemoteOptions Bad() {
        var options = new CanopyRemoteOptions();
        options.ExportFormats.Add(new LinesFormat("Bad Id"));
        return options;
    }

    [Fact]
    public async Task Summary_EchoesTheQueryExactlyAsSent() {
        var handler = new Harness(Hosts, ProviderKind.Linq, grouped: true).Handler;
        const string query = "{\"protocol\":\"canopyx/2\",\"type\":\"gridQuery\",\"view\":\"fleet\",\"revision\":\"r1\",\"offset\":0,\"limit\":50,\"search\":\"\",\"sort\":[{\"column\":\"site\",\"direction\":\"asc\"}],\"filters\":[{\"column\":\"lastSeen\",\"operator\":\"ge\",\"values\":[\"2026-03-01T14:00:00+02:00\"]}]}";
        using var summary = JsonDocument.Parse(await handler.SummaryAsync(query));
        using (var sent = JsonDocument.Parse(query)) Assert.True(JsonElementEquals(sent.RootElement, summary.RootElement.GetProperty("query")));
        Assert.Equal(2, summary.RootElement.GetProperty("matched").GetInt32());
        var ungrouped = new Harness(Hosts, ProviderKind.Linq, view: Plain()).Handler;
        Assert.Equal(CanopyRequestError.Unsupported, (await Assert.ThrowsAsync<CanopyRequestException>(() => ungrouped.SummaryAsync(query))).Error);
        Assert.Equal(CanopyRequestError.InvalidDocument, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.SummaryAsync("{\"sort\":[]}"))).Error);
    }

    [Fact]
    public void FacetProjection_DropsNestedPredicatesOfItsColumn() {
        var schema = Fleet.Map(Fleet.View()).Schema;
        var facet = CanopyRequestParser.ParseFacet("{\"column\":\"site\",\"includeCurrentFilter\":false,\"query\":{\"revision\":\"r1\",\"filters\":[{\"column\":\"cores\",\"operator\":\"gt\",\"values\":[1]}]," +
            "\"filterGroup\":{\"operator\":\"and\",\"filters\":[{\"column\":\"site\",\"operator\":\"eq\",\"values\":[\"Oslo\"]},{\"column\":\"online\",\"operator\":\"eq\",\"values\":[true]}],\"groups\":[]}}}", schema);
        var root = Assert.IsType<CanopyFilterGroup>(facet.Query.Filter);
        Assert.Equal(new[] { "cores", "online" }, root.Children.Cast<CanopyFilterCondition>().Select(condition => condition.Column.Id));
        Assert.Null(CanopyFilters.WithoutColumn(new CanopyFilterGroup(CanopyGridFilterJunction.Any, new CanopyFilterNode[] {
            new CanopyFilterCondition(schema.GetColumn("site"), CanopyGridFilterOperator.IsNull, Array.Empty<object>()),
            new CanopyFilterCondition(schema.GetColumn("cores"), CanopyGridFilterOperator.IsNull, Array.Empty<object>()) }), "site"));
    }

    [Fact]
    public async Task Page_IsAValidProtocolDocument() {
        var handler = new Harness(Hosts, ProviderKind.Linq).Handler;
        using var page = JsonDocument.Parse(await handler.QueryAsync("{\"limit\":2,\"sort\":[{\"column\":\"memory\",\"direction\":\"desc\"}]}"));
        var root = page.RootElement;
        Assert.Equal("canopyx/2", root.GetProperty("protocol").GetString());
        Assert.Equal("gridPage", root.GetProperty("type").GetString());
        Assert.Equal("fleet", root.GetProperty("view").GetString());
        Assert.Equal("r1", root.GetProperty("revision").GetString());
        Assert.Equal(4, root.GetProperty("total").GetInt32());
        var first = root.GetProperty("items")[0];
        Assert.Equal("1", first.GetProperty("id").GetString());
        Assert.Equal("Linux", first.GetProperty("cells").GetProperty("os").GetString());
        Assert.Equal("2026-03-01T12:30:00Z", first.GetProperty("cells").GetProperty("lastSeen").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("items")[1].GetProperty("cells").GetProperty("lastSeen").ValueKind);
    }

    [Fact]
    public async Task CellFormatterAndRowDecorator_ShapeTheWrittenRows() {
        var view = Fleet.View();
        var map = new CanopyColumnMap<Host>(view).Key(x => x.Id)
            .Column("name", x => x.Name)
            .Column("memory", x => x.Memory, c => c.Cell(value => new CanopyCell(value) { Text = value.ToString(System.Globalization.CultureInfo.InvariantCulture) + " GB", Tone = value < 1 ? CanopyTone.Warning : default }))
            .Column("cores", x => x.Cores).Column("site", x => x.Site).Column("os", x => x.Os).Column("online", x => x.Online)
            .Column("lastSeen", x => x.LastSeen).Column("owner", x => x.Owner!.Name)
            .DecorateRows(row => row.ClassName = "fleet-row");
        var handler = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Host>(Hosts.AsQueryable(), map));
        using var page = JsonDocument.Parse(await handler.QueryAsync("{\"filters\":[{\"column\":\"name\",\"operator\":\"eq\",\"values\":[\"GAMMA\"]}]}"));
        var row = page.RootElement.GetProperty("items")[0];
        Assert.Equal("fleet-row", row.GetProperty("className").GetString());
        Assert.Equal("0.25 GB", row.GetProperty("cells").GetProperty("memory").GetProperty("text").GetString());
        Assert.Equal("warning", row.GetProperty("cells").GetProperty("memory").GetProperty("tone").GetString());
        Assert.Equal("live", page.RootElement.GetProperty("revision").GetString());
    }

    private static bool JsonElementEquals(JsonElement left, JsonElement right) {
        if (left.ValueKind != right.ValueKind) return false;
        switch (left.ValueKind) {
            case JsonValueKind.Object:
                var a = left.EnumerateObject().ToList();
                var b = right.EnumerateObject().ToList();
                return a.Count == b.Count && a.Zip(b, (x, y) => x.Name == y.Name && JsonElementEquals(x.Value, y.Value)).All(same => same);
            case JsonValueKind.Array:
                return left.GetArrayLength() == right.GetArrayLength() && left.EnumerateArray().Zip(right.EnumerateArray(), JsonElementEquals).All(same => same);
            case JsonValueKind.String: return left.GetString() == right.GetString();
            case JsonValueKind.Number: return left.GetRawText() == right.GetRawText();
            default: return true;
        }
    }

    private static CanopyDataGridView Plain() {
        var view = Fleet.View();
        view.Reporting = new CanopyGridReporting();
        return view;
    }

    private sealed class LinesFormat : ICanopyExportFormat {
        public LinesFormat(string id = "lines") { Id = id; }
        public string Id { get; }
        public string ContentType => "text/plain";
        public string Extension => "txt";
        public async Task WriteAsync(CanopyExportContext context, Stream output, CancellationToken cancellationToken) {
            await foreach (var row in context.Records.WithCancellation(cancellationToken)) {
                var line = string.Join("|", context.Columns.Select(column => context.GetText(row, column))) + "\n";
                var bytes = Encoding.UTF8.GetBytes(line);
                await output.WriteAsync(bytes, 0, bytes.Length, cancellationToken);
            }
        }
    }
}
