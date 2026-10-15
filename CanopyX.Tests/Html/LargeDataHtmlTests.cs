using System.Text.Json;
using System.Text.RegularExpressions;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Html;

/// <summary>
/// Large pages: views that mount when they come into view, compact row data inside the grid's host element, and grid
/// bundles whose rows load from sidecar files.
/// </summary>
public sealed class LargeDataHtmlTests {
    private static CanopyDataGridView Grid(int rows) {
        var view = new CanopyDataGridView("inventory", "Inventory");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number });
        for (var i = 0; i < rows; i++) {
            var row = new CanopyGridRow("r" + i.ToString("D5", System.Globalization.CultureInfo.InvariantCulture));
            row.Cells["name"] = "Item " + i;
            row.Cells["size"] = i;
            view.Rows.Add(row);
        }

        return view;
    }

    private static string ConfigOf(string html) => Regex.Match(html, "<script type=\"application/json\" class=\"cx-config\">(.*?)</script>", RegexOptions.Singleline).Groups[1].Value;

    [Fact]
    public void MountWhenVisible_MarksTheFragment_UnlessTheHostMountsItItself() {
        var grid = Grid(1);
        Assert.Contains("data-canopyx-host data-cx-theme=\"auto\" data-cx-mount=\"visible\">", grid.ToHtmlFragment(new CanopyHtmlOptions { MountWhenVisible = true }));
        Assert.Contains("data-cx-mount=\"manual\"", grid.ToHtmlFragment(new CanopyHtmlOptions { MountWhenVisible = true, AutoMount = false }));
        Assert.DoesNotContain("data-cx-mount", grid.ToHtmlFragment());
        Assert.Contains("data-cx-mount=\"visible\"", grid.ToHtmlPage(new CanopyHtmlOptions { MountWhenVisible = true }));
        Assert.Contains("data-cx-mount=\"visible\"", SampleDocuments.FullView().ToHtmlPage(new CanopyHtmlOptions { MountWhenVisible = true }));
    }

    [Fact]
    public void RowData_WritesTheChunksInsideTheHost_AndCarriesTheDataPartOnce() {
        var grid = Grid(250);
        var options = new CanopyHtmlOptions { RowData = new CanopyRowDataOptions { ChunkSize = 100 }, Document = new CanopyHtmlDocument() };
        var html = grid.ToHtmlFragment(options);
        var data = new CanopyGridRowData(grid, options.RowData);

        Assert.Equal(data.ToJson(), ConfigOf(html));
        var host = html.Substring(0, html.IndexOf("</div>", StringComparison.Ordinal));
        Assert.Equal(3, Regex.Matches(host, "<script type=\"application/x-canopyx-rows\">").Count);
        Assert.Contains("<script type=\"application/x-canopyx-rows\">" + data.GetChunk(2) + "</script></div>", html);
        var part = CanopyHtmlAssets.GetPart("data");
        Assert.Contains(part.Markup, html);
        Assert.DoesNotContain(part.Markup, grid.ToHtmlFragment(options));
        // The ordinary fragment keeps its rows in the document and needs no data part.
        Assert.DoesNotContain(part.Markup, grid.ToHtmlFragment());
        // With external assets the rows stay in the fragment and the runtime loads the part from beside itself.
        var external = grid.ToHtmlFragment(new CanopyHtmlOptions { RowData = new CanopyRowDataOptions { ChunkSize = 100 }, AssetMode = CanopyAssetMode.External });
        Assert.Equal(3, Regex.Matches(external, "x-canopyx-rows").Count);
        Assert.DoesNotContain(part.Markup, external);
        // A page carries the same chunks.
        Assert.Contains(data.GetChunk(0), grid.ToHtmlPage(new CanopyHtmlOptions { RowData = new CanopyRowDataOptions { ChunkSize = 100 } }));
    }

    [Fact]
    public void DataPart_IsShippedWithTheGridEntryPoints_AndNeededByNoViewItself() {
        var part = CanopyHtmlAssets.GetPart("data");
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }, part.Runtimes);
        Assert.DoesNotContain(part, CanopyHtmlAssets.GetRequiredParts(Grid(1)));
        Assert.DoesNotContain(part, CanopyHtmlAssets.GetRequiredParts(SampleDocuments.FullView()));
        Assert.True(Gzip(part.Script) <= 4 * 1024, "The data part is " + Gzip(part.Script) + " bytes gzip; the guard is 4 KiB.");
    }

    [Fact]
    public void SaveHtmlBundle_WritesThePage_TheAssets_AndTheRowFiles() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-grid-bundle-" + Guid.NewGuid().ToString("N"));
        try {
            var grid = Grid(250);
            var result = grid.SaveHtmlBundle(directory, new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, RowData = new CanopyRowDataOptions { ChunkSize = 100 } });

            Assert.Equal(3, result.FileCount);
            var page = File.ReadAllText(Path.Combine(directory, "index.html"));
            var rowData = JsonDocument.Parse(ConfigOf(page)).RootElement.GetProperty("rowData");
            Assert.Equal(result.Base, rowData.GetProperty("base").GetString());
            Assert.Equal(3, rowData.GetProperty("chunks").GetInt32());
            Assert.DoesNotContain("x-canopyx-rows", page);
            Assert.Contains("assets/" + CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, CanopyRuntime.DataGrid), page);
            Assert.True(File.Exists(Path.Combine(directory, "assets", CanopyHtmlAssets.GetPart("data").HashedScriptFileName)));
            Assert.True(File.Exists(Path.Combine(result.DataDirectory, "rows", "2.js")));
            // The default options write external assets too.
            var second = Path.Combine(directory, "default");
            grid.SaveHtmlBundle(second);
            Assert.True(File.Exists(Path.Combine(second, "assets", CanopyHtmlAssets.GetPart("data").HashedScriptFileName)));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, true);
        }
    }

    [Fact]
    public void SaveHtmlBundle_RejectsHostedGrids() {
        var hosted = new CanopyDataGridView("hosted", "Hosted") { Source = CanopyGridSource.HostedOffset() };
        hosted.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Throws<InvalidOperationException>(() => hosted.SaveHtmlBundle(Path.Combine(Path.GetTempPath(), "canopyx-never-" + Guid.NewGuid().ToString("N"))));
        Assert.Throws<ArgumentException>(() => Grid(1).SaveHtmlBundle(""));
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new System.IO.Compression.GZipStream(output, System.IO.Compression.CompressionLevel.SmallestSize, true)) {
            var bytes = System.Text.Encoding.UTF8.GetBytes(value);
            gzip.Write(bytes, 0, bytes.Length);
        }

        return output.Length;
    }
}
