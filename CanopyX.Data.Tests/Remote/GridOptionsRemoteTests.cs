using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class GridOptionsRemoteTests {
    private static readonly Host[] Hosts = {
        new Host { Id = 1, Name = "alpha", Site = "A", Cores = 2 },
        new Host { Id = 2, Name = "beta", Site = "A", Cores = 4 },
        new Host { Id = 3, Name = "gamma", Site = "B", Cores = 8 }
    };
    private static CanopyDataGridView View() {
        var view = Fleet.View(); view.Reporting = null; view.PageSize = 50; view.Presentation = CanopyGridPresentation.Paged;
        foreach (var scope in new[] { CanopyGridFooterScope.Page, CanopyGridFooterScope.All }) {
            var footer = new CanopyGridFooter(scope == CanopyGridFooterScope.Page ? "page" : "all", "Totals", scope);
            footer.Aggregates.Add(new CanopyGridAggregate("cores", "cores", CanopyGridAggregateOperation.Sum, "Cores"));
            footer.Aggregates.Add(new CanopyGridAggregate("count", "name", CanopyGridAggregateOperation.Count, "Count"));
            view.Footers.Add(footer);
        }
        return view;
    }
    private static CanopyGridQuery Query(CanopyDataGridView view) {
        var query = new CanopyGridQuery(view.Id) { Offset = 1, Limit = 1, Revision = "r1" };
        query.Sort.Add(new CanopyGridSort("name")); query.Filters.Add(new CanopyGridFilter("site", CanopyGridFilterOperator.Equal, new CanopyCell("A")));
        return query;
    }

    [Theory]
    [InlineData(ProviderKind.Reference)]
    [InlineData(ProviderKind.Linq)]
    public async Task HostedFooters_UseActualAcceptedWindowAndFullFilteredSummary(ProviderKind kind) {
        var view = View(); var harness = new Harness(Hosts, kind, view: view);
        using var json = JsonDocument.Parse(await harness.Handler.QueryAsync(Query(view).ToJson(view)));
        var root = json.RootElement; var footers = root.GetProperty("footerValues");
        Assert.Equal(2, root.GetProperty("matched").GetInt32()); Assert.Equal("2", root.GetProperty("items")[0].GetProperty("id").GetString());
        Assert.Equal(4, footers.GetProperty("page").GetProperty("cores").GetDouble()); Assert.Equal(1, footers.GetProperty("page").GetProperty("count").GetDouble());
        Assert.Equal(6, footers.GetProperty("all").GetProperty("cores").GetDouble()); Assert.Equal(2, footers.GetProperty("all").GetProperty("count").GetDouble());
        var summaryQuery = Query(view); summaryQuery.Offset = 0; summaryQuery.Limit = view.PageSize;
        using var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync(summaryQuery.ToJson(view)));
        Assert.Equal(6, summary.RootElement.GetProperty("aggregates").GetProperty("cores").GetDouble()); Assert.True(harness.Schema.HasSummary);
    }

    [Theory]
    [InlineData(ProviderKind.Reference)]
    [InlineData(ProviderKind.Linq)]
    public async Task SummaryAndFooters_UnionDistinctReportingAndFooterAggregates(ProviderKind kind) {
        var view = View();
        view.Reporting = new CanopyGridReporting { Grouping = new CanopyGridGrouping("site") };
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("reportedCores", "cores", CanopyGridAggregateOperation.Sum, "Cores"));
        foreach (var footer in view.Footers) {
            footer.Aggregates.Clear();
            footer.Aggregates.Add(new CanopyGridAggregate("hostCount", "name", CanopyGridAggregateOperation.Count, "Hosts"));
        }
        var harness = new Harness(Hosts, kind, view: view);
        var query = new CanopyGridQuery(view.Id) { Offset = 1, Limit = 1, Revision = "r1" };
        query.Sort.Add(new CanopyGridSort("name"));
        using var page = JsonDocument.Parse(await harness.Handler.QueryAsync(query.ToJson(view)));
        Assert.Equal("2", Assert.Single(page.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetString());
        var footers = page.RootElement.GetProperty("footerValues");
        Assert.Equal(1, footers.GetProperty("page").GetProperty("hostCount").GetDouble());
        Assert.Equal(3, footers.GetProperty("all").GetProperty("hostCount").GetDouble());

        query.Offset = 0; query.Limit = view.PageSize;
        using var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync(query.ToJson(view)));
        var totals = summary.RootElement.GetProperty("aggregates");
        Assert.Equal(2, totals.EnumerateObject().Count());
        Assert.Equal(14, totals.GetProperty("reportedCores").GetDouble());
        Assert.Equal(3, totals.GetProperty("hostCount").GetDouble());
        var groups = summary.RootElement.GetProperty("groups").EnumerateArray().ToArray();
        Assert.Equal(new[] { "A", "B" }, groups.Select(group => group.GetProperty("value").GetString()));
        Assert.All(groups, group => Assert.Equal(2, group.GetProperty("aggregates").EnumerateObject().Count()));
        Assert.Equal(6, groups[0].GetProperty("aggregates").GetProperty("reportedCores").GetDouble());
        Assert.Equal(2, groups[0].GetProperty("aggregates").GetProperty("hostCount").GetDouble());
        Assert.Equal(8, groups[1].GetProperty("aggregates").GetProperty("reportedCores").GetDouble());
        Assert.Equal(1, groups[1].GetProperty("aggregates").GetProperty("hostCount").GetDouble());
    }

    [Theory]
    [InlineData(ProviderKind.Reference)]
    [InlineData(ProviderKind.Linq)]
    public async Task ContinuousPageFooters_UseFullMatchingSummaryRatherThanTransportWindow(ProviderKind kind) {
        var view = View(); view.Presentation = CanopyGridPresentation.Continuous; view.Footers.RemoveAt(1);
        var harness = new Harness(Hosts, kind, view: view);
        Assert.True(harness.Schema.HasSummary);
        using var json = JsonDocument.Parse(await harness.Handler.QueryAsync(Query(view).ToJson(view)));
        var footer = json.RootElement.GetProperty("footerValues").GetProperty("page");
        Assert.Equal(6, footer.GetProperty("cores").GetDouble()); Assert.Equal(2, footer.GetProperty("count").GetDouble());
    }

    [Theory]
    [InlineData(ProviderKind.Reference)]
    [InlineData(ProviderKind.Linq)]
    public async Task PageOnlyFooters_DoNotInvokeSummaryAndEmptyNumericScopesRemainNull(ProviderKind kind) {
        var view = View(); view.Footers.RemoveAt(1); var harness = new Harness(Hosts, kind, view: view);
        var provider = new HostProvider(harness.Provider) { Summary = _ => throw new InvalidOperationException("Page footers must not request summary.") };
        Assert.False(harness.Schema.HasSummary);
        var query = new CanopyGridQuery(view.Id) { Search = "no matches", Limit = 1, Revision = "r1" };
        using var json = JsonDocument.Parse(await new CanopyRemoteHandler(harness.Schema, provider).QueryAsync(query.ToJson(view)));
        var footer = json.RootElement.GetProperty("footerValues").GetProperty("page");
        Assert.Equal(JsonValueKind.Null, footer.GetProperty("cores").ValueKind); Assert.Equal(0, footer.GetProperty("count").GetDouble());
    }

    [Fact]
    public async Task HostCustomFooterValues_ArePreservedAndMissingUnsupportedTotalsStayUnavailable() {
        var view = View(); var custom = new CanopyGridAggregate("custom", "cores", "median", "Median");
        foreach (var footer in view.Footers) footer.Aggregates.Add(custom);
        var harness = new Harness(Hosts, ProviderKind.Reference, view: view);
        var provider = new HostProvider(harness.Provider) {
            Page = _ => {
                var result = new CanopyPageResult(3, 2, new[] { Row("2", 4) });
                result.FooterValues["page"] = new Dictionary<string, double?> { ["custom"] = 4 };
                result.FooterValues["all"] = new Dictionary<string, double?> { ["custom"] = null };
                return result;
            },
            Summary = _ => throw new CanopyRequestException(CanopyRequestError.Unsupported, "This host has no summary hook.")
        };
        using var json = JsonDocument.Parse(await new CanopyRemoteHandler(harness.Schema, provider).QueryAsync(Query(view).ToJson(view)));
        var footers = json.RootElement.GetProperty("footerValues");
        Assert.Equal(4, footers.GetProperty("page").GetProperty("custom").GetDouble());
        Assert.Equal(4, footers.GetProperty("page").GetProperty("cores").GetDouble());
        Assert.Equal(JsonValueKind.Null, footers.GetProperty("all").GetProperty("custom").ValueKind);
        Assert.False(footers.GetProperty("all").TryGetProperty("cores", out _));
    }

    [Fact]
    public async Task FooterSummary_RejectsARevisionChangeAndMismatchedMatchingCount() {
        var view = View(); var harness = new Harness(Hosts, ProviderKind.Reference, view: view);
        var revision = "r1";
        var provider = new HostProvider(harness.Provider) {
            Revision = () => revision,
            Summary = _ => { revision = "r2"; return new CanopySummaryResult(2, new Dictionary<string, double?> { ["cores"] = 6, ["count"] = 2 }, Array.Empty<CanopySummaryGroup>()); }
        };
        var handler = new CanopyRemoteHandler(harness.Schema, provider);
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.QueryAsync(Query(view).ToJson(view)));
        Assert.Equal(CanopyRequestError.StaleRevision, error.Error);
        revision = "r1"; provider.Summary = _ => new CanopySummaryResult(3, new Dictionary<string, double?>(), Array.Empty<CanopySummaryGroup>());
        error = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.QueryAsync(Query(view).ToJson(view)));
        Assert.Equal(CanopyRequestError.StaleRevision, error.Error);
    }

    [Theory]
    [InlineData(ProviderKind.Reference)]
    [InlineData(ProviderKind.Linq)]
    public async Task FixedPreSort_AppliesToDirectAndWireQueriesAndIsCapturedInSchema(ProviderKind kind) {
        var view = View(); view.Footers.Clear(); view.PreSort.Add(new CanopyGridSort("cores", true));
        view.GetColumn("cores").OrderData.Add("memory"); view.GetColumn("name").OrderData.Add("cores");
        var harness = new Harness(Hosts, kind, view: view); view.PreSort.Clear();
        var request = new CanopyDataRequest(harness.Schema, sort: new[] { new CanopySortKey(harness.Schema.GetColumn("name"), false) }, limit: 3);
        using var direct = JsonDocument.Parse(await harness.Handler.QueryAsync(request));
        Assert.Equal(new[] { "3", "2", "1" }, direct.RootElement.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
        using var wire = JsonDocument.Parse(await harness.Handler.QueryAsync("{\"view\":\"fleet\",\"limit\":3,\"sort\":[{\"column\":\"cores\",\"direction\":\"asc\"}]}"));
        Assert.Equal(new[] { "3", "2", "1" }, wire.RootElement.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
    }

    [Fact]
    public async Task NamedFilter_RequiresHostAllowListAndReachesHostWithTypedOperands() {
        var view = View(); view.Footers.Clear(); var query = new CanopyGridQuery(view.Id) { Limit = 1 };
        query.Filters.Add(new CanopyGridFilter("cores", "isEven", new CanopyCell(2)));
        var schema = new CanopyDataSchema(view, null, null, new[] { "isEven" });
        var request = CanopyRequestParser.ParseQuery(query.ToJson(view), schema);
        var filter = Assert.IsType<CanopyFilterCondition>(request.Filter);
        Assert.Equal("isEven", filter.CustomOperator); Assert.Equal(2d, Assert.IsType<double>(Assert.Single(filter.Values)));
        var inner = Fleet.Reference(schema, Hosts);
        CanopyFilterCondition? accepted = null;
        var provider = new HostProvider(inner) {
            Page = input => { accepted = Assert.IsType<CanopyFilterCondition>(input.Filter); return new CanopyPageResult(1, 1, new[] { Row("host", 2) }); }
        };
        using var result = JsonDocument.Parse(await new CanopyRemoteHandler(schema, provider).QueryAsync(query.ToJson(view)));
        Assert.Equal("isEven", accepted!.CustomOperator); Assert.Equal("host", result.RootElement.GetProperty("items")[0].GetProperty("id").GetString());
        Assert.Equal(CanopyRequestError.InvalidOperator, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseQuery(query.ToJson(view), new CanopyDataSchema(view))).Error);
        var unsupported = await Assert.ThrowsAsync<CanopyRequestException>(() => inner.QueryAsync(request, CancellationToken.None).AsTask());
        Assert.Equal(CanopyRequestError.Unsupported, unsupported.Error);
    }

    [Theory]
    [InlineData(ProviderKind.Reference, false)]
    [InlineData(ProviderKind.Linq, false)]
    [InlineData(ProviderKind.Reference, true)]
    [InlineData(ProviderKind.Linq, true)]
    public async Task NamedSortComparator_BuiltInProvidersRejectInsteadOfSilentlyUsingOrdinaryOrder(ProviderKind kind, bool redirected) {
        var view = View(); view.Footers.Clear(); view.GetColumn("name").SortComparator = "natural";
        if (redirected) view.GetColumn("name").OrderData.Add("cores");
        var harness = new Harness(Hosts, kind, view: view);
        var request = new CanopyDataRequest(harness.Schema, sort: new[] { new CanopySortKey(harness.Schema.GetColumn("name"), false) });
        Assert.Equal("name", Assert.Single(request.Sort).Column.Id);
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => harness.Handler.QueryAsync(request));
        Assert.Equal(CanopyRequestError.Unsupported, error.Error);
        Assert.Equal("natural", harness.Schema.GetColumn("name").Definition.SortComparator);
    }

    [Theory]
    [InlineData(ProviderKind.Reference)]
    [InlineData(ProviderKind.Linq)]
    public async Task OrderData_ExpandsBrowserAndDirectAliasesOnceWhileSummaryEchoRetainsAlias(ProviderKind kind) {
        var view = View(); view.GetColumn("name").OrderData.Add("cores");
        view.GetColumn("cores").OrderData.Add("memory");
        var harness = new Harness(Hosts, kind, view: view);
        var request = new CanopyDataRequest(harness.Schema, sort: new[] { new CanopySortKey(harness.Schema.GetColumn("name"), true) }, limit: 3, revision: "r1");
        Assert.Equal("name", Assert.Single(request.Sort).Column.Id);
        Assert.Equal(new[] { "cores" }, request.Sort[0].Column.Definition.OrderData);
        using var direct = JsonDocument.Parse(await harness.Handler.QueryAsync(request));
        Assert.Equal(new[] { "3", "2", "1" }, direct.RootElement.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
        const string browser = "{\"view\":\"fleet\",\"limit\":3,\"revision\":\"r1\",\"sort\":[{\"column\":\"name\",\"direction\":\"desc\"}]}";
        using var wire = JsonDocument.Parse(await harness.Handler.QueryAsync(browser));
        Assert.Equal(new[] { "3", "2", "1" }, wire.RootElement.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
        using var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync(browser));
        Assert.Equal("name", Assert.Single(summary.RootElement.GetProperty("query").GetProperty("sort").EnumerateArray()).GetProperty("column").GetString());
    }

    [Fact]
    public void ColumnDefaults_CannotReenableDeniedRemoteCapabilitiesOrUnavailableRedirectedKeys() {
        var view = View(); view.Footers.Clear();
        var defaults = new CanopyGridColumnDefaults { Sortable = true, Filterable = true }; defaults.Targets.Add("*"); view.ColumnDefaults.Add(defaults);
        view.GetColumn("name").OrderData.Add("site");
        var schema = new CanopyDataSchema(view, new[] { "name", "cores" });
        using var json = JsonDocument.Parse(schema.ToJson());
        var columns = json.RootElement.GetProperty("columns").EnumerateArray().ToDictionary(column => column.GetProperty("id").GetString()!);
        Assert.False(columns["site"].GetProperty("sortable").GetBoolean()); Assert.False(columns["site"].GetProperty("filterable").GetBoolean());
        Assert.False(columns["name"].GetProperty("sortable").GetBoolean()); Assert.False(schema.GetColumn("name").Sortable);
        Assert.Equal(CanopyRequestError.InvalidSort, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseQuery("{\"view\":\"fleet\",\"sort\":[{\"column\":\"name\"}]}", schema)).Error);
        view.PreSort.Add(new CanopyGridSort("site"));
        Assert.Throws<ArgumentException>(() => new CanopyDataSchema(view, new[] { "name", "cores" }));
    }

    private static CanopyGridRow Row(string id, int cores) { var row = new CanopyGridRow(id); row.Cells["name"] = id; row.Cells["cores"] = cores; return row; }

    private sealed class HostProvider : ICanopyDataProvider {
        private readonly ICanopyDataProvider _inner;
        internal HostProvider(ICanopyDataProvider inner) => _inner = inner;
        internal Func<CanopyDataRequest, CanopyPageResult>? Page { get; set; }
        internal Func<CanopySummaryRequest, CanopySummaryResult>? Summary { get; set; }
        internal Func<string>? Revision { get; set; }
        public ValueTask<string> GetRevisionAsync(CancellationToken token) => Revision == null ? _inner.GetRevisionAsync(token) : new ValueTask<string>(Revision());
        public ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken token) => Page == null ? _inner.QueryAsync(request, token) : new ValueTask<CanopyPageResult>(Page(request));
        public ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken token) => Summary == null ? _inner.SummarizeAsync(request, token) : new ValueTask<CanopySummaryResult>(Summary(request));
        public ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken token) => _inner.CountAsync(request, token);
        public IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, CancellationToken token) => _inner.ReadAsync(request, token);
        public ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken token) => _inner.FacetAsync(request, token);
    }
}
