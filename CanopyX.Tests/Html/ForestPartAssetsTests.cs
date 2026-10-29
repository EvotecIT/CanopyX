using System.IO.Compression;
using System.Text;
using CanopyX.Html;
using PlaybackFixtures = CanopyX.Tests.Playback.TimeSliderFixtures;

namespace CanopyX.Tests.Html;

public sealed class ForestPartAssetsTests {
    [Theory]
    [InlineData("path")]
    [InlineData("stack")]
    [InlineData("time-slider")]
    public void ForestPart_IsVersionedInlineSafeOptionalAndWithin8KiBGzip(string name) {
        var part = CanopyHtmlAssets.GetPart(name);
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.NotEmpty(part.Script); Assert.NotNull(part.Style); Assert.NotEmpty(part.Style!);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("</script", part.Style!, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }, part.Runtimes);
        var size = Gzip(part.Script) + Gzip(part.Style!);
        Assert.True(size <= 8 * 1024, name + " uses " + size + " bytes gzip; its combined script/style budget is 8 KiB.");
        var plain = Grid();
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(plain), required => required.Name == name);
        AssertPayload(plain.ToHtmlFragment(), name, false);
    }

    [Theory]
    [InlineData("path", false)]
    [InlineData("path", true)]
    [InlineData("stack", false)]
    [InlineData("stack", true)]
    public void ForestGrid_CarriesItsOwnPartAndTheSharedRecordPanelWithDefaultOrCustomFields(string presentation, bool recordPanel) {
        var view = Grid();
        if (recordPanel) view.Record = new CanopyRecordPanel();
        if (presentation == "path") {
            view.Path = new CanopyPath();
            var chain = new CanopyPathChain("review", "Review path");
            chain.Hops.Add(new CanopyPathHop("r"));
            view.Path.Chains.Add(chain);
        } else {
            view.Stack = new CanopyStack();
            view.Stack.Layers.Add(new CanopyStackLayer("effective", "r", "Selected by the host") { Winner = true });
        }
        var names = CanopyHtmlAssets.GetRequiredParts(view).Select(part => part.Name).ToArray();
        Assert.Contains(presentation, names);
        Assert.Contains("record-panel", names);
        Assert.DoesNotContain(presentation == "path" ? "stack" : "path", names);
        Assert.DoesNotContain("time-slider", names);
        foreach (var html in new[] { view.ToHtmlFragment(), view.ToHtmlPage() }) {
            AssertPayload(html, presentation, true);
            AssertPayload(html, "record-panel", true);
            AssertPayload(html, presentation == "path" ? "stack" : "path", false);
            AssertPayload(html, "time-slider", false);
        }
    }

    [Theory]
    [InlineData("matrix", false)]
    [InlineData("matrix", true)]
    [InlineData("propagation", false)]
    [InlineData("propagation", true)]
    public void PlaybackPart_IsDiscoveredAndEmbeddedOnlyForViewsWithHistory(string owner, bool history) {
        string[] names;
        string fragment, page, basePart;
        if (owner == "matrix") {
            var matrix = history ? PlaybackFixtures.MatrixSlider() : PlaybackFixtures.MakeMatrix();
            names = CanopyHtmlAssets.GetRequiredParts(matrix).Select(part => part.Name).ToArray();
            fragment = matrix.ToHtmlFragment(); page = matrix.ToHtmlPage(); basePart = "matrix";
        } else {
            var propagation = history ? PlaybackFixtures.PropagationSlider() : PlaybackFixtures.Propagation();
            names = CanopyHtmlAssets.GetRequiredParts(propagation).Select(part => part.Name).ToArray();
            fragment = propagation.ToHtmlFragment(); page = propagation.ToHtmlPage(); basePart = "changes";
        }
        Assert.Contains(basePart, names);
        Assert.Equal(history, names.Contains("time-slider"));
        Assert.DoesNotContain("path", names); Assert.DoesNotContain("stack", names);
        foreach (var html in new[] { fragment, page }) {
            AssertPayload(html, basePart, true);
            AssertPayload(html, "time-slider", history);
            AssertPayload(html, "path", false); AssertPayload(html, "stack", false);
        }
    }

    private static void AssertPayload(string html, string name, bool present) {
        var part = CanopyHtmlAssets.GetPart(name);
        var script = "type=\"application/x-canopyx-" + name + "\" data-cx-version=\"" + part.Version + "\"";
        var style = "type=\"application/x-canopyx-" + name + "-style\" data-cx-version=\"" + part.Version + "\"";
        if (present) {
            Assert.Contains(script, html);
            if (part.Style != null) Assert.Contains(style, html);
        } else {
            Assert.DoesNotContain("type=\"application/x-canopyx-" + name + "\"", html);
            Assert.DoesNotContain("type=\"application/x-canopyx-" + name + "-style\"", html);
        }
    }

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("forest-assets", "Configuration explanation");
        view.Columns.Add(new CanopyColumn("title", "Configuration") { RowHeader = true });
        view.Rows.Add(new CanopyGridRow("r") { Cells = { ["title"] = "Session configuration" } });
        return view;
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) {
            var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length);
        }
        return output.Length;
    }
}
