using Xunit;

namespace CanopyX.Data.Tests.Flows;

/// <summary>CanopyFlowSubmission: the server reads a proposal against its own flow and trusts nothing the browser computed.</summary>
public sealed class FlowSubmissionTests {
    [Fact]
    public void Parse_ValidCreateProposal_ReadsCanonicalValuesAndRecomputesPatchAndCommand() {
        var proposal = FlowServerSamples.MailProposal(FlowServerSamples.ValidValues, extra: ",\"command\":\"Remove-Everything\",\"preset\":\"office\"");
        var submission = CanopyFlowSubmission.Parse(FlowServerSamples.Mail(), proposal);

        Assert.False(submission.IsEdit);
        Assert.True(submission.IsCurrent);
        Assert.Equal(new[] { "host", "port", "auth", "to", "retry", "rules" }, submission.Values.Keys);
        Assert.Equal(587d, submission.Values["port"]);
        Assert.Equal("PT15M", submission.Values["retry"]);
        Assert.Equal("Set-Mail -Server mail.example.com -Port 587", submission.Command);
        Assert.Equal("office", submission.PresetId);
        Assert.Empty(submission.Changes);
        Assert.Empty(submission.Secrets);
        Assert.Equal("[{\"op\":\"add\",\"path\":\"/mail/host\",\"value\":\"mail.example.com\"},{\"op\":\"add\",\"path\":\"/mail/port\",\"value\":587}," +
            "{\"op\":\"add\",\"path\":\"/mail/auth\",\"value\":false},{\"op\":\"add\",\"path\":\"/mail/to\",\"value\":[\"ops@example.com\"]}]", submission.PatchToJson());
    }

    [Theory]
    [InlineData("{\"host\":\"mail.example.com\",\"auth\":false,\"user\":\"svc\"}", "hidden field user")]
    [InlineData("{\"host\":\"mail.example.com\",\"unknown\":1}", "unknown")]
    [InlineData("{\"host\":\"mail.example.com\",\"password\":\"x\"}", "secret field password")]
    [InlineData("{\"host\":5}", "host must be text")]
    public void Parse_MalformedValues_AreRefusedAsRequests(string values, string expected) {
        var error = Assert.Throws<CanopyRequestException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Mail(), FlowServerSamples.MailProposal(values)));
        Assert.Equal(CanopyRequestError.InvalidDocument, error.Error);
        Assert.Contains(expected, error.Message);
    }

    [Theory]
    [InlineData("{\"kind\":\"flowSubmission\",\"flow\":\"other\",\"version\":1,\"mode\":\"create\",\"values\":{}}", "another flow")]
    [InlineData("{\"kind\":\"flowSubmission\",\"flow\":\"mail\",\"version\":1,\"mode\":\"edit\",\"values\":{}}", "mode")]
    [InlineData("{\"kind\":\"flowSubmission\",\"flow\":\"mail\",\"version\":2,\"mode\":\"create\",\"values\":{}}", "version 1")]
    [InlineData("{\"kind\":\"flowSubmission\",\"flow\":\"mail\",\"version\":1,\"mode\":\"create\",\"values\":{},\"extra\":1}", "unknown property")]
    [InlineData("{\"kind\":\"flowSubmission\",\"flow\":\"mail\",\"version\":1,\"mode\":\"create\",\"values\":{},\"checks\":{\"nope\":{\"status\":\"pass\"}}}", "no check")]
    public void Parse_WrongEnvelope_IsRefused(string proposal, string expected) {
        var error = Assert.Throws<CanopyRequestException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Mail(), proposal));
        Assert.Contains(expected, error.Message);
    }

    [Fact]
    public void Parse_InvalidJson_IsInvalidJson() {
        var error = Assert.Throws<CanopyRequestException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Mail(), "{\"kind\":"));
        Assert.Equal(CanopyRequestError.InvalidJson, error.Error);
    }

    [Fact]
    public void Parse_AnswersFailingTheRules_ThrowFieldErrorsAsTheBrowserWordsThem() {
        const string values = "{\"host\":\"ab\",\"port\":0.5,\"auth\":false,\"to\":[\"ops@example.com\",\"not-mail\"],\"retry\":\"PT30S\",\"rules\":[{\"name\":\"Daily\",\"limit\":0},{\"limit\":2}]}";
        var error = Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Mail(), FlowServerSamples.MailProposal(values)));

        Assert.Equal("Host needs at least 3 characters.", error.FieldErrors["host"]);
        Assert.Equal("Port must be at least 1.", error.FieldErrors["port"]);
        Assert.Equal("“not-mail” is not an email address.", error.FieldErrors["to"]);
        Assert.Equal("Retry after must be at least 1 minute.", error.FieldErrors["retry"]);
        Assert.Equal("Row 1: Limit must be at least 1.", error.FieldErrors["rules"]);
        var answer = error.ToAnswer().ToJson();
        Assert.StartsWith("{\"status\":\"error\",\"fieldErrors\":{\"host\":", answer);
    }

    [Fact]
    public void Parse_RequiredAndCounts_AreChecked() {
        var error = Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Mail(), FlowServerSamples.MailProposal("{\"to\":[\"a@b.cc\",\"b@b.cc\",\"c@b.cc\",\"d@b.cc\",\"e@b.cc\",\"f@b.cc\"]}")));
        Assert.Equal("Host is required.", error.FieldErrors["host"]);
        Assert.Equal("To allows at most 5.", error.FieldErrors["to"]);
        Assert.False(error.FieldErrors.ContainsKey("user"));
    }

    [Fact]
    public void ParseRequest_TypedSecret_IsReadOnceAndCheckedButNeverAValue() {
        var values = FlowServerSamples.ValidValues.Replace("\"auth\":false", "\"auth\":true,\"user\":\"svc\"");
        var body = "{\"flow\":\"mail\",\"submission\":" + FlowServerSamples.MailProposal(values, "{\"password\":{\"state\":\"set\"}}") + ",\"secrets\":{\"password\":\"s3cret!\"}}";
        var submission = CanopyFlowSubmission.ParseRequest(FlowServerSamples.Mail(), body);

        Assert.Equal(CanopyFlowSecretState.Set, submission.Secrets["password"]);
        Assert.DoesNotContain("password", submission.Values.Keys);
        Assert.Equal("Set-Mail -Server mail.example.com -Port 587 -Credential <secret>", submission.Command);
        Assert.Equal("s3cret!", submission.ReadSecret("password"));
        Assert.Null(submission.ReadSecret("password"));
    }

    [Fact]
    public void ParseRequest_SecretProblems_AreRefused() {
        var values = FlowServerSamples.ValidValues.Replace("\"auth\":false", "\"auth\":true,\"user\":\"svc\"");
        var tooShort = "{\"flow\":\"mail\",\"submission\":" + FlowServerSamples.MailProposal(values, "{\"password\":{\"state\":\"set\"}}") + ",\"secrets\":{\"password\":\"abc\"}}";
        Assert.Equal("Password needs at least 4 characters.", Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.ParseRequest(FlowServerSamples.Mail(), tooShort)).FieldErrors["password"]);

        var missing = "{\"flow\":\"mail\",\"submission\":" + FlowServerSamples.MailProposal(values, "{\"password\":{\"state\":\"set\"}}") + "}";
        Assert.Contains("does not travel", Assert.Throws<CanopyRequestException>(() => CanopyFlowSubmission.ParseRequest(FlowServerSamples.Mail(), missing)).Message);

        var stray = "{\"flow\":\"mail\",\"submission\":" + FlowServerSamples.MailProposal(FlowServerSamples.ValidValues) + ",\"secrets\":{\"password\":\"s3cret!\"}}";
        Assert.Contains("does not set", Assert.Throws<CanopyRequestException>(() => CanopyFlowSubmission.ParseRequest(FlowServerSamples.Mail(), stray)).Message);

        var keepWithoutStored = FlowServerSamples.MailProposal(values, "{\"password\":{\"state\":\"keep\"}}");
        Assert.Contains("stored value", Assert.Throws<CanopyRequestException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Mail(), keepWithoutStored)).Message);

        var notSet = FlowServerSamples.MailProposal(values);
        Assert.Equal("Password is required.", Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Mail(), notSet)).FieldErrors["password"]);
    }

    [Fact]
    public void Parse_EditProposal_ComputesChangesPatchAndKeptSecretsFromTheInitialValues() {
        const string values = "{\"host\":\"new.example.com\",\"port\":25,\"auth\":true,\"user\":null,\"to\":[\"ops@example.com\"],\"retry\":null,\"rules\":[]}";
        var proposal = "{\"kind\":\"flowSubmission\",\"flow\":\"mail\",\"version\":1,\"mode\":\"edit\",\"baseline\":\"r0\",\"values\":" + values + ",\"secrets\":{\"password\":{\"state\":\"keep\"}},\"checks\":{\"connection\":{\"status\":\"warning\",\"at\":\"2026-10-20T10:00:00Z\"}}}";
        var error = Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Mail(edit: true), proposal));
        Assert.Equal(new[] { "user" }, error.FieldErrors.Keys);

        var submission = CanopyFlowSubmission.Parse(FlowServerSamples.Mail(edit: true), proposal.Replace("\"user\":null", "\"user\":\"svc\""));
        Assert.True(submission.IsEdit);
        Assert.False(submission.IsCurrent);
        Assert.Equal("r0", submission.Baseline);
        Assert.Equal(CanopyFlowSecretState.Keep, submission.Secrets["password"]);
        Assert.Equal(CanopyFlowCheckStatus.Warning, submission.Checks["connection"].Status);
        Assert.Equal(new[] { "host", "to" }, submission.Changes.Select(change => change.FieldId));
        Assert.Equal("old.example.com", submission.Changes[0].From);
        Assert.Equal("[{\"op\":\"replace\",\"path\":\"/mail/host\",\"value\":\"new.example.com\"},{\"op\":\"add\",\"path\":\"/mail/to\",\"value\":[\"ops@example.com\"]}]", submission.PatchToJson());
        Assert.Equal("Set-Mail -Server new.example.com", submission.Command);
    }

    [Fact]
    public void Parse_StoredSecretLeftBlankWithoutKeep_IsCleared() {
        var flow = FlowServerSamples.Mail(edit: true);
        foreach (var field in flow.Steps[0].Fields) if (field.Id == "password") { field.KeepsWhenBlank = false; field.IsRequired = false; }
        const string values = "{\"host\":\"old.example.com\",\"port\":25,\"auth\":true,\"user\":\"svc\",\"to\":[\"ops@example.com\"],\"retry\":null,\"rules\":[]}";
        var submission = CanopyFlowSubmission.Parse(flow, "{\"kind\":\"flowSubmission\",\"flow\":\"mail\",\"version\":1,\"mode\":\"edit\",\"baseline\":\"r1\",\"values\":" + values + "}");
        Assert.Equal(CanopyFlowSecretState.Clear, submission.Secrets["password"]);
        Assert.True(submission.IsCurrent);
    }

    [Fact]
    public void Parse_HostSection_ChecksAnswersAgainstTheHostsFields() {
        var options = new CanopyFlowReadOptions {
            SectionFields = (section, values) => Equals(values["engine"], "sql")
                ? new[] { new CanopyFlowField("database", CanopyFlowFieldKind.Text, "Database") { IsRequired = true } }
                : new[] { new CanopyFlowField("folder", CanopyFlowFieldKind.Text, "Folder") }
        };
        string Proposal(string values) => "{\"kind\":\"flowSubmission\",\"flow\":\"engine\",\"version\":1,\"mode\":\"create\",\"values\":" + values + "}";

        var submission = CanopyFlowSubmission.Parse(FlowServerSamples.Engine(), Proposal("{\"engine\":\"sql\",\"region\":\"eu\",\"database\":\"Mail\"}"), options: options);
        Assert.Equal("Mail", submission.Values["database"]);
        Assert.Equal("Database is required.", Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Engine(), Proposal("{\"engine\":\"sql\"}"), options: options)).FieldErrors["database"]);
        Assert.Throws<CanopyRequestException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Engine(), Proposal("{\"engine\":\"file\",\"database\":\"Mail\"}"), options: options));
        Assert.Throws<InvalidOperationException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Engine(), Proposal("{\"engine\":\"sql\"}")));
    }

    [Fact]
    public void Parse_HostSectionFieldsTheBrowserCannotRead_AreTheHostsBug() {
        var options = new CanopyFlowReadOptions { SectionFields = (section, values) => new[] { new CanopyFlowField("engine", CanopyFlowFieldKind.Text, "Again") } };
        Assert.Throws<InvalidOperationException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Engine(), "{\"kind\":\"flowSubmission\",\"flow\":\"engine\",\"version\":1,\"mode\":\"create\",\"values\":{\"engine\":\"sql\"}}", options: options));
    }

    [Fact]
    public void Parse_HostOptions_RefuseValuesTheHostNoLongerOffers() {
        var options = new CanopyFlowReadOptions {
            SectionFields = (section, values) => new CanopyFlowField[0],
            HostOptions = (field, values) => new[] { new CanopyFlowOption("eu", "Europe"), new CanopyFlowOption("us", "US") { DisabledReason = "Full." } }
        };
        string Proposal(string region) => "{\"kind\":\"flowSubmission\",\"flow\":\"engine\",\"version\":1,\"mode\":\"create\",\"values\":{\"engine\":\"file\",\"region\":\"" + region + "\"}}";
        Assert.Equal("eu", CanopyFlowSubmission.Parse(FlowServerSamples.Engine(), Proposal("eu"), options: options).Values["region"]);
        Assert.Equal("Choose Region from the list.", Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Engine(), Proposal("us"), options: options)).FieldErrors["region"]);
        Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Engine(), Proposal("asia"), options: options));
    }

    [Fact]
    public async Task ParseRequestAsync_LoadsHostSectionsAsynchronously() {
        var options = new CanopyFlowReadOptions {
            SectionFieldsAsync = async (section, values, token) => { await Task.Yield(); return new[] { new CanopyFlowField("folder", CanopyFlowFieldKind.Text, "Folder") }; }
        };
        var body = "{\"flow\":\"engine\",\"submission\":{\"kind\":\"flowSubmission\",\"flow\":\"engine\",\"version\":1,\"mode\":\"create\",\"values\":{\"engine\":\"file\",\"folder\":\"D:\\\\Mail\"}}}";
        var submission = await CanopyFlowSubmission.ParseRequestAsync(FlowServerSamples.Engine(), body, options);
        Assert.Equal("D:\\Mail", submission.Values["folder"]);
    }

    [Fact]
    public void Parse_LocalizedLabels_WordTheMessages() {
        var flow = FlowServerSamples.Mail();
        flow.Labels = new CanopyLabels { GridEditRequired = "{column} jest wymagane." };
        var error = Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(flow, FlowServerSamples.MailProposal("{}")));
        Assert.Equal("Host jest wymagane.", error.FieldErrors["host"]);
    }
}
