using Xunit;

namespace CanopyX.Data.Tests.Flows;

/// <summary>Draft storage admits partial answers only after establishing their field types and sensitivity.</summary>
public sealed class FlowDraftTests {
    [Fact]
    public void Draft_ChecksHostMetadataAndKeepsIncompleteOrdinaryAnswers() {
        var options = new CanopyFlowReadOptions {
            SectionFields = (section, answers) => {
                Assert.Equal("engine-options", section.Id);
                Assert.Equal("sql", answers["engine"]);
                return Fields();
            }
        };
        var ordinary = FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"database\":\"x\"}");

        Assert.Contains("\"database\":\"x\"", CanopyFlowResponses.Draft(FlowServerSamples.Engine(), ordinary, options));
        var error = Assert.Throws<CanopyRequestException>(() => CanopyFlowResponses.Draft(FlowServerSamples.Engine(),
            FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"account\":\"private-value\"}"), options));
        Assert.Contains("sensitive field account", error.Message);
        Assert.Throws<CanopyRequestException>(() => CanopyFlowResponses.Draft(FlowServerSamples.Engine(),
            FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"unknown\":\"x\"}"), options));
        Assert.Throws<CanopyRequestException>(() => CanopyFlowResponses.Draft(FlowServerSamples.Engine(),
            FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"database\":42}"), options));
    }

    [Fact]
    public async Task DraftAsync_PrefersAsyncMetadataAndChecksSensitiveAnswers() {
        using var cancel = new CancellationTokenSource();
        var loads = 0;
        var options = new CanopyFlowReadOptions {
            SectionFields = (section, answers) => throw new InvalidOperationException("The async reader must prefer its async loader."),
            SectionFieldsAsync = async (section, answers, token) => {
                Assert.Equal(cancel.Token, token);
                Assert.Equal("sql", answers["engine"]);
                await Task.Yield();
                loads++;
                return Fields();
            }
        };

        var ordinary = await CanopyFlowResponses.DraftAsync(FlowServerSamples.Engine(),
            FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"database\":\"Mail\"}"), options, cancel.Token);
        Assert.Contains("\"database\":\"Mail\"", ordinary);
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => CanopyFlowResponses.DraftAsync(FlowServerSamples.Engine(),
            FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"account\":\"private-value\"}"), options, cancel.Token));
        Assert.Contains("sensitive field account", error.Message);
        Assert.Equal(2, loads);
    }

    [Fact]
    public async Task DraftAsync_FallsBackToSyncMetadataAndFailsClosedWithoutALoader() {
        var ordinary = FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"database\":\"Mail\"}");
        var options = new CanopyFlowReadOptions { SectionFields = (section, answers) => Fields() };

        Assert.Equal(CanopyFlowResponses.Draft(FlowServerSamples.Engine(), ordinary, options),
            await CanopyFlowResponses.DraftAsync(FlowServerSamples.Engine(), ordinary, options));
        await Assert.ThrowsAsync<InvalidOperationException>(() => CanopyFlowResponses.DraftAsync(FlowServerSamples.Engine(), ordinary));
        options.SectionFieldsAsync = (section, answers, token) => Task.FromResult(Fields());
        options.SectionFields = null;
        Assert.Throws<InvalidOperationException>(() => CanopyFlowResponses.Draft(FlowServerSamples.Engine(), ordinary, options));
    }

    [Fact]
    public async Task DraftAsync_CancellationDuringMetadataLoadingRefusesTheDraft() {
        using var cancel = new CancellationTokenSource();
        var options = new CanopyFlowReadOptions {
            SectionFieldsAsync = (section, answers, token) => {
                Assert.Equal(cancel.Token, token);
                cancel.Cancel();
                return Task.FromResult(Fields());
            }
        };

        await Assert.ThrowsAsync<OperationCanceledException>(() => CanopyFlowResponses.DraftAsync(FlowServerSamples.Engine(),
            FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"database\":\"Mail\"}"), options, cancel.Token));
    }

    [Fact]
    public void Draft_ChecksHiddenHostAnswersAndReusesFieldAdmissionAcrossSections() {
        var flow = FlowServerSamples.Engine();
        flow.Steps[0].Sections[0].Condition = CanopyFlowCondition.Equal("engine", "file");
        var options = new CanopyFlowReadOptions { SectionFields = (section, answers) => Fields() };

        Assert.Contains("\"database\":\"Mail\"", CanopyFlowResponses.Draft(flow,
            FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"database\":\"Mail\"}"), options));
        Assert.Throws<CanopyRequestException>(() => CanopyFlowResponses.Draft(flow,
            FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"account\":\"private-value\"}"), options));

        flow.Steps[0].Section("extra", "Extra", section => section.FromHost());
        Assert.Throws<InvalidOperationException>(() => CanopyFlowResponses.Draft(flow,
            FlowServerBoundaryTests.Draft("{\"engine\":\"sql\",\"database\":\"Mail\"}"), options));
    }

    [Fact]
    public void Draft_WithoutHostAnswersNeedsNoLoaderAndRetainsHiddenStaticAnswers() {
        var mail = FlowServerSamples.Mail();
        var body = "{\"flow\":\"mail\",\"draft\":{\"kind\":\"flowDraft\",\"version\":1,\"flow\":\"mail\",\"values\":{\"auth\":false,\"user\":\"svc\"}}}";
        Assert.Contains("\"user\":\"svc\"", CanopyFlowResponses.Draft(mail, body));
        Assert.Contains("\"engine\":\"sql\"", CanopyFlowResponses.Draft(FlowServerSamples.Engine(), FlowServerBoundaryTests.Draft("{\"engine\":\"sql\"}")));
    }

    private static IEnumerable<CanopyFlowField> Fields() => new[] {
        new CanopyFlowField("account", CanopyFlowFieldKind.Text, "Account").Sensitive(),
        new CanopyFlowField("database", CanopyFlowFieldKind.Text, "Database").Required().Length(3, 80)
    };
}
