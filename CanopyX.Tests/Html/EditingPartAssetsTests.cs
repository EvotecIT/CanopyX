using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>The editing part: its own size guard, its loading rules and what the grid entry points keep of it.</summary>
public sealed class EditingPartAssetsTests {
    [Fact]
    public void EditingPart_IsVersionedInlineSafeAndBounded() {
        var part = CanopyHtmlAssets.GetPart("editing");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }, part.Runtimes);
        Assert.Equal(new[] { "filter-editor" }, part.Requires);
        Assert.NotNull(part.Style);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        var size = Gzip(part.Script) + Gzip(part.Style!);
        // Combined roadmap integration: its size plus about 15%.
        Assert.True(size <= 20480, "The editing part is " + size + " bytes gzip; the guard is 20 KiB.");
    }

    [Fact]
    public void GridEntryPoints_KeepOnlyTheHooks() {
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.Contains("\"editing\",\"editing\"", script);
            Assert.DoesNotContain("function editSpec(", script);
            Assert.DoesNotContain("const EDIT_EDITORS", script);
        }
        Assert.Contains("function editSpec(", CanopyHtmlAssets.GetPart("editing").Script);
        // Tree entry points know nothing of flat-grid editing.
        Assert.DoesNotContain("\"editing\":[", CanopyHtmlAssets.GetScript(CanopyRuntime.InteractiveTreeGrid));
    }

    [Fact]
    public void SingleFilePages_CarryThePartOnlyForEditableGrids() {
        var grid = new CanopyDataGridView("grid", "Grid");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain("application/x-canopyx-editing", grid.ToHtmlFragment());
        grid.Columns[0].Editable = true;
        var fragment = grid.ToHtmlFragment();
        Assert.Contains("application/x-canopyx-editing\" data-cx-version=\"" + CanopyHtmlAssets.GetPart("editing").Version, fragment);
        Assert.Contains("application/x-canopyx-editing-style", fragment);
        Assert.Contains("application/x-canopyx-filter-editor", fragment);
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
