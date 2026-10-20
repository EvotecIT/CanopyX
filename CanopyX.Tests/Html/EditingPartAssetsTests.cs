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
        Assert.Equal(new[] { "filter-editor", "forms" }, part.Requires);
        Assert.NotNull(part.Style);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        var size = Gzip(part.Script) + Gzip(part.Style!);
        // Flow wave F1 moved the typed editors to the forms part (its own guard): 16,740 bytes plus about 15%, rounded to KiB.
        Assert.True(size <= 19 * 1024, "The editing part is " + size + " bytes gzip; the guard is 19 KiB.");
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
        // The typed editors and the lookup combobox moved to the forms part, which grid editing and flows share.
        Assert.DoesNotContain("const EDIT_EDITORS", CanopyHtmlAssets.GetPart("editing").Script);
        Assert.DoesNotContain("function editLookupEditor(", CanopyHtmlAssets.GetPart("editing").Script);
        Assert.Contains("const EDIT_EDITORS", CanopyHtmlAssets.GetPart("forms").Script);
        Assert.Contains("function editLookupEditor(", CanopyHtmlAssets.GetPart("forms").Script);
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
        Assert.Contains("application/x-canopyx-forms\" data-cx-version=\"" + CanopyHtmlAssets.GetPart("forms").Version, fragment);
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
