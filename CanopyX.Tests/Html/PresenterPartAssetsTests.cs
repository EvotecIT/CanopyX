using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

public sealed class PresenterPartAssetsTests {
    [Fact]
    public void SelfContainedPagesCarryRecordOnlyPresentersAndWrapping() {
        var view = new CanopyDataGridView("record-only", "Record fields") { Record = new CanopyRecordPanel(), Columns = { new CanopyColumn("name", "Name") } };
        view.Record.Fields.Add(new CanopyColumn("identifier", "Identifier") { Presenter = CanopyGridPresenter.Identifier(mono: true) });
        view.Record.Fields.Add(new CanopyColumn("notes", "Notes") { Wrap = true, MaxLines = 2 });
        Assert.All(view.Columns, column => { Assert.Null(column.Presenter); Assert.False(column.Wrap); });
        Assert.Contains(CanopyHtmlAssets.GetPart("presenters"), CanopyHtmlAssets.GetRequiredParts(view));
        Assert.Contains("application/x-canopyx-presenters", view.ToHtmlPage());
    }
    [Fact]
    public void DeclarativePainterIsVersionedBoundedAndCarriedByWrappedViews() {
        var part = CanopyHtmlAssets.GetPart("presenters");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Contains("function gridRenderPresenter", part.Script);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.DoesNotContain("function gridRenderPresenter", script);
            Assert.Contains(part.HashedScriptFileName, script);
        }
        using var bytes = new MemoryStream();
        using (var gzip = new GZipStream(bytes, CompressionLevel.SmallestSize, true)) gzip.Write(Encoding.UTF8.GetBytes(part.Script));
        Assert.True(bytes.Length <= 4096, "Presenter part exceeds 4 KiB gzip.");
        var view = new CanopyDataGridView("wrapped", "Wrapped") { Columns = { new CanopyColumn("notes", "Notes") { Wrap = true } } };
        Assert.Contains(part, CanopyHtmlAssets.GetRequiredParts(view));
        Assert.Contains("application/x-canopyx-presenters", view.ToHtmlFragment());
    }
}
