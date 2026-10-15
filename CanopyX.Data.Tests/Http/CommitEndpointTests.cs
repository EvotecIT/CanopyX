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

/// <summary>The commit route: a write policy of its own on top of the read policy, typed errors and the browser hook.</summary>
public sealed class CommitEndpointTests : IAsyncLifetime {
    private readonly List<Host> _hosts = Fleet.Hosts(30);
    private WebApplication? _app;
    private HttpClient _client = null!;

    public async Task InitializeAsync() {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, HeaderAuthentication>("Test", _ => { });
        builder.Services.AddAuthorization(options => {
            options.AddPolicy("Inventory.Read", policy => policy.RequireAuthenticatedUser());
            options.AddPolicy("Inventory.Write", policy => policy.RequireRole("writer"));
        });
        _app = builder.Build();
        _app.UseAuthentication();
        _app.UseAuthorization();
        var map = Fleet.Map(Fleet.EditableView());
        _app.MapCanopyRemote("/api/hosts", _ => _hosts.AsQueryable(), map, options => {
            options.Query.Revision = _ => new ValueTask<string>("r1");
            options.AuthorizationPolicy = "Inventory.Read";
            options.WriteAuthorizationPolicy = "Inventory.Write";
            options.Limits.MaxCommitRows = 3;
            options.Limits.MaxRequestBytes = 8192;
            options.Writer = _ => new SavingWriter();
        });
        _app.MapCanopyRemote("/api/read-only", _ => _hosts.AsQueryable(), Fleet.Map(Fleet.EditableView()), options => options.AllowAnonymous = true);
        _app.MapCanopyRemote("/api/failing", _ => _hosts.AsQueryable(), Fleet.Map(Fleet.EditableView()), options => {
            options.AllowAnonymous = true;
            options.AllowAnonymousWrites = true;
            options.Writer = _ => new FailingWriter();
        });
        // A host that opens the whole group to anonymous callers must not open its writes by accident.
        _app.MapCanopyRemote("/api/open", _ => _hosts.AsQueryable(), Fleet.Map(Fleet.EditableView()), options => {
            options.Query.Revision = _ => new ValueTask<string>("r1");
            options.WriteAuthorizationPolicy = "Inventory.Write";
            options.Writer = _ => new SavingWriter();
        }).AllowAnonymous();
        await _app.StartAsync();
        _client = _app.GetTestClient();
    }

    public async Task DisposeAsync() {
        _client.Dispose();
        if (_app != null) await _app.DisposeAsync();
    }

    private const string Batch = "{\"protocol\":\"canopyx/2\",\"type\":\"gridCommit\",\"view\":\"fleet\",\"revision\":\"r1\",\"rows\":[{\"id\":\"2\",\"values\":{\"memory\":12},\"original\":{\"memory\":10}}]}";

    private Task<HttpResponseMessage> Post(string path, string body, string? user = null, string? role = null, string type = "application/json") {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = new StringContent(body, Encoding.UTF8, type) };
        if (user != null) request.Headers.Add("X-Test-User", user);
        if (role != null) request.Headers.Add("X-Test-Role", role);
        return _client.SendAsync(request);
    }

    [Fact]
    public async Task Commit_RequiresTheWritePolicy_OnTopOfTheReadPolicy() {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post("/api/hosts/commit", Batch)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Post("/api/hosts/commit", Batch, "reader")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Post("/api/hosts/query", "{}", "reader")).StatusCode);
        var saved = await Post("/api/hosts/commit", Batch, "editor", "writer");
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal("no-store", saved.Headers.CacheControl!.ToString());
        var result = JsonDocument.Parse(await saved.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("gridCommitResult", result.GetProperty("type").GetString());
        Assert.Equal("saved", result.GetProperty("rows")[0].GetProperty("status").GetString());
    }

    [Theory]
    [InlineData("{\"rows\":[{\"id\":\"2\",\"values\":{\"owner\":\"x\"},\"original\":{\"owner\":null}}]}", 400, "columnNotEditable")]
    [InlineData("{\"rows\":[{\"id\":\"2\",\"values\":{\"secret\":\"x\"},\"original\":{\"secret\":null}}]}", 400, "unknownColumn")]
    [InlineData("{\"rows\":[]}", 400, "invalidDocument")]
    [InlineData("{oops", 400, "invalidJson")]
    [InlineData("{\"rows\":[{\"id\":\"1\",\"values\":{\"memory\":1},\"original\":{\"memory\":1}},{\"id\":\"2\",\"values\":{\"memory\":1},\"original\":{\"memory\":1}},{\"id\":\"3\",\"values\":{\"memory\":1},\"original\":{\"memory\":1}},{\"id\":\"4\",\"values\":{\"memory\":1},\"original\":{\"memory\":1}}]}", 400, "limitExceeded")]
    public async Task Commit_ClientErrors_ReturnTypedBodiesWithoutInternals(string body, int status, string code) {
        var response = await Post("/api/hosts/commit", body, "editor", "writer");
        Assert.Equal(status, (int)response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Equal(code, JsonDocument.Parse(text).RootElement.GetProperty("error").GetString());
        Assert.DoesNotContain("   at ", text);
        Assert.DoesNotContain("Exception", text);
    }

    [Fact]
    public async Task Commit_BodiesAreBoundedJson() {
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Post("/api/hosts/commit", Batch, "editor", "writer", "text/plain")).StatusCode);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Post("/api/hosts/commit", "rows=1", "editor", "writer", "application/x-www-form-urlencoded")).StatusCode);
        var large = await Post("/api/hosts/commit", "{\"rows\":[{\"id\":\"2\",\"values\":{\"notes\":\"" + new string('a', 9000) + "\"},\"original\":{\"notes\":null}}]}", "editor", "writer");
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, large.StatusCode);
    }

    [Fact]
    public async Task WriterFailures_ReturnAGenericBody() {
        var response = await Post("/api/failing/commit", Batch);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Equal("serverError", JsonDocument.Parse(text).RootElement.GetProperty("error").GetString());
        Assert.DoesNotContain("hunter2", text);
    }

    [Fact]
    public async Task EndpointsWithoutAWriter_HaveNoCommitRoute() {
        Assert.Contains((int)(await Post("/api/read-only/commit", Batch)).StatusCode, new[] { 404, 405 });
    }

    [Fact]
    public void Writers_NeedANamedWritePolicy() {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        using var app = builder.Build();
        var map = Fleet.Map(Fleet.EditableView());
        var error = Assert.Throws<InvalidOperationException>(() => app.MapCanopyRemote("/api/x", _ => _hosts.AsQueryable(), map, options => {
            options.AllowAnonymous = true;
            options.Writer = _ => new SavingWriter();
        }));
        Assert.Contains("WriteAuthorizationPolicy", error.Message);
    }

    [Fact]
    public async Task AnonymousGroups_DoNotOpenWritesByAccident() {
        Assert.Equal(HttpStatusCode.OK, (await Post("/api/open/query", "{}")).StatusCode);
        var response = await Post("/api/open/commit", Batch);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("writeNotAllowed", JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("error").GetString());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void BlankWritePolicies_CountAsMissing(string policy) {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        using var app = builder.Build();
        Assert.Throws<InvalidOperationException>(() => app.MapCanopyRemote("/api/x", _ => _hosts.AsQueryable(), Fleet.Map(Fleet.EditableView()), options => {
            options.WriteAuthorizationPolicy = policy;
            options.Writer = _ => new SavingWriter();
        }));
    }

    [Fact]
    public void Script_WiresTheCommitHookForEditableViews() {
        var editable = CanopyRemoteScript.Element(Fleet.Map(Fleet.EditableView()).Schema, "/api/hosts");
        Assert.Contains("\"commit\":true", editable);
        Assert.Contains("source.commit", editable);
        Assert.Contains("grid.reload()", editable);
        Assert.Contains("\"commit\":false", CanopyRemoteScript.Element(Fleet.Map(Fleet.View()).Schema, "/api/hosts"));
    }

    private sealed class SavingWriter : ICanopyDataWriter {
        public ValueTask<CanopyCommitResult> CommitAsync(CanopyCommitBatch batch, string revision, CancellationToken cancellationToken) =>
            new ValueTask<CanopyCommitResult>(new CanopyCommitResult(batch.Rows.Select(row => CanopyCommitRowResult.Saved(row.Id)), "r2"));
    }

    private sealed class FailingWriter : ICanopyDataWriter {
        public ValueTask<CanopyCommitResult> CommitAsync(CanopyCommitBatch batch, string revision, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("database password is hunter2");
    }

    /// <summary>Authenticates requests that carry an X-Test-User header, with an optional X-Test-Role.</summary>
    private sealed class HeaderAuthentication : AuthenticationHandler<AuthenticationSchemeOptions> {
        public HeaderAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder) : base(options, logger, encoder) { }
        protected override Task<AuthenticateResult> HandleAuthenticateAsync() {
            if (!Request.Headers.TryGetValue("X-Test-User", out var user)) return Task.FromResult(AuthenticateResult.NoResult());
            var claims = new List<Claim> { new Claim(ClaimTypes.Name, user.ToString()) };
            if (Request.Headers.TryGetValue("X-Test-Role", out var role)) claims.Add(new Claim(ClaimTypes.Role, role.ToString()));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")), "Test")));
        }
    }
}
