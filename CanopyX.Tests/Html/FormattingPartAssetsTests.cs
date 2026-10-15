using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Conditional formatting ships in two lazy parts, outside the entry points: the formatting part and the rule editor.</summary>
public sealed class FormattingPartAssetsTests {
    [Fact]
    public void FormattingParts_AreVersionedInlineSafeBoundedAndOutsideTheEntryPoints() {
        var formatting = CanopyHtmlAssets.GetPart("formatting");
        var editor = CanopyHtmlAssets.GetPart("format-editor");
        Assert.Equal(new[] { "filter-editor", "formatting" }, editor.Requires);
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.Contains(formatting.HashedScriptFileName, script);
            Assert.Contains(editor.HashedScriptFileName, script);
            Assert.DoesNotContain("function formatCompile", script);
            Assert.DoesNotContain("formatConditionBuilder", script);
            Assert.True(formatting.IsShippedWith(runtime) && editor.IsShippedWith(runtime));
        }
        Assert.False(formatting.IsShippedWith(CanopyRuntime.TreeGrid));
        Assert.Contains("function formatCompile", formatting.Script);
        Assert.Contains("formatConditionBuilder", editor.Script);
        foreach (var part in new[] { formatting, editor }) {
            Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("</style", part.Style!, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain('\r', part.Script);
        }
        // Each part has its own budget; the evaluation and painting part loads with a formatted grid, the editor on first use.
        var formattingSize = Gzip(formatting.Script) + Gzip(formatting.Style!);
        var editorSize = Gzip(editor.Script) + Gzip(editor.Style!);
        Assert.True(formattingSize <= 12 * 1024, "The formatting part is " + formattingSize + " bytes gzip; the guard is 12 KiB.");
        Assert.True(editorSize <= 11 * 1024, "The rule editor part is " + editorSize + " bytes gzip; the guard is 11 KiB.");
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain)]
    [InlineData(CanopyAssetNaming.ContentHash)]
    public void GridAssetWriters_WriteBothPartsBesideTheRuntime(CanopyAssetNaming naming) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-formatting-part-" + Guid.NewGuid().ToString("N"));
        try {
            CanopyHtmlAssets.WriteTo(directory, naming, CanopyRuntime.DataGrid);
            foreach (var part in new[] { CanopyHtmlAssets.GetPart("formatting"), CanopyHtmlAssets.GetPart("format-editor") }) {
                Assert.Equal(part.Script, File.ReadAllText(Path.Combine(directory, part.GetScriptFileName(naming))));
                Assert.Equal(part.Style, File.ReadAllText(Path.Combine(directory, part.GetStyleFileName(naming)!)));
            }
        } finally { Directory.Delete(directory, true); }
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
