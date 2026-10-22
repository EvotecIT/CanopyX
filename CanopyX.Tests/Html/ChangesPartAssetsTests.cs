using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>The changes part: its size guard, where it ships, and what a change view's page embeds.</summary>
public sealed class ChangesPartAssetsTests {
    [Fact]
    public void ChangesPart_IsVersionedInlineSafeAndBounded() {
        var part = CanopyHtmlAssets.GetPart("changes");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }, part.Runtimes);
        Assert.Empty(part.Requires);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        var size = Gzip(part.Script) + Gzip(part.Style!);
        // Change views with their actions and exports: 26,564 bytes plus about 15%, rounded up to KiB (27,974 bytes after the review round).
        Assert.True(size <= 30 * 1024, "The changes part is " + size + " bytes gzip; the guard is 30 KiB.");
    }

    [Fact]
    public void GridEntryPoints_CarryTheShellAndNotTheViews() {
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.Contains("createChangeList", script);
            Assert.DoesNotContain("class DiffView", script);
        }

        Assert.DoesNotContain("createChangeList", CanopyHtmlAssets.GetScript(CanopyRuntime.TreeGrid));
    }

    [Fact]
    public void ChangeViewPages_EmbedOnlyTheChangesPayload() {
        var view = new CanopyPropagation("p", "P");
        view.Witness("a", "A", CanopyPropagationState.Converged);
        var page = view.ToHtmlPage();
        var embedded = CanopyHtmlAssets.Parts.Where(part => page.Contains("type=\"application/x-canopyx-" + part.Name + "\"", StringComparison.Ordinal)).Select(part => part.Name);
        Assert.Equal(new[] { "changes" }, embedded);
        Assert.Contains("type=\"application/x-canopyx-changes-style\"", page);
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
