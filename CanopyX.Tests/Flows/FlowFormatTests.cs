using System.Text.Json;

namespace CanopyX.Tests.Flows;

/// <summary>Text formats, masks and signature fields in the flow contract.</summary>
public sealed class FlowFormatTests {
    [Fact]
    public void FormatAndMask_AreWrittenAndReadBack() {
        var flow = new CanopyFlow("device", "Register a device").Step("details", "Device", step => step
            .Text("mac", "MAC address", f => f.Format(CanopyFlowTextFormat.Mac))
            .Text("asset", "Asset tag", f => f.Pattern("[A-Z]{3}-[0-9]{4}").Mask("AAA-0000"))
            .Signature("signature", "Signature"));
        var json = flow.ToContract();
        using var document = JsonDocument.Parse(json);
        var fields = document.RootElement.GetProperty("steps")[0].GetProperty("fields");
        Assert.Equal("mac", fields[0].GetProperty("validation").GetProperty("format").GetString());
        Assert.Equal("AAA-0000", fields[1].GetProperty("mask").GetString());
        Assert.Equal("signature", fields[2].GetProperty("type").GetString());
        var read = CanopyFlow.FromContract(json).Steps[0].Fields;
        Assert.Equal(CanopyFlowTextFormat.Mac, read[0].TextFormat);
        Assert.Equal("AAA-0000", read[1].InputMask);
        Assert.Equal(CanopyFlowFieldKind.Signature, read[2].Kind);
        Assert.Equal(json, CanopyFlow.FromContract(json).ToContract());
    }

    [Fact]
    public void FormatsMasksAndSignatures_ApplyOnlyWhereTheyFit() {
        static string Problem(Action<CanopyFlowStep> configure) =>
            Assert.Throws<InvalidOperationException>(() => new CanopyFlow("f", "F").Step("s", "S", configure).ToContract()).Message;
        Assert.Contains("format and a mask apply to text fields", Problem(step => step.Number("n", "N", f => f.Format(CanopyFlowTextFormat.Guid))));
        Assert.Contains("format and a mask apply to text fields", Problem(step => step.TextArea("n", "N", f => f.Mask("AAA"))));
        Assert.Contains("mask", Problem(step => step.Text("n", "N", f => f.Mask(new string('A', 65)))));
        Assert.Contains("unknown format", Problem(step => step.Text("n", "N", f => f.TextFormat = (CanopyFlowTextFormat)99)));
        Assert.Contains("no parameter and no default", Problem(step => step.Signature("n", "N", f => f.Parameter("Signature"))));
        Assert.Throws<InvalidOperationException>(() => CanopyFlow.FromContract("{\"kind\":\"flow\",\"version\":1,\"id\":\"f\",\"title\":\"F\",\"steps\":[{\"id\":\"s\",\"title\":\"S\",\"fields\":[{\"id\":\"a\",\"type\":\"text\",\"label\":\"A\",\"validation\":{\"format\":\"zip\"}}]}]}"));
    }
}
