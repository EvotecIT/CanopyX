using Xunit;

namespace CanopyX.Data.Tests;

public sealed class RequestParserTests {
    private static readonly CanopyDataSchema Schema = Fleet.Map(Fleet.View()).Schema;

    private static CanopyRequestException Rejects(string json, CanopyRemoteLimits? limits = null) =>
        Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseQuery(json, Schema, limits));

    [Fact]
    public void ParseQuery_CompleteDocument_ResolvesTypedRequest() {
        var request = CanopyRequestParser.ParseQuery("""
            {"protocol":"canopyx/2","type":"gridQuery","view":"fleet","revision":"r7","offset":40,"limit":20,"search":"host \"team a\"","searchMode":"words",
             "sort":[{"column":"cores","direction":"desc"},{"column":"name","direction":"asc"}],
             "filters":[{"column":"cores","operator":"ge","values":[4]},{"column":"lastSeen","operator":"lt","values":["2026-01-01T02:00:00+02:00"]}],
             "filterGroup":{"operator":"or","filters":[{"column":"site","operator":"in","values":["Oslo","Austin"]}],"groups":[{"operator":"and","filters":[{"column":"online","operator":"eq","values":[true]}],"groups":[]}]},
             "futureField":{"ignored":true}}
            """, Schema);
        Assert.Equal("r7", request.Revision);
        Assert.Equal(40, request.Offset);
        Assert.Equal(20, request.Limit);
        Assert.Equal(new[] { "host", "team a" }, request.SearchTerms);
        Assert.Equal(new[] { "cores", "name" }, request.Sort.Select(key => key.Column.Id));
        Assert.True(request.Sort[0].Descending);
        var root = Assert.IsType<CanopyFilterGroup>(request.Filter);
        Assert.Equal(CanopyGridFilterJunction.All, root.Junction);
        Assert.Equal(3, root.Children.Count);
        var date = Assert.IsType<CanopyFilterCondition>(root.Children[1]);
        Assert.Equal(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), Assert.IsType<DateTime>(date.Values[0]));
        Assert.Equal(4d, Assert.IsType<double>(((CanopyFilterCondition)root.Children[0]).Values[0]));
        var group = Assert.IsType<CanopyFilterGroup>(root.Children[2]);
        Assert.Equal(CanopyGridFilterJunction.Any, group.Junction);
    }

    [Theory]
    [InlineData("""{"protocol":"canopyx/1"}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"type":"gridPage"}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"view":"other"}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"type":"gridCursorQuery"}""", CanopyRequestError.Unsupported)]
    [InlineData("""{"cursor":"abc"}""", CanopyRequestError.Unsupported)]
    [InlineData("""[]""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"offset":-1}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"offset":1.5}""", CanopyRequestError.InvalidJson)]
    [InlineData("""{"limit":0}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"limit":10001}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"search":5}""", CanopyRequestError.InvalidJson)]
    [InlineData("""{"searchMode":"regex"}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"revision":""}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"sort":[{"column":"notes","direction":"asc"}]}""", CanopyRequestError.InvalidSort)]
    [InlineData("""{"sort":[{"column":"name"},{"column":"name"}]}""", CanopyRequestError.InvalidSort)]
    [InlineData("""{"sort":[{"column":"name","direction":"up"}]}""", CanopyRequestError.InvalidSort)]
    [InlineData("""{"sort":[{"column":"Password","direction":"asc"}]}""", CanopyRequestError.UnknownColumn)]
    [InlineData("""{"filters":[{"column":"name); DROP TABLE Hosts;--","operator":"eq","values":["x"]}]}""", CanopyRequestError.UnknownColumn)]
    [InlineData("""{"filters":[{"column":"__proto__","operator":"eq","values":["x"]}]}""", CanopyRequestError.UnknownColumn)]
    [InlineData("""{"filters":[{"column":"name","operator":"like","values":["x"]}]}""", CanopyRequestError.InvalidOperator)]
    [InlineData("""{"filters":[{"column":"cores","operator":"contains","values":["1"]}]}""", CanopyRequestError.InvalidOperator)]
    [InlineData("""{"filters":[{"column":"name","operator":"gt","values":["a"]}]}""", CanopyRequestError.InvalidOperator)]
    [InlineData("""{"filters":[{"column":"name","operator":"contains","values":[true]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filters":[{"column":"name","operator":"eq","values":[]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filters":[{"column":"name","operator":"eq","values":[null]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filters":[{"column":"name","operator":"eq","values":[{"value":"x"}]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filters":[{"column":"name","operator":"isNull","values":["x"]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filters":[{"column":"cores","operator":"eq","values":["4"]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filters":[{"column":"cores","operator":"eq","values":[9007199254740992]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filters":[{"column":"cores","operator":"eq","values":[1e400]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filters":[{"column":"lastSeen","operator":"eq","values":["2026-01-01"]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filters":[{"column":"lastSeen","operator":"eq","values":["2026-01-01T00:00:00"]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filters":[{"column":"lastSeen","operator":"eq","values":["9999-12-31T23:59:59.999Z"]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filters":[{"column":"lastSeen","operator":"eq","values":[1700000000000]}]}""", CanopyRequestError.InvalidOperand)]
    [InlineData("""{"filterGroup":{"operator":"and","filters":[],"groups":[]}}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"filterGroup":{"operator":"xor","filters":[{"column":"name","operator":"isNull","values":[]}],"groups":[]}}""", CanopyRequestError.InvalidOperator)]
    [InlineData("""{"filters":{"column":"name"}}""", CanopyRequestError.InvalidDocument)]
    [InlineData("""{"filters":[{"column":"name","operator":"eq","values":["x"]}],}""", CanopyRequestError.InvalidJson)]
    [InlineData("""{"search":"x" /* comment */}""", CanopyRequestError.InvalidJson)]
    [InlineData("not json", CanopyRequestError.InvalidJson)]
    public void ParseQuery_InvalidRequest_ThrowsTypedError(string json, CanopyRequestError error) {
        var exception = Rejects(json);
        Assert.Equal(error, exception.Error);
        Assert.DoesNotContain("   at ", exception.Message);
        Assert.Equal(error == CanopyRequestError.StaleRevision ? 409 : 400, exception.StatusCode);
    }

    [Fact]
    public void ParseQuery_MembershipOperands_AreBounded() {
        var values = string.Join(",", Enumerable.Range(0, 1001).Select(i => "\"v" + i + "\""));
        Assert.Equal(CanopyRequestError.InvalidOperand, Rejects("{\"filters\":[{\"column\":\"name\",\"operator\":\"in\",\"values\":[" + values + "]}]}").Error);
        var limits = new CanopyRemoteLimits { MaxInValues = 10 };
        var eleven = string.Join(",", Enumerable.Range(0, 11).Select(i => "\"v" + i + "\""));
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"filters\":[{\"column\":\"name\",\"operator\":\"in\",\"values\":[" + eleven + "]}]}", limits).Error);
    }

    [Fact]
    public void ParseQuery_FilterDepthTermsAndGroups_AreBounded() {
        string Nested(int depth) => depth == 0 ? "{\"operator\":\"and\",\"filters\":[{\"column\":\"name\",\"operator\":\"isNull\",\"values\":[]}],\"groups\":[]}"
            : "{\"operator\":\"or\",\"filters\":[],\"groups\":[" + Nested(depth - 1) + "]}";
        CanopyRequestParser.ParseQuery("{\"filterGroup\":" + Nested(7) + "}", Schema);
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"filterGroup\":" + Nested(8) + "}").Error);
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"filterGroup\":" + Nested(2) + "}", new CanopyRemoteLimits { MaxFilterDepth = 2 }).Error);
        var terms = string.Join(",", Enumerable.Range(0, 65).Select(_ => "{\"column\":\"name\",\"operator\":\"isNotNull\",\"values\":[]}"));
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"filters\":[" + terms + "]}").Error);
        var few = string.Join(",", Enumerable.Range(0, 5).Select(_ => "{\"column\":\"name\",\"operator\":\"isNotNull\",\"values\":[]}"));
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"filters\":[" + few + "]}", new CanopyRemoteLimits { MaxFilterTerms = 4 }).Error);
        var groups = string.Join(",", Enumerable.Range(0, 64).Select(_ => "{\"operator\":\"and\",\"filters\":[{\"column\":\"name\",\"operator\":\"isNull\",\"values\":[]}],\"groups\":[]}"));
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"filterGroup\":{\"operator\":\"or\",\"filters\":[],\"groups\":[" + groups + "]}}").Error);
    }

    [Fact]
    public void ParseQuery_SizeLimits_AreEnforced() {
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"limit\":1001}").Error);
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"limit\":101}", new CanopyRemoteLimits { MaxPageSize = 100 }).Error);
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"search\":\"" + new string('a', 1025) + "\"}").Error);
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"filters\":[{\"column\":\"name\",\"operator\":\"eq\",\"values\":[\"" + new string('a', 4097) + "\"]}]}").Error);
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"search\":\"" + new string('a', 2000) + "\"}", new CanopyRemoteLimits { MaxRequestBytes = 1024, MaxSearchLength = 16384 }).Error);
        var deep = new string('[', 200) + new string(']', 200);
        Assert.Equal(CanopyRequestError.InvalidJson, Rejects("{\"x\":" + deep + "}").Error);
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxPageSize = 10001 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxFilterDepth = 9 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxValueListSize = 201 });
    }

    [Fact]
    public void ParseQuery_SearchWords_AreBoundedAndDeduplicated() {
        var words = string.Join(" ", Enumerable.Range(0, 17).Select(i => "w" + i));
        Assert.Equal(CanopyRequestError.LimitExceeded, Rejects("{\"searchMode\":\"words\",\"search\":\"" + words + "\"}").Error);
        var repeated = CanopyRequestParser.ParseQuery("{\"searchMode\":\"words\",\"search\":\"" + string.Join(" ", Enumerable.Repeat("a", 500)) + "\"}", Schema);
        Assert.Equal(new[] { "a" }, repeated.SearchTerms);
        Assert.Single(CanopyRequestParser.ParseQuery("{\"search\":\"" + words + "\"}", Schema).SearchTerms);
    }

    [Fact]
    public void ParseExport_UnknownLocaleAndForeignSelectionRevision_AreRejectedOrIgnored() {
        var export = CanopyRequestParser.ParseExport("{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{},\"locale\":\"qq-x1y2z3\"}", Schema);
        Assert.Null(export.Locale);
        Assert.Equal("de-DE", CanopyRequestParser.ParseExport("{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{},\"locale\":\"de-de\"}", Schema).Locale);
        var error = Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseExport("{\"scope\":\"selected\",\"revision\":\"r1\",\"query\":{}," +
            "\"querySelection\":{\"kind\":\"query\",\"revision\":\"r1\",\"query\":{\"revision\":\"r0\"},\"excludedIds\":[]}}", Schema));
        Assert.Equal(CanopyRequestError.InvalidExport, error.Error);
    }

    [Fact]
    public void ParseQuery_NotFilterableColumn_IsRejected() {
        var view = Fleet.View();
        view.Reporting = null;
        var map = new CanopyColumnMap<Host>(view).Key(x => x.Id).Column("name", x => x.Name).Column("site", x => x.Site, c => c.Filterable(false));
        var error = Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseQuery("{\"filters\":[{\"column\":\"site\",\"operator\":\"eq\",\"values\":[\"Oslo\"]}]}", map.Schema));
        Assert.Equal(CanopyRequestError.ColumnNotFilterable, error.Error);
        var unmapped = Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseQuery("{\"sort\":[{\"column\":\"cores\",\"direction\":\"asc\"}]}", map.Schema));
        Assert.Equal(CanopyRequestError.UnknownColumn, unmapped.Error);
        CanopyRequestParser.ParseQuery("{\"sort\":[{\"column\":\"site\",\"direction\":\"asc\"}]}", map.Schema);
    }

    [Fact]
    public void ParseQuery_QueryString_ReadsFlatAndDocumentForms() {
        var flat = CanopyRequestParser.ParseQuery(new Dictionary<string, string?> {
            ["offset"] = "10", ["limit"] = "5", ["search"] = "oslo", ["sort"] = "-cores,name:asc",
            ["filters"] = "[{\"column\":\"online\",\"operator\":\"eq\",\"values\":[false]}]"
        }, Schema);
        Assert.Equal(10, flat.Offset);
        Assert.Equal(5, flat.Limit);
        Assert.Equal("oslo", flat.Search);
        Assert.Equal(new[] { ("cores", true), ("name", false) }, flat.Sort.Select(key => (key.Column.Id, key.Descending)));
        Assert.IsType<CanopyFilterCondition>(flat.Filter);
        var whole = CanopyRequestParser.ParseQuery(new[] { new KeyValuePair<string, string?>("q", "{\"limit\":7}") }, Schema);
        Assert.Equal(7, whole.Limit);
        Assert.Equal(CanopyRequestError.InvalidDocument, Assert.Throws<CanopyRequestException>(() =>
            CanopyRequestParser.ParseQuery(new Dictionary<string, string?> { ["offset"] = "-3" }, Schema)).Error);
        Assert.Equal(CanopyRequestError.InvalidJson, Assert.Throws<CanopyRequestException>(() =>
            CanopyRequestParser.ParseQuery(new Dictionary<string, string?> { ["filters"] = "[{" }, Schema)).Error);
        Assert.Equal(CanopyRequestError.InvalidDocument, Assert.Throws<CanopyRequestException>(() =>
            CanopyRequestParser.ParseQuery(new[] { new KeyValuePair<string, string?>("limit", "1"), new KeyValuePair<string, string?>("limit", "2") }, Schema)).Error);
    }

    [Fact]
    public void ParseQuery_GroupedView_LeadsWithTheGroupingColumn() {
        var schema = Fleet.Map(Fleet.View(grouped: true)).Schema;
        var request = CanopyRequestParser.ParseQuery("{\"sort\":[{\"column\":\"name\",\"direction\":\"desc\"},{\"column\":\"site\",\"direction\":\"desc\"}]}", schema);
        Assert.Equal(new[] { ("site", false), ("name", true) }, request.Sort.Select(key => (key.Column.Id, key.Descending)));
    }

    [Fact]
    public void ParseFacet_ExcludingCurrentFilter_ReplacesColumnPredicatesByTrue() {
        var facet = CanopyRequestParser.ParseFacet("""
            {"protocol":"canopyx/2","type":"gridFacetQuery","column":"site","search":"o","limit":25,"includeCurrentFilter":false,
             "query":{"view":"fleet","revision":"r1","offset":0,"limit":50,"search":"","sort":[],
               "filters":[{"column":"site","operator":"eq","values":["Oslo"]},{"column":"online","operator":"eq","values":[true]}],
               "filterGroup":{"operator":"or","filters":[{"column":"site","operator":"eq","values":["Austin"]},{"column":"cores","operator":"gt","values":[8]}],"groups":[]}}}
            """, Schema);
        Assert.Equal("site", facet.Column.Id);
        Assert.Equal(25, facet.Limit);
        var remaining = Assert.IsType<CanopyFilterCondition>(facet.Query.Filter);
        Assert.Equal("online", remaining.Column.Id);
    }

    [Fact]
    public void ParseFacet_Bounds_AreChecked() {
        const string query = "\"query\":{\"revision\":\"r1\"}";
        Assert.Equal(CanopyRequestError.NotFacetable, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseFacet("{\"column\":\"name\"," + query + "}", Schema)).Error);
        Assert.Equal(CanopyRequestError.InvalidDocument, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseFacet("{\"column\":\"site\",\"limit\":201," + query + "}", Schema)).Error);
        Assert.Equal(CanopyRequestError.LimitExceeded, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseFacet("{\"column\":\"site\",\"limit\":51," + query + "}", Schema, new CanopyRemoteLimits { MaxValueListSize = 50 })).Error);
        Assert.Equal(CanopyRequestError.InvalidDocument, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseFacet("{\"column\":\"site\",\"query\":{}}", Schema)).Error);
    }

    [Fact]
    public void ParseExport_Scopes_BuildTheirRecordQueries() {
        const string query = "{\"view\":\"fleet\",\"revision\":\"r1\",\"offset\":100,\"limit\":50,\"search\":\"oslo\",\"sort\":[{\"column\":\"cores\",\"direction\":\"desc\"}],\"filters\":[{\"column\":\"online\",\"operator\":\"eq\",\"values\":[true]}]}";
        var filtered = CanopyRequestParser.ParseExport("{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":" + query + ",\"columns\":[{\"id\":\"name\"},\"cores\"],\"values\":\"raw\",\"recordCount\":12,\"fileName\":\"../../etc/passwd\"}", Schema);
        Assert.Equal(0, filtered.Query.Offset);
        Assert.Equal("oslo", filtered.Query.Search);
        Assert.NotNull(filtered.Query.Filter);
        Assert.Equal(new[] { "name", "cores" }, filtered.Columns.Select(column => column.Id));
        Assert.True(filtered.RawValues);
        Assert.Equal(12, filtered.RecordCount);
        Assert.Equal("_.._etc_passwd", filtered.FileName);
        var all = CanopyRequestParser.ParseExport("{\"scope\":\"all\",\"revision\":\"r1\",\"query\":" + query + "}", Schema);
        Assert.Null(all.Query.Filter);
        Assert.Empty(all.Query.SearchTerms);
        Assert.Equal("cores", all.Query.Sort.Single().Column.Id);
        Assert.Equal(8, all.Columns.Count);
        var selected = CanopyRequestParser.ParseExport("{\"scope\":\"selected\",\"revision\":\"r1\",\"query\":" + query + ",\"selection\":[\"3\",\"5\"]}", Schema);
        Assert.Equal(new[] { "3", "5" }, selected.Query.Ids!.OrderBy(id => id));
        Assert.Null(selected.Query.Filter);
        var everyMatch = CanopyRequestParser.ParseExport("{\"scope\":\"selected\",\"revision\":\"r1\",\"query\":" + query +
            ",\"selection\":[],\"querySelection\":{\"kind\":\"query\",\"revision\":\"r1\",\"query\":" + query + ",\"matched\":10,\"excludedIds\":[\"4\"]}}", Schema);
        Assert.Null(everyMatch.Query.Ids);
        Assert.Equal(new[] { "4" }, everyMatch.Query.ExcludedIds);
        Assert.NotNull(everyMatch.Query.Filter);
    }

    [Theory]
    [InlineData("{\"scope\":\"visible\",\"revision\":\"r1\",\"query\":{}}", CanopyRequestError.InvalidExport)]
    [InlineData("{\"scope\":\"filtered\",\"query\":{}}", CanopyRequestError.InvalidExport)]
    [InlineData("{\"scope\":\"filtered\",\"revision\":\"r2\",\"query\":{\"revision\":\"r1\"}}", CanopyRequestError.InvalidExport)]
    [InlineData("{\"scope\":\"selected\",\"revision\":\"r1\",\"query\":{},\"selection\":[]}", CanopyRequestError.InvalidExport)]
    [InlineData("{\"scope\":\"selected\",\"revision\":\"r1\",\"query\":{},\"selection\":[5]}", CanopyRequestError.InvalidExport)]
    [InlineData("{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":{},\"columns\":[\"secret\"]}", CanopyRequestError.UnknownColumn)]
    [InlineData("{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":{},\"columns\":[\"name\",\"name\"]}", CanopyRequestError.InvalidExport)]
    [InlineData("{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":{},\"values\":\"html\"}", CanopyRequestError.InvalidExport)]
    [InlineData("{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":{},\"recordCount\":-1}", CanopyRequestError.InvalidExport)]
    public void ParseExport_InvalidRequest_ThrowsTypedError(string json, CanopyRequestError error) =>
        Assert.Equal(error, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseExport(json, Schema)).Error);

    [Fact]
    public void ParseExport_SelectionSize_IsBounded() {
        var ids = string.Join(",", Enumerable.Range(0, 11).Select(i => "\"" + i + "\""));
        var error = Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseExport("{\"scope\":\"selected\",\"revision\":\"r1\",\"query\":{},\"selection\":[" + ids + "]}",
            Schema, new CanopyRemoteLimits { MaxSelectedIds = 10 }));
        Assert.Equal(CanopyRequestError.LimitExceeded, error.Error);
    }

    [Fact]
    public void FromQuery_TypedCSharpQuery_MatchesWireParsing() {
        var query = new CanopyGridQuery("fleet") { Search = "oslo", Limit = 25 };
        query.Sort.Add(new CanopyGridSort("cores", true));
        query.Filters.Add(new CanopyGridFilter("cores", CanopyGridFilterOperator.GreaterThan, 2));
        var request = CanopyRequestParser.FromQuery(query, Schema);
        Assert.Equal(25, request.Limit);
        Assert.Equal("cores", request.Sort[0].Column.Id);
        Assert.Equal(CanopyGridFilterOperator.GreaterThan, Assert.IsType<CanopyFilterCondition>(request.Filter).Operator);
    }

    [Fact]
    public void ColumnMap_KindMismatchAndUndeclaredColumns_AreRejected() {
        var view = Fleet.View();
        Assert.Throws<ArgumentException>(() => new CanopyColumnMap<Host>(view).Column("cores", x => x.Name));
        Assert.Throws<ArgumentException>(() => new CanopyColumnMap<Host>(view).Column("name", x => x.Cores));
        Assert.Throws<ArgumentException>(() => new CanopyColumnMap<Host>(view).Column("lastSeen", x => x.Memory));
        Assert.Throws<ArgumentException>(() => new CanopyColumnMap<Host>(view).Column("password", x => x.Name));
        Assert.Throws<ArgumentException>(() => new CanopyColumnMap<Host>(view).Column("name", x => x.Name).Column("name", x => x.Name));
        Assert.Throws<ArgumentException>(() => new CanopyColumnMap<Host>(view).Column("name", x => Guid.Empty));
        Assert.Throws<InvalidOperationException>(() => new CanopyColumnMap<Host>(view).Column("name", x => x.Name).Schema);
        var map = Fleet.Map(view);
        _ = map.Schema;
        Assert.Throws<InvalidOperationException>(() => map.Column("x", x => x.Name));
    }

    [Fact]
    public void Schema_CursorViews_AreNotServed() {
        var view = new CanopyDataGridView("cursor", "Cursor") { Source = CanopyGridSource.HostedCursor() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Throws<ArgumentException>(() => new CanopyDataSchema(view));
    }
}
