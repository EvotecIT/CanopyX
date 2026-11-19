using Xunit;

namespace CanopyX.Data.Tests.Flows;

/// <summary>The server reads a rating answer as the browser writes it: a whole number of stars within the field's scale.</summary>
public sealed class FlowRatingSubmissionTests {
    private static CanopyFlow Survey() =>
        new CanopyFlow("survey", "Service survey").Step("answers", "How did it go?", step => step.Rating("quality", "Service quality", f => f.Scale(4).Required().Path("survey.quality")));

    private static string Proposal(string values) =>
        "{\"kind\":\"flowSubmission\",\"flow\":\"survey\",\"version\":1,\"mode\":\"create\",\"values\":" + values + ",\"secrets\":{},\"changes\":[],\"patch\":[]}";

    [Fact]
    public void Parse_ReadsAWholeNumberOfStars() {
        var submission = CanopyFlowSubmission.Parse(Survey(), Proposal("{\"quality\":3}"));
        Assert.Equal(3d, submission.Values["quality"]);
    }

    [Theory]
    [InlineData("{\"quality\":5}")]
    [InlineData("{\"quality\":2.5}")]
    [InlineData("{\"quality\":\"3\"}")]
    public void Parse_RefusesAnswersOutsideTheScale(string values) {
        var error = Assert.Throws<CanopyRequestException>(() => CanopyFlowSubmission.Parse(Survey(), Proposal(values)));
        Assert.Contains("stars", error.Message);
    }

    [Fact]
    public void Parse_ARequiredRatingNeedsAnAnswer() {
        var error = Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(Survey(), Proposal("{}")));
        Assert.Equal("Service quality is required.", error.FieldErrors["quality"]);
    }
}
