using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using CanopyX.AspNetCore;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>The range route shares the reads' authorization, body limits, content-type checks and error mapping.</summary>
public sealed class RangeEndpointTests : IAsyncLifetime {
    private readonly List<Slot> _slots = Schedule.Slots(300);
    private WebApplication? _app;
    private HttpClient _client = null!;

    public async Task InitializeAsync() {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, HeaderAuthentication>("Test", _ => { });
        builder.Services.AddAuthorization(options => options.AddPolicy("planners", policy => policy.RequireClaim(ClaimTypes.Role, "planner")));
        _app = builder.Build();
        _app.UseAuthentication();
        _app.UseAuthorization();
        void Configure(CanopyRemoteEndpointOptions options) {
            options.Limits.MaxRequestBytes = 2048;
            options.Limits.MaxRangeRows = 25;
            options.Query.Revision = _ => new ValueTask<string>("r1");
        }
        _app.MapCanopyRemote("/api/open", _ => _slots.AsQueryable(), Schedule.Map(), options => { Configure(options); options.AllowAnonymous = true; });
        _app.MapCanopyRemote("/api/secured", _ => _slots.AsQueryable(), Schedule.Map(), Configure);
        _app.MapCanopyRemote("/api/planned", _ => _slots.AsQueryable(), Schedule.Map(), options => { Configure(options); options.AuthorizationPolicy = "planners"; });
        var plain = Schedule.Map().Schema;
        _app.MapCanopyRemote("/api/plain", plain, _ => new PlainProvider(), options => options.AllowAnonymous = true);
        await _app.StartAsync();
        _client = _app.GetTestClient();
    }

    public async Task DisposeAsync() {
        _client.Dispose();
        if (_app != null) await _app.DisposeAsync();
    }

    private static string Body(string extra = "", string query = "{}") =>
        Schedule.Range(Schedule.Epoch.AddDays(-20), Schedule.Epoch.AddDays(20), query: query, extra: extra);

    private async Task<HttpResponseMessage> Post(string path, string body, string type = "application/json", string? user = null, string? role = null) {
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = new StringContent(body, Encoding.UTF8, type) };
        if (user != null) request.Headers.Add("X-Test-User", user);
        if (role != null) request.Headers.Add("X-Test-Role", role);
        return await _client.SendAsync(request);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    [Fact]
    public async Task Range_AnswersTheRangePage_ClampedToTheEndpointLimit() {
        var response = await Post("/api/open/range", Body(",\"limit\":10000"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        var page = await Json(response);
        Assert.Equal("gridRangePage", page.GetProperty("type").GetString());
        Assert.Equal("schedule", page.GetProperty("view").GetString());
        Assert.Equal("r1", page.GetProperty("revision").GetString());
        Assert.Equal(25, page.GetProperty("items").GetArrayLength());
        Assert.True(page.GetProperty("matched").GetInt32() > 25);
        Assert.True(page.GetProperty("truncated").GetBoolean());
        var expected = await Schedule.Reference(Schedule.Map().Schema, _slots, Clamped()).RangeAsync(Body(",\"limit\":10000"));
        Assert.Equal(expected, await response.Content.ReadAsStringAsync());
    }

    private static CanopyRemoteOptions Clamped() {
        var options = new CanopyRemoteOptions();
        options.Limits.MaxRangeRows = 25;
        return options;
    }

    [Fact]
    public async Task Range_RequiresAuthorizationByDefault_AndHonorsThePolicy() {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post("/api/secured/range", Body())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Post("/api/secured/range", Body(), user: "reader")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Post("/api/planned/range", Body(), user: "reader")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Post("/api/planned/range", Body(), user: "reader", role: "planner")).StatusCode);
        Assert.Contains((int)(await _client.GetAsync("/api/open/range")).StatusCode, new[] { 404, 405 });
    }

    [Theory]
    [InlineData("{\"query\":{},\"from\":\"2026-10-01T00:00:00Z\",\"to\":\"2026-11-01T00:00:00Z\",\"start\":\"secret\"}", 400, "unknownColumn")]
    [InlineData("{\"query\":{},\"from\":\"2026-11-01T00:00:00Z\",\"to\":\"2026-10-01T00:00:00Z\",\"start\":\"starts\"}", 400, "invalidDocument")]
    [InlineData("{\"query\":{\"revision\":\"r0\"},\"from\":\"2026-10-01T00:00:00Z\",\"to\":\"2026-11-01T00:00:00Z\",\"start\":\"starts\"}", 409, "staleRevision")]
    [InlineData("{oops", 400, "invalidJson")]
    public async Task Range_ClientErrors_ReturnTypedBodiesWithoutInternals(string body, int status, string code) {
        var response = await Post("/api/open/range", body);
        Assert.Equal(status, (int)response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Equal(code, JsonDocument.Parse(text).RootElement.GetProperty("error").GetString());
        Assert.DoesNotContain("   at ", text);
        Assert.DoesNotContain("Exception", text);
    }

    [Fact]
    public async Task Range_BodiesAreBoundedAndMustBeJson() {
        var large = await Post("/api/open/range", Body(query: "{\"search\":\"" + new string('a', 3000) + "\"}"));
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, large.StatusCode);
        Assert.Equal("limitExceeded", (await Json(large)).GetProperty("error").GetString());
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Post("/api/open/range", Body(), "text/plain")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Post("/api/open/range", Body(), "application/vnd.canopyx+json")).StatusCode);
    }

    [Fact]
    public async Task Range_ProviderWithoutTheCapability_AnswersUnsupported() {
        var response = await Post("/api/plain/range", Body());
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("unsupported", (await Json(response)).GetProperty("error").GetString());
    }

    [Fact]
    public void Script_WiresTheRangeHookForViewsWithAFilterableDateColumn() {
        var script = CanopyRemoteScript.Script(Schedule.Map().Schema, "/api/open/");
        Assert.Contains("\"range\":true", script);
        Assert.Contains("if (settings.range) source.range = (request, options) => post(\"/range\", request, options.signal).then(response => response.json());", script);
        var view = new CanopyDataGridView("names", "Names");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Contains("\"range\":false", CanopyRemoteScript.Script(new CanopyDataSchema(view), "/api/names"));
        var locked = new CanopyDataGridView("locked", "Locked");
        locked.Columns.Add(new CanopyColumn("seen", "Seen") { Kind = CanopyColumnKind.DateTime });
        Assert.Contains("\"range\":false", CanopyRemoteScript.Script(new CanopyDataSchema(locked, notFilterable: new[] { "seen" }), "/api/locked"));
    }

    /// <summary>Authenticates requests that carry an X-Test-User header, with an optional X-Test-Role.</summary>
    private sealed class HeaderAuthentication : AuthenticationHandler<AuthenticationSchemeOptions> {
        public HeaderAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder) : base(options, logger, encoder) { }
        protected override Task<AuthenticateResult> HandleAuthenticateAsync() {
            if (!Request.Headers.TryGetValue("X-Test-User", out var user)) return Task.FromResult(AuthenticateResult.NoResult());
            var claims = new List<Claim> { new Claim(ClaimTypes.Name, user.ToString()) };
            if (Request.Headers.TryGetValue("X-Test-Role", out var role)) claims.Add(new Claim(ClaimTypes.Role, role.ToString()));
            var identity = new ClaimsIdentity(claims, "Test");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), "Test")));
        }
    }

    private sealed class PlainProvider : ICanopyDataProvider {
        public ValueTask<string> GetRevisionAsync(CancellationToken cancellationToken) => new ValueTask<string>("r1");
        public ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
