using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using CanopyX.AspNetCore;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class RecordEndpointTests : IAsyncLifetime {
    private readonly List<Asset> _assets = Assets.Create(120, seed: 3);
    private WebApplication? _app;
    private HttpClient _client = null!;
    private string _customRevision = "r1";

    public async Task InitializeAsync() {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, HeaderAuthentication>("Test", _ => { });
        builder.Services.AddAuthorization();
        _app = builder.Build();
        _app.UseAuthentication();
        _app.UseAuthorization();
        var columns = Assets.Columns(Assets.View());
        _app.MapCanopyRemote("/api/assets", _ => Assets.Scoped(_assets).AsQueryable(), Assets.Records(columns), options => {
            options.Limits.MaxRequestBytes = 4096;
            options.Query.Revision = _ => new ValueTask<string>("r1");
            options.AllowAnonymous = true;
            options.CanReadRecordField = (http, field) => field != "secret" || http.Request.Headers["X-Test-Role"] == "admin";
            options.RecordEndpoint = route => route.Add(endpoint => endpoint.Metadata.Add(new RecordMarker()));
        });
        var secured = Assets.Columns(Assets.View());
        _app.MapCanopyRemote("/api/secured", _ => Assets.Scoped(_assets).AsQueryable(), Assets.Records(secured));
        var decorated = Assets.Columns(Assets.View()).DecorateRows(row => row.Fields["secret"] = "sensitive");
        _app.MapCanopyRemote("/api/decorated", _ => Assets.Scoped(_assets).AsQueryable(), Assets.Records(decorated), options => {
            options.AllowAnonymous = true;
            options.CanReadRecordField = (http, field) => field != "secret" || http.Request.Headers["X-Test-Role"] == "admin";
        });
        var plain = Assets.Columns(Assets.View());
        _app.MapCanopyRemote("/api/plain", _ => _assets.AsQueryable(), plain, options => options.AllowAnonymous = true);
        var customColumns = Assets.Columns(Assets.View());
        var customRecords = Assets.Records(customColumns);
        _app.MapCanopyRemote("/api/custom", _ => _assets.AsQueryable(), customColumns, options => {
            options.AllowAnonymous = true;
            options.Query.Revision = _ => new ValueTask<string>(_customRevision);
            options.Records = http => new Custom(customRecords.Schema, request => {
                var kind = http.Request.Headers["X-Test-Failure"].ToString();
                if (kind == "provider") throw new InvalidOperationException("private provider error");
                var record = new CanopyGridRecord(request.Id);
                if (kind == "revision") _customRevision = "r2";
                else if (kind == "other-row") record.Row = new CanopyGridRow("2") { Cells = { ["name"] = "another-row-value" } };
                else if (kind == "collection-scalar") record.Fields["parts"] = "not a collection";
                else if (kind == "collection-total") record.Fields["parts"] = CanopyCell.Collection(new CanopyRecordList {
                    Columns = { new CanopyColumn("name", "Name") },
                    Rows = { new CanopyGridRow("part-1") { Cells = { ["name"] = "part" } } }
                });
                else {
                    var cell = new CanopyCell();
                    cell.Fields.Add(new CanopyCellField("self", cell));
                    record.Fields["notes"] = cell;
                }
                return record;
            });
        });
        await _app.StartAsync();
        _client = _app.GetTestClient();
    }

    public async Task DisposeAsync() {
        _client.Dispose();
        if (_app != null) await _app.DisposeAsync();
    }

    private Task<HttpResponseMessage> Post(string path, string body, string type = "application/json", string? role = null, string? user = null) {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = new StringContent(body, Encoding.UTF8, type) };
        if (role != null) request.Headers.Add("X-Test-Role", role);
        if (user != null) request.Headers.Add("X-Test-User", user);
        return _client.SendAsync(request);
    }

    private string VisibleId(Func<Asset, bool>? test = null) =>
        Assets.Scoped(_assets).First(test ?? (_ => true)).Id.ToString(System.Globalization.CultureInfo.InvariantCulture);

    [Fact]
    public async Task Record_AnswersTheRecordDocument() {
        var id = VisibleId(asset => asset.Parts.Count > 3);
        var response = await Post("/api/assets/record", Assets.Query(id, ",\"row\":true"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        var root = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("gridRecord", root.GetProperty("type").GetString());
        Assert.Equal(id, root.GetProperty("row").GetProperty("id").GetString());
        Assert.True(root.GetProperty("fields").TryGetProperty("parts", out _));
        var page = JsonDocument.Parse(await (await Post("/api/assets/record", Assets.Query(id, ",\"field\":\"parts\",\"offset\":1,\"limit\":2"))).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(2, page.GetProperty("fields").GetProperty("parts").GetProperty("records").GetProperty("rows").GetArrayLength());
    }

    [Fact]
    public async Task Record_ReadCheckSeesTheRequest() {
        var id = VisibleId();
        var reader = await (await Post("/api/assets/record", Assets.Query(id))).Content.ReadAsStringAsync();
        var admin = await (await Post("/api/assets/record", Assets.Query(id), role: "admin")).Content.ReadAsStringAsync();
        Assert.DoesNotContain("secret-", reader);
        Assert.Contains("secret-" + id, admin);
    }

    [Fact]
    public async Task Record_RowFieldReadPolicyFailsClosedThroughHttp() {
        using var reader = await Post("/api/decorated/record", Assets.Query(VisibleId(), ",\"row\":true"));
        var text = await reader.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.InternalServerError, reader.StatusCode);
        Assert.DoesNotContain("sensitive", text);
        using var error = JsonDocument.Parse(text);
        Assert.Equal("serverError", error.RootElement.GetProperty("error").GetString());
        using var admin = await Post("/api/decorated/record", Assets.Query(VisibleId(), ",\"row\":true"), role: "admin");
        Assert.Equal(HttpStatusCode.OK, admin.StatusCode);
        using var answer = JsonDocument.Parse(await admin.Content.ReadAsStringAsync());
        Assert.Equal("sensitive", answer.RootElement.GetProperty("row").GetProperty("fields").GetProperty("secret").GetString());
    }

    [Theory]
    [InlineData("hidden", 404, "recordNotFound")]
    [InlineData("99999", 404, "recordNotFound")]
    [InlineData("1' OR '1'='1", 404, "recordNotFound")]
    [InlineData("stale", 409, "staleRevision")]
    [InlineData("field", 400, "unknownField")]
    [InlineData("collection", 400, "notCollection")]
    [InlineData("limit", 400, "limitExceeded")]
    [InlineData("json", 400, "invalidJson")]
    public async Task Record_ClientErrors_ReturnTypedBodiesWithoutEchoes(string kind, int status, string code) {
        var hidden = _assets.First(asset => asset.Site == "Hidden").Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var body = kind switch {
            "hidden" => Assets.Query(hidden),
            "stale" => Assets.Query(VisibleId(), ",\"revision\":\"r0\""),
            "field" => Assets.Query("1", ",\"field\":\"secretField\""),
            "collection" => Assets.Query("1", ",\"field\":\"serial\""),
            "limit" => Assets.Query("1", ",\"field\":\"parts\",\"limit\":500"),
            "json" => "{oops",
            _ => Assets.Query(kind)
        };
        var response = await Post("/api/assets/record", body);
        Assert.Equal(status, (int)response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        var error = JsonDocument.Parse(text).RootElement;
        Assert.Equal(code, error.GetProperty("error").GetString());
        Assert.DoesNotContain("OR '1'", text);
        Assert.DoesNotContain("secretField", text);
        Assert.DoesNotContain("Exception", text);
        Assert.DoesNotContain("   at ", text);
    }

    [Fact]
    public async Task Record_BodiesAreBoundedAndMustBeJson() {
        var large = await Post("/api/assets/record", Assets.Query(new string('1', 5000)));
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, large.StatusCode);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Post("/api/assets/record", Assets.Query("1"), "text/plain")).StatusCode);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Post("/api/assets/record", "view=assets&id=1", "application/x-www-form-urlencoded")).StatusCode);
    }

    [Fact]
    public async Task Record_RequiresTheReadAuthorizationAndIsMappedOnlyWithRecords() {
        var id = VisibleId();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post("/api/secured/record", Assets.Query(id))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Post("/api/secured/record", Assets.Query(id), user: "reader")).StatusCode);
        Assert.Contains((int)(await Post("/api/plain/record", Assets.Query(id))).StatusCode, new[] { 404, 405 });
        var endpoints = _app!.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>().ToList();
        Assert.Single(endpoints, endpoint => endpoint.Metadata.GetMetadata<RecordMarker>() != null);
        Assert.Equal("/api/assets/record", endpoints.Single(endpoint => endpoint.Metadata.GetMetadata<RecordMarker>() != null).RoutePattern.RawText);
    }

    [Fact]
    public async Task Record_BodiesHaveTheirOwnSmallerBound() {
        var id = VisibleId();
        // Within the record bound (16 KiB) but carrying padding, then beyond it while the query route still accepts the size.
        var padded = Assets.Query(id, ",\"padding\":\"" + new string('x', 8000) + "\"");
        Assert.Equal(HttpStatusCode.OK, (await Post("/api/secured/record", padded, user: "reader")).StatusCode);
        var large = Assets.Query(id, ",\"padding\":\"" + new string('x', 20000) + "\"");
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await Post("/api/secured/record", large, user: "reader")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Post("/api/secured/query", "{\"padding\":\"" + new string('x', 20000) + "\"}", user: "reader")).StatusCode);
    }

    [Theory]
    [InlineData("revision", 409, "staleRevision")]
    [InlineData("provider", 500, "serverError")]
    [InlineData("cycle", 500, "serverError")]
    [InlineData("other-row", 500, "serverError")]
    [InlineData("collection-scalar", 500, "serverError")]
    [InlineData("collection-total", 500, "serverError")]
    public async Task CustomRecordFailures_ReturnTypedHttpErrorsWithoutProviderDetails(string kind, int status, string code) {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/custom/record") {
            Content = new StringContent(Assets.Query("1", ",\"revision\":\"r1\"" + (kind == "other-row" ? ",\"row\":true" : "")), Encoding.UTF8, "application/json")
        };
        request.Headers.Add("X-Test-Failure", kind);
        using var response = await _client.SendAsync(request);
        Assert.Equal(status, (int)response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        using var error = JsonDocument.Parse(text);
        Assert.Equal(code, error.RootElement.GetProperty("error").GetString());
        Assert.DoesNotContain("private provider error", text);
        Assert.DoesNotContain("another-row-value", text);
        Assert.DoesNotContain("Structured values", text);
        Assert.DoesNotContain("Exception", text);
        Assert.DoesNotContain("   at ", text);
    }

    [Fact]
    public void Mapping_RefusesTwoRecordProviders_AndKeepsEarlierCallsUnambiguous() {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        using var app = builder.Build();
        var columns = Assets.Columns(Assets.View());
        var records = Assets.Records(columns);
        Assert.Throws<InvalidOperationException>(() => app.MapCanopyRemote("/b", _ => _assets.AsQueryable(), records,
            options => options.Records = _ => new CanopyInMemoryRecordProvider<Asset>(records, () => _assets)));
        // Calls written before records existed still compile and bind to the overloads they meant.
        app.MapCanopyRemote("/c", _ => _assets.AsQueryable(), Assets.Columns(Assets.View()), null);
        Assert.Contains("\"records\":false", CanopyRemoteScript.Element(columns.Schema, "/c", null));
        Assert.Contains("\"records\":false", CanopyRemoteScript.Script(columns.Schema, "/c", null));
        _ = new CanopyRemoteHandler(columns.Schema, new CanopyQueryableProvider<Asset>(_assets.AsQueryable(), columns), null);
        _ = new CanopyRemoteHandler(columns.Schema, new CanopyQueryableProvider<Asset>(_assets.AsQueryable(), columns), null, null);
    }

    [Fact]
    public void Script_WiresRecordsForARecordSchemaOnly() {
        var columns = Assets.Columns(Assets.View());
        var records = Assets.Records(columns);
        var element = CanopyRemoteScript.Element(records.Schema, "/api/assets", ("csv", "CSV </script>"));
        Assert.Contains("\"records\":true", element);
        Assert.Contains("source.record", element);
        Assert.Contains("staleRevision", element);
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(element, "</script>").Cast<System.Text.RegularExpressions.Match>());
        Assert.Contains("\"records\":false", CanopyRemoteScript.Element(columns.Schema, "/api/assets"));
    }

    private sealed class RecordMarker { }

    private sealed class Custom : ICanopyRecordProvider {
        private readonly Func<CanopyRecordRequest, CanopyGridRecord> _answer;
        internal Custom(CanopyRecordSchema schema, Func<CanopyRecordRequest, CanopyGridRecord> answer) { Schema = schema; _answer = answer; }
        public CanopyRecordSchema Schema { get; }
        public ValueTask<CanopyGridRecord?> GetRecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken) => new(_answer(request));
    }

    /// <summary>Authenticates requests that carry an X-Test-User header.</summary>
    private sealed class HeaderAuthentication : AuthenticationHandler<AuthenticationSchemeOptions> {
        public HeaderAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder) : base(options, logger, encoder) { }
        protected override Task<AuthenticateResult> HandleAuthenticateAsync() {
            if (!Request.Headers.TryGetValue("X-Test-User", out var user)) return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, user.ToString()) }, "Test");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), "Test")));
        }
    }
}
