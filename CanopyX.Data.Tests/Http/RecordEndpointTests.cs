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
        _app.MapCanopyRemote("/api/assets", _ => Assets.Scoped(_assets).AsQueryable(), columns, Assets.Records(columns), options => {
            options.Limits.MaxRequestBytes = 4096;
            options.Query.Revision = _ => new ValueTask<string>("r1");
            options.AllowAnonymous = true;
            options.CanReadRecordField = (http, field) => field != "secret" || http.Request.Headers["X-Test-Role"] == "admin";
            options.RecordEndpoint = route => route.Add(endpoint => endpoint.Metadata.Add(new RecordMarker()));
        });
        var secured = Assets.Columns(Assets.View());
        _app.MapCanopyRemote("/api/secured", _ => Assets.Scoped(_assets).AsQueryable(), secured, Assets.Records(secured));
        var plain = Assets.Columns(Assets.View());
        _app.MapCanopyRemote("/api/plain", _ => _assets.AsQueryable(), plain, options => options.AllowAnonymous = true);
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
    public void Mapping_RefusesAnotherColumnMapOrTwoRecordProviders() {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        using var app = builder.Build();
        var columns = Assets.Columns(Assets.View());
        var other = Assets.Records(Assets.Columns(Assets.View()));
        Assert.Throws<ArgumentException>(() => app.MapCanopyRemote("/a", _ => _assets.AsQueryable(), columns, other));
        var records = Assets.Records(columns);
        Assert.Throws<InvalidOperationException>(() => app.MapCanopyRemote("/b", _ => _assets.AsQueryable(), columns, records,
            options => options.Records = _ => new CanopyInMemoryRecordProvider<Asset>(records, () => _assets)));
    }

    [Fact]
    public void Script_WiresRecordsOnlyWhenAsked() {
        var schema = Assets.Columns(Assets.View()).Schema;
        var options = new CanopyRemoteScriptOptions { Records = true };
        options.ExportFormats.Add(("csv", "CSV </script>"));
        var element = CanopyRemoteScript.Element(schema, "/api/assets", options);
        Assert.Contains("\"records\":true", element);
        Assert.Contains("source.record", element);
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(element, "</script>").Cast<System.Text.RegularExpressions.Match>());
        Assert.Contains("\"records\":false", CanopyRemoteScript.Element(schema, "/api/assets"));
        Assert.Throws<ArgumentException>(() => CanopyRemoteScript.Script(Fleet.Map(Fleet.View()).Schema, "/api/hosts", new CanopyRemoteScriptOptions { Records = true }));
    }

    private sealed class RecordMarker { }

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
