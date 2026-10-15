using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using CanopyX.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class EndpointTests : IAsyncLifetime {
    private readonly List<Host> _hosts = Fleet.Hosts(250);
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
        var map = Fleet.Map(Fleet.View(grouped: true));
        _app.MapCanopyRemote("/api/hosts", _ => _hosts.AsQueryable(), map, options => {
            options.Limits.MaxPageSize = 100;
            options.Limits.MaxRequestBytes = 4096;
            options.Query.Revision = _ => new ValueTask<string>("r1");
            options.AllowAnonymous = true;
            options.AllowGetQueries = true;
        });
        var broken = Fleet.Map(Fleet.View());
        _app.MapCanopyRemote("/api/broken", broken.Schema, _ => new BrokenProvider(), options => options.AllowAnonymous = true);
        _app.MapCanopyRemote("/api/secured", Fleet.Map(Fleet.View()).Schema, _ => new BrokenProvider());
        await _app.StartAsync();
        _client = _app.GetTestClient();
    }

    public async Task DisposeAsync() {
        _client.Dispose();
        if (_app != null) await _app.DisposeAsync();
    }

    private Task<HttpResponseMessage> Post(string path, string body, string type = "application/json") =>
        _client.PostAsync(path, new StringContent(body, Encoding.UTF8, type));

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    [Fact]
    public async Task Query_PostAndGet_ReturnPages() {
        var post = await Post("/api/hosts/query", "{\"offset\":10,\"limit\":20,\"sort\":[{\"column\":\"memory\",\"direction\":\"desc\"}]}");
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);
        Assert.Equal("application/json", post.Content.Headers.ContentType!.MediaType);
        Assert.Equal("no-store", post.Headers.CacheControl!.ToString());
        var page = await Json(post);
        Assert.Equal("gridPage", page.GetProperty("type").GetString());
        Assert.Equal(20, page.GetProperty("items").GetArrayLength());
        var get = await _client.GetAsync("/api/hosts/query?limit=5&sort=-cores&search=oslo");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        Assert.Equal(5, (await Json(get)).GetProperty("items").GetArrayLength());
        var view = await Json(await _client.GetAsync("/api/hosts/view"));
        Assert.Equal("grid", view.GetProperty("type").GetString());
    }

    [Fact]
    public async Task FacetAndSummary_ReturnTheirDocuments() {
        var facet = await Json(await Post("/api/hosts/facet", "{\"column\":\"os\",\"query\":{\"revision\":\"r1\"}}"));
        Assert.Equal("gridFacetPage", facet.GetProperty("type").GetString());
        Assert.Equal(250, facet.GetProperty("matched").GetInt32());
        var summary = await Json(await Post("/api/hosts/summary", "{\"revision\":\"r1\",\"sort\":[{\"column\":\"site\",\"direction\":\"asc\"}]}"));
        Assert.Equal("gridSummary", summary.GetProperty("type").GetString());
        Assert.Equal(250, summary.GetProperty("groups").EnumerateArray().Sum(group => group.GetProperty("count").GetInt32()));
    }

    [Theory]
    [InlineData("{\"limit\":101}", 400, "limitExceeded")]
    [InlineData("{\"sort\":[{\"column\":\"secret\",\"direction\":\"asc\"}]}", 400, "unknownColumn")]
    [InlineData("{\"revision\":\"r0\"}", 409, "staleRevision")]
    [InlineData("{\"offset\":5000}", 400, "offsetOutOfRange")]
    [InlineData("{oops", 400, "invalidJson")]
    public async Task Query_ClientErrors_ReturnTypedBodiesWithoutInternals(string body, int status, string code) {
        var response = await Post("/api/hosts/query", body);
        Assert.Equal(status, (int)response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        var error = JsonDocument.Parse(text).RootElement;
        Assert.Equal(code, error.GetProperty("error").GetString());
        Assert.False(string.IsNullOrWhiteSpace(error.GetProperty("message").GetString()));
        Assert.DoesNotContain("   at ", text);
        Assert.DoesNotContain("Exception", text);
    }

    [Fact]
    public async Task Bodies_AreBoundedAndMustBeJson() {
        var large = await Post("/api/hosts/query", "{\"search\":\"" + new string('a', 5000) + "\"}");
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, large.StatusCode);
        Assert.Equal("limitExceeded", (await Json(large)).GetProperty("error").GetString());
        var form = await Post("/api/hosts/query", "{}", "text/plain");
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, form.StatusCode);
        var vendor = await Post("/api/hosts/query", "{}", "application/vnd.canopyx+json");
        Assert.Equal(HttpStatusCode.OK, vendor.StatusCode);
    }

    [Fact]
    public async Task Endpoints_RequireAuthorizationByDefault() {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post("/api/secured/query", "{}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.GetAsync("/api/secured/view")).StatusCode);
        Assert.Contains((int)(await _client.GetAsync("/api/broken/query?limit=1")).StatusCode, new[] { 404, 405 });
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/secured/view");
        request.Headers.Add("X-Test-User", "reader");
        Assert.Equal(HttpStatusCode.OK, (await _client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task ServerFailures_ReturnAGenericBody() {
        var response = await Post("/api/broken/query", "{}");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Equal("serverError", JsonDocument.Parse(text).RootElement.GetProperty("error").GetString());
        Assert.DoesNotContain("database password", text);
        Assert.DoesNotContain("BrokenProvider", text);
    }

    [Fact]
    public async Task Export_StreamsAnAttachment() {
        var response = await Post("/api/hosts/export/csv", "{\"scope\":\"filtered\",\"revision\":\"r1\",\"query\":{\"revision\":\"r1\",\"search\":\"oslo\"},\"columns\":[\"name\",\"site\"],\"fileName\":\"Fleet export\"}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/csv", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition!.DispositionType);
        Assert.Equal("Fleet export.csv", response.Content.Headers.ContentDisposition.FileNameStar ?? response.Content.Headers.ContentDisposition.FileName?.Trim('"'));
        var text = await response.Content.ReadAsStringAsync();
        var lines = text.TrimStart('﻿').Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal("Name,Site", lines[0]);
        var count = int.Parse(response.Headers.GetValues("X-CanopyX-Record-Count").Single(), System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal(count + 1, lines.Length);
        Assert.True(count > 0);
        var unknown = await Post("/api/hosts/export/pdf", "{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{}}");
        Assert.Equal("unknownFormat", (await Json(unknown)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Script_ConfiguresTheGridSource() {
        var schema = Fleet.Map(Fleet.View(grouped: true)).Schema;
        var element = CanopyRemoteScript.Element(schema, "/api/hosts/", ("csv", "CSV </script><b>"));
        Assert.StartsWith("<script>", element);
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(element, "</script>").Cast<System.Text.RegularExpressions.Match>());
        Assert.Contains("\"endpoint\":\"/api/hosts\"", element);
        Assert.Contains("\"facets\":true", element);
        Assert.Contains("\"summary\":true", element);
        Assert.Contains("CanopyX.configure(settings.view", element);
        await Task.CompletedTask;
    }

    [Fact]
    public void RemoteExportIdentifiers_StayDistinctForLongAndCaseSensitiveViews() {
        var ids = new List<string>();
        foreach (var name in new[] { "abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ" }) {
            var view = new CanopyDataGridView(name, "Grid");
            view.Columns.Add(new CanopyColumn("name", "Name"));
            var schema = new CanopyDataSchema(view);
            var script = CanopyRemoteScript.Script(schema, "/api/hosts", ("csv", "CSV"), ("xlsx", "Excel"));
            ids.AddRange(System.Text.RegularExpressions.Regex.Matches(script, "\"exportId\":\"([^\"]+)\"")
                .Cast<System.Text.RegularExpressions.Match>().Select(match => match.Groups[1].Value));
        }
        Assert.Equal(4, ids.Distinct(StringComparer.Ordinal).Count());
        Assert.All(ids, id => Assert.Matches("^[a-z][a-z0-9-]{0,31}$", id));
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

    private sealed class BrokenProvider : ICanopyDataProvider {
        public ValueTask<string> GetRevisionAsync(CancellationToken cancellationToken) => new ValueTask<string>("r1");
        public ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken) => throw new InvalidOperationException("database password is hunter2");
        public ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
