using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using CanopyX.AspNetCore;
using CanopyX.Data.Tests.Flows;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>MapCanopyFlow: one route per handler, authorization by default, the server's own reading of every request.</summary>
public sealed class FlowEndpointTests : IAsyncLifetime {
    private readonly Dictionary<string, string> _drafts = new Dictionary<string, string>(StringComparer.Ordinal);
    private readonly List<string> _secretsSeen = new List<string>();
    private WebApplication? _app;
    private HttpClient _client = null!;
    private int _submitted;

    public async Task InitializeAsync() {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, HeaderAuthentication>("Test", _ => { });
        builder.Services.AddAuthorization(options => options.AddPolicy("Mail.Admin", policy => policy.RequireAuthenticatedUser()));
        _app = builder.Build();
        _app.UseAuthentication();
        _app.UseAuthorization();
        var handlers = new CanopyFlowHandlers {
            Check = (context, request) => {
                var secret = request.ReadSecret("password");
                if (secret != null) _secretsSeen.Add(secret);
                return Task.FromResult(Equals(request.Values.TryGetValue("host", out var host) ? host : null, "mail.example.com")
                    ? CanopyFlowCheckResult.Pass("Connected.").Detail("Server", "Postfix")
                    : CanopyFlowCheckResult.Fail("No answer.").FieldError("host", "Nothing listens there."));
            },
            Validate = (context, request) => Task.FromResult(request.Step?.Id == "server" ? new CanopyFlowValidationResult().Warning("Port 25 is often blocked.") : new CanopyFlowValidationResult()),
            Preview = (context, request) => Task.FromResult(new CanopyFlowPreview("What changes").Row("Host", (string?)request.Values["host"] ?? "-", CanopyFlowTone.Warning)),
            Drafts = new MemoryDrafts(_drafts),
            Submit = (context, submission) => {
                _submitted++;
                var secret = submission.ReadSecret("password");
                if (secret != null) _secretsSeen.Add(secret);
                return Task.FromResult(CanopyFlowAnswer.Saved("Saved.").AddResult("Changes", submission.Patch.Count.ToString(System.Globalization.CultureInfo.InvariantCulture)));
            }
        };
        _app.MapCanopyFlow("/api/flows/mail", _ => FlowServerSamples.Mail(), handlers, options => options.AuthorizationPolicy = "Mail.Admin");
        _app.MapCanopyFlow("/api/flows/mail-edit", _ => FlowServerSamples.Mail(edit: true), new CanopyFlowHandlers { Submit = handlers.Submit }, options => options.AllowAnonymous = true);
        _app.MapCanopyFlow("/api/flows/engine", _ => FlowServerSamples.Engine(), new CanopyFlowHandlers {
            Options = (context, request) => Task.FromResult<IEnumerable<CanopyFlowOption>>(new[] { new CanopyFlowOption("eu", "Europe"), new CanopyFlowOption((string)request.Values["engine"]! + "-only") }),
            Fields = (context, request) => Task.FromResult<IEnumerable<CanopyFlowField>>(new[] { new CanopyFlowField("database", CanopyFlowFieldKind.Text, "Database") { IsRequired = Equals(request.Values["engine"], "sql") } }),
            Status = (context, request) => Task.FromResult<IReadOnlyDictionary<string, CanopyFlowStepStatus>>(new Dictionary<string, CanopyFlowStepStatus> { ["pick"] = new CanopyFlowStepStatus(CanopyFlowTaskState.NeedsAction, "Pick an engine.") }),
            Submit = (context, submission) => Task.FromResult(CanopyFlowAnswer.Accepted())
        }, options => {
            options.AllowAnonymous = true;
            options.HostOptions = (context, field, values) => new[] { new CanopyFlowOption("eu") };
        });
        _app.MapCanopyFlow("/api/flows/engine-options", _ => FlowServerSamples.Engine(), new CanopyFlowHandlers {
            Options = (context, request) => Task.FromResult<IEnumerable<CanopyFlowOption>>(new[] { new CanopyFlowOption("eu"), new CanopyFlowOption((string)request.Values["engine"]! + "-only") }),
            Fields = (context, request) => Task.FromResult<IEnumerable<CanopyFlowField>>(new CanopyFlowField[0]),
            Submit = (context, submission) => Task.FromResult(CanopyFlowAnswer.Accepted())
        }, options => options.AllowAnonymous = true);
        _app.MapCanopyFlow("/api/flows/engine-drafts", _ => FlowServerSamples.Engine(), new CanopyFlowHandlers {
            Fields = (context, request) => Task.FromResult<IEnumerable<CanopyFlowField>>(new[] {
                new CanopyFlowField("account", CanopyFlowFieldKind.Text, "Account").Sensitive(),
                new CanopyFlowField("database", CanopyFlowFieldKind.Text, "Database")
            }),
            Drafts = new MemoryDrafts(_drafts)
        });
        await _app.StartAsync();
        _client = _app.GetTestClient();
    }

    public async Task DisposeAsync() {
        _client.Dispose();
        if (_app != null) await _app.DisposeAsync();
    }

    private async Task<(HttpStatusCode Status, string Body)> Send(HttpMethod method, string path, string? body = null, bool user = true, string type = "application/json") {
        var request = new HttpRequestMessage(method, path);
        if (body != null) request.Content = new StringContent(body, Encoding.UTF8, type);
        if (user) request.Headers.Add("X-Test-User", "admin");
        using var response = await _client.SendAsync(request);
        return (response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    private static string Submit(string values, string secrets = "{}", string travel = "{}") =>
        "{\"flow\":\"mail\",\"submission\":" + FlowServerSamples.MailProposal(values, secrets) + ",\"secrets\":" + travel + "}";

    [Fact]
    public async Task Routes_RequireAuthorizationByDefault() {
        var (status, _) = await Send(HttpMethod.Post, "/api/flows/mail/submit", Submit(FlowServerSamples.ValidValues), user: false);
        Assert.Equal(HttpStatusCode.Unauthorized, status);
        Assert.Equal(0, _submitted);
    }

    [Fact]
    public async Task Submit_ValidProposal_ReachesTheHandlerWithTheServersPatch() {
        var (status, body) = await Send(HttpMethod.Post, "/api/flows/mail/submit", Submit(FlowServerSamples.ValidValues));
        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("{\"status\":\"saved\",\"message\":\"Saved.\",\"result\":[{\"label\":\"Changes\",\"value\":\"4\"}]}", body);
        Assert.Equal(1, _submitted);
    }

    [Fact]
    public async Task Submit_FailingAnswers_AnswerFieldErrorsWithoutTheHandler() {
        var (status, body) = await Send(HttpMethod.Post, "/api/flows/mail/submit", Submit(FlowServerSamples.ValidValues.Replace("mail.example.com", "ab")));
        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("{\"status\":\"error\",\"fieldErrors\":{\"host\":\"Host needs at least 3 characters.\"}}", body);
        Assert.Equal(0, _submitted);
    }

    [Fact]
    public async Task Submit_TypedSecret_ReachesTheHandlerOnce() {
        var values = FlowServerSamples.ValidValues.Replace("\"auth\":false", "\"auth\":true,\"user\":\"svc\"");
        var (status, _) = await Send(HttpMethod.Post, "/api/flows/mail/submit", Submit(values, "{\"password\":{\"state\":\"set\"}}", "{\"password\":\"s3cret!\"}"));
        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(new[] { "s3cret!" }, _secretsSeen);
    }

    [Theory]
    [InlineData("{\"flow\":\"mail\",\"submission\":{\"kind\":\"flowSubmission\",\"flow\":\"mail\",\"version\":1,\"mode\":\"create\",\"values\":{\"user\":\"svc\"}}}", "invalidDocument")]
    [InlineData("{\"flow\":\"mail\",\"submission\":", "invalidJson")]
    [InlineData("{\"flow\":\"other\",\"submission\":{}}", "invalidDocument")]
    public async Task Submit_MalformedRequest_IsAClientError(string body, string code) {
        var (status, answer) = await Send(HttpMethod.Post, "/api/flows/mail/submit", body);
        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Contains("\"error\":\"" + code + "\"", answer);
        Assert.Equal(0, _submitted);
    }

    [Fact]
    public async Task Submit_StaleBaseline_AnswersAConflict() {
        const string values = "{\"host\":\"new.example.com\",\"port\":25,\"auth\":true,\"user\":\"svc\",\"to\":[\"ops@example.com\"],\"retry\":null,\"rules\":[]}";
        var proposal = "{\"kind\":\"flowSubmission\",\"flow\":\"mail\",\"version\":1,\"mode\":\"edit\",\"baseline\":\"r0\",\"values\":" + values + ",\"secrets\":{\"password\":{\"state\":\"keep\"}}}";
        var (status, body) = await Send(HttpMethod.Post, "/api/flows/mail-edit/submit", "{\"flow\":\"mail\",\"submission\":" + proposal + "}", user: false);
        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("{\"status\":\"conflict\"}", body);
        var (_, current) = await Send(HttpMethod.Post, "/api/flows/mail-edit/submit", "{\"flow\":\"mail\",\"submission\":" + proposal.Replace("r0", "r1") + "}", user: false);
        Assert.StartsWith("{\"status\":\"saved\"", current);
    }

    [Fact]
    public async Task Check_ReadsTheSecretItTestsAndAnswersTheResult() {
        var (status, body) = await Send(HttpMethod.Post, "/api/flows/mail/check", "{\"flow\":\"mail\",\"check\":\"connection\",\"values\":{\"host\":\"mail.example.com\"},\"secrets\":{\"password\":\"pw-1234\"}}");
        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("{\"status\":\"pass\",\"message\":\"Connected.\",\"details\":[{\"label\":\"Server\",\"value\":\"Postfix\"}]}", body);
        Assert.Equal(new[] { "pw-1234" }, _secretsSeen);
        var (_, failed) = await Send(HttpMethod.Post, "/api/flows/mail/check", "{\"flow\":\"mail\",\"check\":\"connection\",\"values\":{\"host\":\"elsewhere\"}}");
        Assert.Equal("{\"status\":\"fail\",\"message\":\"No answer.\",\"fieldErrors\":{\"host\":\"Nothing listens there.\"}}", failed);
    }

    [Fact]
    public async Task ValidateAndPreview_AnswerTheHandlersResults() {
        Assert.Equal("{\"warnings\":[\"Port 25 is often blocked.\"]}", (await Send(HttpMethod.Post, "/api/flows/mail/validate", "{\"flow\":\"mail\",\"step\":\"server\",\"values\":{}}")).Body);
        Assert.Equal("{}", (await Send(HttpMethod.Post, "/api/flows/mail/validate", "{\"flow\":\"mail\",\"values\":{}}")).Body);
        Assert.Equal("{\"title\":\"What changes\",\"rows\":[{\"label\":\"Host\",\"value\":\"mail.example.com\",\"tone\":\"warning\"}]}",
            (await Send(HttpMethod.Post, "/api/flows/mail/preview", "{\"flow\":\"mail\",\"values\":{\"host\":\"mail.example.com\"}}")).Body);
    }

    [Fact]
    public async Task Drafts_AreKeptPerFlowWithoutSecrets() {
        Assert.Equal("null", (await Send(HttpMethod.Get, "/api/flows/mail/draft")).Body);
        const string draft = "{\"kind\":\"flowDraft\",\"version\":1,\"flow\":\"mail\",\"step\":\"server\",\"values\":{\"host\":\"mail.example.com\"}}";
        Assert.Equal(HttpStatusCode.OK, (await Send(HttpMethod.Put, "/api/flows/mail/draft", "{\"flow\":\"mail\",\"draft\":" + draft + "}")).Status);
        Assert.Equal(draft, (await Send(HttpMethod.Get, "/api/flows/mail/draft")).Body);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(HttpMethod.Put, "/api/flows/mail/draft", "{\"flow\":\"mail\",\"draft\":" + draft.Replace("\"host\"", "\"password\"") + "}")).Status);
        Assert.Equal(HttpStatusCode.OK, (await Send(HttpMethod.Delete, "/api/flows/mail/draft")).Status);
        Assert.Equal("null", (await Send(HttpMethod.Get, "/api/flows/mail/draft")).Body);
    }

    [Fact]
    public async Task Drafts_CheckHostFieldSensitivityBeforeReplacingTheStoredDraft() {
        const string path = "/api/flows/engine-drafts/draft";
        var ordinary = FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"database\":\"Mail\"}");
        Assert.Equal(HttpStatusCode.OK, (await Send(HttpMethod.Put, path, ordinary)).Status);
        var before = (await Send(HttpMethod.Get, path)).Body;
        Assert.Contains("\"database\":\"Mail\"", before);

        var sensitive = FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"account\":\"private-value\"}");
        var refused = await Send(HttpMethod.Put, path, sensitive);

        Assert.Equal(HttpStatusCode.BadRequest, refused.Status);
        Assert.Contains("sensitive field account", refused.Body);
        Assert.Equal(before, (await Send(HttpMethod.Get, path)).Body);
        Assert.DoesNotContain("private-value", _drafts["admin/engine"]);
    }

    [Fact]
    public async Task HostRoutes_AnswerOptionsFieldsAndStatesAndCheckSubmittedAnswersAgainstThem() {
        Assert.Equal("{\"options\":[{\"value\":\"eu\",\"label\":\"Europe\"},{\"value\":\"sql-only\"}]}", (await Send(HttpMethod.Post, "/api/flows/engine/options", "{\"flow\":\"engine\",\"field\":\"region\",\"values\":{\"engine\":\"sql\"}}", user: false)).Body);
        Assert.Equal("{\"fields\":[{\"id\":\"database\",\"type\":\"text\",\"label\":\"Database\",\"required\":true}]}", (await Send(HttpMethod.Post, "/api/flows/engine/fields", "{\"flow\":\"engine\",\"section\":\"engine-options\",\"values\":{\"engine\":\"sql\"}}", user: false)).Body);
        Assert.Equal("{\"pick\":{\"state\":\"needsAction\",\"summary\":\"Pick an engine.\"}}", (await Send(HttpMethod.Post, "/api/flows/engine/status", "{\"flow\":\"engine\",\"values\":{}}", user: false)).Body);

        string Proposal(string values) => "{\"flow\":\"engine\",\"submission\":{\"kind\":\"flowSubmission\",\"flow\":\"engine\",\"version\":1,\"mode\":\"create\",\"values\":" + values + "}}";
        Assert.Equal("{\"status\":\"accepted\"}", (await Send(HttpMethod.Post, "/api/flows/engine/submit", Proposal("{\"engine\":\"sql\",\"region\":\"eu\",\"database\":\"Mail\"}"), user: false)).Body);
        Assert.Equal("{\"status\":\"error\",\"fieldErrors\":{\"database\":\"Database is required.\"}}", (await Send(HttpMethod.Post, "/api/flows/engine/submit", Proposal("{\"engine\":\"sql\",\"region\":\"eu\"}"), user: false)).Body);
        Assert.Equal("{\"status\":\"error\",\"fieldErrors\":{\"region\":\"Choose Region from the list.\"}}", (await Send(HttpMethod.Post, "/api/flows/engine/submit", Proposal("{\"engine\":\"file\",\"region\":\"us\"}"), user: false)).Body);
        // Without a HostOptions callback the submit route asks the Options handler, which offers eu and "<engine>-only".
        Assert.Equal("{\"status\":\"accepted\"}", (await Send(HttpMethod.Post, "/api/flows/engine-options/submit", Proposal("{\"engine\":\"file\",\"region\":\"file-only\"}"), user: false)).Body);
        Assert.Equal("{\"status\":\"error\",\"fieldErrors\":{\"region\":\"Choose Region from the list.\"}}", (await Send(HttpMethod.Post, "/api/flows/engine-options/submit", Proposal("{\"engine\":\"file\",\"region\":\"sql-only\"}"), user: false)).Body);
    }

    [Fact]
    public async Task UnmappedRoutesAndWrongBodies_AreRefused() {
        Assert.Equal(HttpStatusCode.NotFound, (await Send(HttpMethod.Post, "/api/flows/mail/options", "{\"flow\":\"mail\"}")).Status);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Send(HttpMethod.Post, "/api/flows/mail/check", "flow=mail", type: "application/x-www-form-urlencoded")).Status);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await Send(HttpMethod.Post, "/api/flows/mail/check", "{\"flow\":\"mail\",\"pad\":\"" + new string('x', 1024 * 1024) + "\"}")).Status);
    }

    [Fact]
    public void Handlers_NameTheirRoutesForTheFlow() {
        var handlers = new CanopyFlowHandlers { Check = (context, request) => Task.FromResult(CanopyFlowCheckResult.Pass()), Submit = (context, submission) => Task.FromResult(CanopyFlowAnswer.Saved()) };
        Assert.Equal(CanopyFlowRoutes.Check | CanopyFlowRoutes.Submit, handlers.Routes);
        var flow = FlowServerSamples.Mail().UseEndpoint("/api/flows/mail", handlers.Routes);
        Assert.Contains("\"endpoint\":{\"url\":\"/api/flows/mail\",\"routes\":[\"check\",\"submit\"]}", flow.ToContract());
    }

    private sealed class MemoryDrafts : ICanopyFlowDraftStore {
        private readonly Dictionary<string, string> _drafts;

        public MemoryDrafts(Dictionary<string, string> drafts) => _drafts = drafts;

        private static string Key(HttpContext context, string flowId) => (context.User.Identity?.Name ?? "") + "/" + flowId;

        public Task<string?> LoadAsync(HttpContext context, string flowId, CancellationToken cancellationToken) =>
            Task.FromResult(_drafts.TryGetValue(Key(context, flowId), out var draft) ? draft : null);

        public Task SaveAsync(HttpContext context, string flowId, string draftJson, CancellationToken cancellationToken) { _drafts[Key(context, flowId)] = draftJson; return Task.CompletedTask; }

        public Task ClearAsync(HttpContext context, string flowId, CancellationToken cancellationToken) { _drafts.Remove(Key(context, flowId)); return Task.CompletedTask; }
    }

    private sealed class HeaderAuthentication : AuthenticationHandler<AuthenticationSchemeOptions> {
        public HeaderAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder) : base(options, logger, encoder) { }
        protected override Task<AuthenticateResult> HandleAuthenticateAsync() {
            if (!Request.Headers.TryGetValue("X-Test-User", out var user)) return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, user.ToString()) }, "Test");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), "Test")));
        }
    }
}
