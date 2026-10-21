using Xunit;

namespace CanopyX.Data.Tests.Flows;

/// <summary>CanopyFlowRequest, CanopyFlowResponses and the answer types: the hooks' requests and answers as the browser sends and reads them.</summary>
public sealed class FlowRequestTests {
    [Fact]
    public void Parse_CheckRequest_NamesTheCheckAndReadsItsSecretsOnce() {
        var request = CanopyFlowRequest.Parse(FlowServerSamples.Mail(), CanopyFlowRoutes.Check,
            "{\"flow\":\"mail\",\"check\":\"connection\",\"values\":{\"host\":\"mail.example.com\",\"port\":25},\"secrets\":{\"password\":\"s3cret!\"}}");
        Assert.Equal("connection", request.Check!.Id);
        Assert.Equal(25d, request.Values["port"]);
        Assert.Equal("s3cret!", request.ReadSecret("password"));
        Assert.Null(request.ReadSecret("password"));
    }

    [Theory]
    [InlineData("{\"flow\":\"mail\",\"check\":\"nope\",\"values\":{}}", "no check")]
    [InlineData("{\"flow\":\"mail\",\"check\":\"connection\",\"values\":{\"password\":\"x\"}}", "secret field")]
    [InlineData("{\"flow\":\"other\",\"check\":\"connection\",\"values\":{}}", "another flow")]
    [InlineData("{\"flow\":\"mail\",\"check\":\"connection\",\"values\":{\"nope\":1}}", "no field")]
    [InlineData("{\"flow\":\"mail\",\"check\":\"connection\",\"values\":{},\"secrets\":{\"host\":\"x\"}}", "does not test")]
    [InlineData("{\"flow\":\"mail\",\"check\":\"connection\",\"values\":{},\"extra\":true}", "unknown property")]
    public void Parse_MalformedCheckRequest_IsRefused(string body, string expected) {
        var error = Assert.Throws<CanopyRequestException>(() => CanopyFlowRequest.Parse(FlowServerSamples.Mail(), CanopyFlowRoutes.Check, body));
        Assert.Contains(expected, error.Message);
    }

    [Fact]
    public void Parse_Answers_LeaveHiddenFieldsOutAndReadHostSectionAnswersAsValues() {
        var request = CanopyFlowRequest.Parse(FlowServerSamples.Mail(), CanopyFlowRoutes.Preview, "{\"flow\":\"mail\",\"values\":{\"host\":\"mail.example.com\",\"auth\":false,\"user\":\"svc\"}}");
        Assert.False(request.Values.ContainsKey("user"));
        Assert.Equal("mail.example.com", request.Values["host"]);

        var engine = FlowServerSamples.Engine();
        var lists = CanopyFlowRequest.Parse(engine, CanopyFlowRoutes.Preview, "{\"flow\":\"engine\",\"values\":{\"engine\":\"sql\",\"tags\":[\"a\",2,true],\"port\":5}}");
        Assert.Equal(new object[] { "a", 2d, true }, (IEnumerable<object>)lists.Values["tags"]!);
        Assert.Equal(5d, lists.Values["port"]);
        Assert.Throws<CanopyRequestException>(() => CanopyFlowRequest.Parse(engine, CanopyFlowRoutes.Preview, "{\"flow\":\"engine\",\"values\":{\"nested\":{\"a\":1}}}"));
        Assert.Throws<CanopyRequestException>(() => CanopyFlowRequest.Parse(engine, CanopyFlowRoutes.Preview, "{\"flow\":\"engine\",\"values\":{\"nested\":[[1]]}}"));
    }

    [Fact]
    public void Parse_OtherRoutes_NameTheirTargets() {
        var engine = FlowServerSamples.Engine();
        Assert.Equal("region", CanopyFlowRequest.Parse(engine, CanopyFlowRoutes.Options, "{\"flow\":\"engine\",\"field\":\"region\",\"values\":{\"engine\":\"sql\"}}").Field!.Id);
        Assert.Throws<CanopyRequestException>(() => CanopyFlowRequest.Parse(engine, CanopyFlowRoutes.Options, "{\"flow\":\"engine\",\"field\":\"engine\",\"values\":{}}"));
        var fields = CanopyFlowRequest.Parse(engine, CanopyFlowRoutes.Fields, "{\"flow\":\"engine\",\"section\":\"engine-options\",\"values\":{\"engine\":\"sql\",\"database\":\"x\"}}");
        Assert.Equal("engine-options", fields.Section!.Id);
        Assert.Equal("x", fields.Values["database"]);
        Assert.Equal("server", CanopyFlowRequest.Parse(FlowServerSamples.Mail(), CanopyFlowRoutes.Validate, "{\"flow\":\"mail\",\"step\":\"server\",\"values\":{}}").Step!.Id);
        Assert.Null(CanopyFlowRequest.Parse(FlowServerSamples.Mail(), CanopyFlowRoutes.Validate, "{\"flow\":\"mail\",\"values\":{}}").Step);
        Assert.Empty(CanopyFlowRequest.Parse(FlowServerSamples.Mail(), CanopyFlowRoutes.Preview, "{\"flow\":\"mail\"}").Values);
        Assert.Throws<ArgumentException>(() => CanopyFlowRequest.Parse(FlowServerSamples.Mail(), CanopyFlowRoutes.Submit, "{}"));
    }

    [Fact]
    public void Responses_OptionsAndFields_AreCheckedAndWritten() {
        var engine = FlowServerSamples.Engine();
        var region = engine.Steps[0].Fields[1];
        Assert.Equal("{\"options\":[{\"value\":\"eu\",\"label\":\"Europe\"}]}", CanopyFlowResponses.Options(region, new[] { new CanopyFlowOption("eu", "Europe") }));
        Assert.Throws<InvalidOperationException>(() => CanopyFlowResponses.Options(region, new[] { new CanopyFlowOption("eu"), new CanopyFlowOption("eu") }));
        var section = engine.Steps[0].Sections[0];
        Assert.Equal("{\"fields\":[{\"id\":\"database\",\"type\":\"text\",\"label\":\"Database\"}]}", CanopyFlowResponses.Fields(engine, section, new[] { new CanopyFlowField("database", CanopyFlowFieldKind.Text, "Database") }));
        Assert.Throws<InvalidOperationException>(() => CanopyFlowResponses.Fields(engine, section, new[] { new CanopyFlowField("database", CanopyFlowFieldKind.Text, "Database") { ConfigPath = "db.name" } }));
        Assert.Throws<InvalidOperationException>(() => CanopyFlowResponses.Fields(engine, section, new[] { new CanopyFlowField("password", CanopyFlowFieldKind.Secret, "Password") }));
        Assert.Throws<InvalidOperationException>(() => CanopyFlowResponses.Fields(engine, section, new[] { new CanopyFlowField("database", CanopyFlowFieldKind.Text, "Database") { ParameterName = "Database" } }));
    }

    [Fact]
    public void Responses_Draft_KeepsOnlyAWellFormedDraftWithoutSecretsOrSensitiveAnswers() {
        var flow = FlowServerSamples.Mail();
        flow.Steps[0].Fields[3].IsSensitive = true;
        const string draft = "{\"kind\":\"flowDraft\",\"version\":1,\"flow\":\"mail\",\"step\":\"server\",\"completed\":[],\"values\":{\"host\":\"mail.example.com\"},\"saved\":\"2026-10-20T10:00:00Z\"}";
        Assert.Equal(draft, CanopyFlowResponses.Draft(flow, "{\"flow\":\"mail\",\"draft\":" + draft + "}"));
        Assert.Throws<CanopyRequestException>(() => CanopyFlowResponses.Draft(flow, "{\"flow\":\"mail\",\"draft\":" + draft.Replace("\"host\"", "\"password\"") + "}"));
        Assert.Throws<CanopyRequestException>(() => CanopyFlowResponses.Draft(flow, "{\"flow\":\"mail\",\"draft\":" + draft.Replace("\"host\"", "\"user\"") + "}"));
        Assert.Throws<CanopyRequestException>(() => CanopyFlowResponses.Draft(flow, "{\"flow\":\"mail\",\"draft\":" + draft.Replace("\"server\"", "\"elsewhere\"") + "}"));
        Assert.Throws<CanopyRequestException>(() => CanopyFlowResponses.Draft(flow, "{\"flow\":\"mail\",\"draft\":" + draft.Replace("flowDraft", "other") + "}"));
        // A task list's hub is a place a draft can name.
        Assert.Throws<CanopyRequestException>(() => CanopyFlowResponses.Draft(flow, "{\"flow\":\"mail\",\"draft\":" + draft.Replace("\"server\"", "\"#tasks\"") + "}"));
        flow.Mode = CanopyFlowMode.Tasks;
        Assert.Contains("\"step\":\"#tasks\"", CanopyFlowResponses.Draft(flow, "{\"flow\":\"mail\",\"draft\":" + draft.Replace("\"server\"", "\"#tasks\"") + "}"));
    }

    [Fact]
    public void Answers_WriteWhatTheBrowserReads() {
        Assert.Equal("{\"status\":\"saved\",\"message\":\"Done.\",\"result\":[{\"label\":\"Key\",\"value\":\"abc\",\"once\":true}],\"links\":[{\"label\":\"Open\",\"href\":\"/mail\"}]}",
            CanopyFlowAnswer.Saved("Done.").AddResult("Key", "abc", once: true).AddLink("Open", "/mail").ToJson());
        Assert.Equal("{\"status\":\"conflict\"}", CanopyFlowAnswer.Conflict().ToJson());
        Assert.Equal("{\"status\":\"error\",\"message\":\"No.\",\"fieldErrors\":{\"host\":\"Unknown host.\"},\"stepErrors\":{\"server\":\"Fix it.\"}}",
            CanopyFlowAnswer.Error("No.").FieldError("host", "Unknown host.").StepError("server", "Fix it.").ToJson());
        Assert.Equal("{\"status\":\"warning\",\"message\":\"Slow.\",\"details\":[{\"label\":\"Latency\",\"value\":\"900 ms\"}],\"fieldErrors\":{\"port\":\"Try 587.\"}}",
            CanopyFlowCheckResult.Warning("Slow.").Detail("Latency", "900 ms").FieldError("port", "Try 587.").ToJson());
        Assert.Equal("{\"errors\":[\"No route.\"],\"warnings\":[\"Odd port.\"],\"fieldErrors\":{\"port\":\"Closed.\"}}",
            new CanopyFlowValidationResult().Error("No route.").Warning("Odd port.").FieldError("port", "Closed.").ToJson());
        Assert.Equal("{\"title\":\"Changes\",\"rows\":[{\"label\":\"Host\",\"value\":\"mail\",\"tone\":\"warning\"}],\"notes\":[\"Restarts the service.\"]}",
            new CanopyFlowPreview("Changes").Row("Host", "mail", CanopyFlowTone.Warning).Note("Restarts the service.").ToJson());
        Assert.Equal("{\"licence\":{\"state\":\"blocked\",\"summary\":\"Needs a key.\",\"blockers\":[\"Buy a licence.\"]}}",
            CanopyFlowStepStatus.ToJson(new Dictionary<string, CanopyFlowStepStatus> { ["licence"] = new CanopyFlowStepStatus(CanopyFlowTaskState.Blocked, "Needs a key.").Blocker("Buy a licence.") }));
        Assert.Throws<ArgumentException>(() => CanopyFlowAnswer.Error(" "));
    }
}
