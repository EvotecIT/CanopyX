using System.IO.Compression;
using System.Text;
using CanopyX.Html;
using CanopyX.Tests.Flows;

namespace CanopyX.Tests.Html;

/// <summary>The forms part, the flow part and the flow entry point: their size guards and what each one carries.</summary>
public sealed class FlowPartAssetsTests {
    [Fact]
    public void FormsPart_IsVersionedInlineSafeAndBounded() {
        var part = CanopyHtmlAssets.GetPart("forms");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid, CanopyRuntime.Flow }, part.Runtimes);
        Assert.Empty(part.Requires);
        Assert.NotNull(part.Style);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        var size = ComponentGzip(part.Script) + ComponentGzip(part.Style!);
        // Flow wave F1: 5,354 bytes plus about 15%, rounded up to KiB.
        Assert.True(size <= 7 * 1024, "The forms part is " + size + " bytes gzip; the guard is 7 KiB.");
    }

    [Fact]
    public void FlowPart_IsVersionedInlineSafeAndBounded() {
        var part = CanopyHtmlAssets.GetPart("flow");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid, CanopyRuntime.Flow }, part.Runtimes);
        Assert.Equal(new[] { "forms" }, part.Requires);
        Assert.NotNull(part.Style);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        var size = ComponentGzip(part.Script) + ComponentGzip(part.Style!);
        // The guard of flow wave F1 (28,120 bytes at F1). Wave F2 keeps it: the host-connected features ship in parts of their
        // own (below), loaded only for a flow that uses them, and the flow part keeps only their seams.
        Assert.True(size <= 29 * 1024, "The flow part is " + size + " bytes gzip; the guard is 29 KiB.");
    }

    /// <summary>The host-connected feature parts of flow wave F2: what each requires, and its guard (its size at F2 plus about 15%,
    /// rounded up to KiB).</summary>
    [Theory]
    [InlineData("flow-host", 3, "flow")]
    [InlineData("flow-checks", 6, "flow,flow-host")]
    [InlineData("flow-options", 4, "flow,flow-host")]
    [InlineData("flow-pick", 5, "flow,flow-host")]
    [InlineData("flow-records", 5, "flow")]
    [InlineData("flow-drafts", 6, "flow,flow-host")]
    [InlineData("flow-preview", 2, "flow,flow-host")]
    [InlineData("flow-command", 4, "flow")]
    [InlineData("flow-tasks", 5, "flow,flow-host")]
    [InlineData("flow-dialog", 3, "flow,flow-host")]
    [InlineData("flow-links", 2, "flow,flow-host")]
    [InlineData("flow-endpoint", 2, "flow,flow-host")]
    [InlineData("flow-consent", 3, "flow")]
    public void FlowFeaturePart_IsVersionedInlineSafeAndBounded(string name, int guardKiB, string requires) {
        var part = CanopyHtmlAssets.GetPart(name);
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid, CanopyRuntime.Flow }, part.Runtimes);
        Assert.Equal(requires.Split(',', StringSplitOptions.None), part.Requires);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        var size = ComponentGzip(part.Script) + (part.Style == null ? 0 : ComponentGzip(part.Style));
        Assert.True(size <= guardKiB * 1024, "The " + name + " part is " + size + " bytes gzip; the guard is " + guardKiB + " KiB.");
    }

    [Fact]
    public void FlowEntryPoint_IsBounded() {
        // Flow wave F1: 8,342 bytes plus about 15%, rounded up to KiB.
        // Includes the shared controls (canopyx.source/controls.css) the flow moves onto.
        SharedTokenAssets.AssertRuntimeBudget(CanopyRuntime.Flow, 12 * 1024);
        Assert.DoesNotContain("</script", CanopyHtmlAssets.GetScript(CanopyRuntime.Flow), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("</style", CanopyHtmlAssets.GetStyle(CanopyRuntime.Flow), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void FlowEntryPoint_CarriesNoGridOrTreeCode() {
        var script = CanopyHtmlAssets.GetScript(CanopyRuntime.Flow);
        foreach (var marker in new[] { "createDataGrid", "createTreeGrid", "class TreeGrid", "class DataGrid", "function editSpec(", "const EDIT_EDITORS" })
            Assert.DoesNotContain(marker, script);
        Assert.Contains("createFlow", script);
        Assert.Contains("function registerPart(", script);
        // The grid entry points host flows too: they create them and load the same parts.
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) Assert.Contains("createFlow", CanopyHtmlAssets.GetScript(runtime));
    }

    [Fact]
    public void FlowPage_EmbedsOnlyTheFormsAndFlowPayloads() {
        var page = FlowSamples.Everything().ToHtmlPage();
        var embedded = CanopyHtmlAssets.Parts.Where(part => page.Contains("type=\"application/x-canopyx-" + part.Name + "\"", StringComparison.Ordinal)).Select(part => part.Name);
        Assert.Equal(new[] { "forms", "flow" }, embedded);
        Assert.Contains("type=\"application/x-canopyx-forms-style\"", page);
        Assert.Contains("type=\"application/x-canopyx-flow-style\"", page);
    }

    // Token fallback bytes have their own shared allowance; keep this component ceiling unchanged.
    private static long ComponentGzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(SharedTokenAssets.WithoutFallbackPayload(value)); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
