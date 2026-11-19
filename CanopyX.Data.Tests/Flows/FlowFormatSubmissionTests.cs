using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests.Flows;

/// <summary>Text formats on the server: the shared cases of tests/fixtures/flow-formats.json, which the browser runs too.</summary>
public sealed class FlowFormatSubmissionTests {
    private static readonly Dictionary<string, CanopyFlowTextFormat> Formats = new() {
        ["email"] = CanopyFlowTextFormat.Email, ["host"] = CanopyFlowTextFormat.Host, ["ip"] = CanopyFlowTextFormat.IpAddress, ["ipv4"] = CanopyFlowTextFormat.IPv4,
        ["ipv6"] = CanopyFlowTextFormat.IPv6, ["cidr"] = CanopyFlowTextFormat.Cidr, ["url"] = CanopyFlowTextFormat.Url, ["mac"] = CanopyFlowTextFormat.Mac,
        ["guid"] = CanopyFlowTextFormat.Guid, ["phone"] = CanopyFlowTextFormat.Phone, ["date"] = CanopyFlowTextFormat.Date, ["time"] = CanopyFlowTextFormat.Time,
        ["dateTime"] = CanopyFlowTextFormat.DateTime
    };

    private static CanopyFlow Flow(CanopyFlowTextFormat format) =>
        new CanopyFlow("device", "Register a device").Step("details", "Device", step => step.Text("answer", "Answer", f => f.Format(format)));

    private static string Proposal(string value) =>
        "{\"kind\":\"flowSubmission\",\"flow\":\"device\",\"version\":1,\"mode\":\"create\",\"values\":{\"answer\":" + JsonSerializer.Serialize(value) + "},\"secrets\":{},\"changes\":[],\"patch\":[]}";

    [Fact]
    public void SharedCases_PassAndFailAsInTheBrowser() {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "flow-formats.json")));
        var cases = document.RootElement.EnumerateObject().Where(entry => !entry.Name.StartsWith("$", StringComparison.Ordinal)).ToList();
        Assert.Equal(Formats.Keys.OrderBy(name => name), cases.Select(entry => entry.Name).OrderBy(name => name));
        foreach (var entry in cases) {
            var flow = Flow(Formats[entry.Name]);
            foreach (var valid in entry.Value.GetProperty("valid").EnumerateArray().Select(item => item.GetString()!))
                Assert.Equal(valid, CanopyFlowSubmission.Parse(flow, Proposal(valid)).Values["answer"]);
            foreach (var invalid in entry.Value.GetProperty("invalid").EnumerateArray().Select(item => item.GetString()!)) {
                var error = Assert.Throws<CanopyFlowSubmissionException>(() => { CanopyFlowSubmission.Parse(flow, Proposal(invalid)); });
                Assert.StartsWith("Answer must look like ", error.FieldErrors["answer"]);
            }
        }
    }

    [Fact]
    public void FieldMessage_ReplacesTheFormatMessage() {
        var flow = new CanopyFlow("device", "Register a device").Step("details", "Device", step => step.Text("answer", "Answer", f => f.Format(CanopyFlowTextFormat.Mac).Message("Use the address on the label.")));
        var error = Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(flow, Proposal("nope")));
        Assert.Equal("Use the address on the label.", error.FieldErrors["answer"]);
    }

    [Fact]
    public void Signature_TakesAnSvgAndAPngAndNothingElse() {
        var flow = new CanopyFlow("consent", "Consent").Step("sign", "Sign", step => step.Signature("signature", "Signature", f => f.Required()));
        string Proposal(string value) => "{\"kind\":\"flowSubmission\",\"flow\":\"consent\",\"version\":1,\"mode\":\"create\",\"values\":{\"signature\":" + value + "},\"secrets\":{},\"changes\":[],\"patch\":[]}";
        var submission = CanopyFlowSubmission.Parse(flow, Proposal("{\"svg\":\"<svg xmlns=\\\"http://www.w3.org/2000/svg\\\"></svg>\",\"png\":\"data:image/png;base64,AAAA\"}"));
        var value = Assert.IsAssignableFrom<IDictionary<string, object?>>(submission.Values["signature"]);
        Assert.Equal("data:image/png;base64,AAAA", value["png"]);
        foreach (var bad in new[] { "\"signed\"", "{\"svg\":\"<svg ></svg>\"}", "{\"svg\":\"<b>x</b>\",\"png\":\"data:image/png;base64,AAAA\"}", "{\"svg\":\"<svg ></svg>\",\"png\":\"https://x/y.png\"}",
            "{\"svg\":\"<svg ></svg>\",\"png\":\"data:image/png;base64,AAAA\",\"extra\":1}" })
            Assert.Contains("svg", Assert.Throws<CanopyRequestException>(() => CanopyFlowSubmission.Parse(flow, Proposal(bad))).Message);
        Assert.Equal("Signature is required.", Assert.Throws<CanopyFlowSubmissionException>(() => CanopyFlowSubmission.Parse(flow, Proposal("null"))).FieldErrors["signature"]);
    }
}
