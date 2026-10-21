using Xunit;

namespace CanopyX.Data.Tests.Flows;

/// <summary>Server boundaries that must hold even when the caller bypasses the browser's editors.</summary>
public sealed class FlowServerBoundaryTests {
    [Fact]
    public void HostMultiChoice_RefusesMoreThan1000AnswersBeforeHostValidation() {
        var flow = new CanopyFlow("choices", "Choices").Step("pick", "Pick", step => step.MultiChoice("choices", "Choices", field => field.FromHost()));
        var values = "{\"choices\":[" + string.Join(",", Enumerable.Range(0, 1001)) + "]}";
        var checkedByHost = false;
        var options = new CanopyFlowReadOptions {
            HostOptions = (field, answers) => { checkedByHost = true; return Enumerable.Range(0, 1001).Select(value => new CanopyFlowOption(value)); }
        };

        Assert.Throws<CanopyRequestException>(() => CanopyFlowRequest.Parse(flow, CanopyFlowRoutes.Preview, "{\"flow\":\"choices\",\"values\":" + values + "}"));
        Assert.Throws<CanopyRequestException>(() => CanopyFlowSubmission.Parse(flow, Proposal("choices", values), options: options));
        Assert.False(checkedByHost);
    }

    [Fact]
    public void HostMultiChoice_Accepts1000Answers() {
        var flow = new CanopyFlow("choices", "Choices").Step("pick", "Pick", step => step.MultiChoice("choices", "Choices", field => field.FromHost()));
        var values = "{\"choices\":[" + string.Join(",", Enumerable.Range(0, 1000)) + "]}";
        var options = new CanopyFlowReadOptions { HostOptions = (field, answers) => Enumerable.Range(0, 1000).Select(value => new CanopyFlowOption(value)) };

        var submission = CanopyFlowSubmission.Parse(flow, Proposal("choices", values), options: options);

        Assert.Equal(1000, Assert.IsType<List<object>>(submission.Values["choices"]).Count);
    }

    [Theory]
    [InlineData(CanopyFlowFieldKind.Select)]
    [InlineData(CanopyFlowFieldKind.Choice)]
    [InlineData(CanopyFlowFieldKind.Lookup)]
    [InlineData(CanopyFlowFieldKind.MultiChoice)]
    public void Submission_RejectsDisabledDocumentChoicesWithoutInvalidatingInitialMetadata(CanopyFlowFieldKind kind) {
        var field = Choice(kind);
        var flow = new CanopyFlow("choices", "Choices");
        flow.Step("pick", "Pick", step => step.Fields.Add(field));
        flow.Initial["audience"] = kind == CanopyFlowFieldKind.MultiChoice ? new[] { "all" } : (object)"all";
        flow.Validate();
        Assert.Contains("\"initial\"", flow.ToContract());
        var values = "{\"audience\":" + (kind == CanopyFlowFieldKind.MultiChoice ? "[\"all\"]" : "\"all\"") + "}";

        var error = Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(flow, Proposal("choices", values, "edit")));

        Assert.Equal("Choose Audience from the list.", error.FieldErrors["audience"]);
        var accepted = CanopyFlowSubmission.Parse(flow, Proposal("choices", values.Replace("all", "team"), "edit"));
        if (kind == CanopyFlowFieldKind.MultiChoice) Assert.Equal(new object[] { "team" }, Assert.IsType<List<object>>(accepted.Values["audience"]));
        else Assert.Equal("team", accepted.Values["audience"]);
    }

    [Fact]
    public void Submission_RejectsDisabledHostSectionChoice() {
        var options = new CanopyFlowReadOptions { SectionFields = (section, answers) => new[] { Choice(CanopyFlowFieldKind.Choice) } };
        var error = Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(FlowServerSamples.Engine(),
            Proposal("engine", "{\"engine\":\"sql\",\"audience\":\"all\"}"), options: options));

        Assert.Equal("Choose Audience from the list.", error.FieldErrors["audience"]);
    }

    [Fact]
    public void Submission_RejectsDisabledRecordCellChoice() {
        var flow = new CanopyFlow("choices", "Choices").Step("pick", "Pick", step => step.Records("rules", "Rules", field =>
            field.Column("audience", "Audience", CanopyFlowRecordColumnKind.Select, column => {
                column.Option("team");
                column.Options.Add(new CanopyFlowOption("all") { DisabledReason = "Needs approval." });
            })));

        var error = Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(flow, Proposal("choices", "{\"rules\":[{\"audience\":\"all\"}]}")));

        Assert.Equal("Row 1: Choose Audience from the list.", error.FieldErrors["rules"]);
        var accepted = CanopyFlowSubmission.Parse(flow, Proposal("choices", "{\"rules\":[{\"audience\":\"team\"}]}"));
        var row = Assert.IsType<Dictionary<string, object?>>(Assert.Single(Assert.IsType<List<object>>(accepted.Values["rules"])));
        Assert.Equal("team", row["audience"]);
    }

    [Fact]
    public void Draft_RefusesHostAnswersWhenFieldMetadataIsUnavailable() {
        Assert.Throws<InvalidOperationException>(() => CanopyFlowResponses.Draft(FlowServerSamples.Engine(), Draft("{\"engine\":\"sql\",\"account\":\"private-value\"}")));
    }

    private static CanopyFlowField Choice(CanopyFlowFieldKind kind) => new CanopyFlowField("audience", kind, "Audience")
        .Option("team").Option(new CanopyFlowOption("all") { DisabledReason = "Needs approval." });

    private static string Proposal(string flow, string values, string mode = "create") =>
        "{\"kind\":\"flowSubmission\",\"flow\":\"" + flow + "\",\"version\":1,\"mode\":\"" + mode + "\",\"values\":" + values + "}";

    internal static string Draft(string values) =>
        "{\"flow\":\"engine\",\"draft\":{\"kind\":\"flowDraft\",\"version\":1,\"flow\":\"engine\",\"step\":\"pick\",\"values\":" + values + "}}";
}
