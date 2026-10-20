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
        var size = Gzip(part.Script) + Gzip(part.Style!);
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
        var size = Gzip(part.Script) + Gzip(part.Style!);
        // Flow wave F2 (host checks, options, pickers, records, task lists, dialogs, command, drafts, presets, links, endpoint):
        // 49,914 bytes plus about 15%, rounded up to KiB. F1 was 25,419; TODO.md tracks moving the host features to a part of their own.
        Assert.True(size <= 57 * 1024, "The flow part is " + size + " bytes gzip; the guard is 57 KiB.");
    }

    [Fact]
    public void FlowEntryPoint_IsBounded() {
        var size = Gzip(CanopyHtmlAssets.GetScript(CanopyRuntime.Flow)) + Gzip(CanopyHtmlAssets.GetStyle(CanopyRuntime.Flow));
        // Flow wave F1: 8,342 bytes plus about 15%, rounded up to KiB.
        Assert.True(size <= 10 * 1024, "The flow entry point is " + size + " bytes gzip; the guard is 10 KiB.");
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

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
