using System.IO;
using System.IO.Compression;
using System.Text;
using CanopyX.Html;
using Xunit;

namespace CanopyX.Tests.NetFramework.Grids;

/// <summary>Compact row data, its gzip chunks and grid bundles are written the same way by the .NET Framework build.</summary>
public sealed class RowDataTests {
    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("inventory", "Inventory");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        for (var i = 2; i >= 0; i--) {
            var row = new CanopyGridRow("r" + i);
            row.Cells["name"] = "Item " + i;
            view.Rows.Add(row);
        }

        return view;
    }

    [Fact]
    public void GzipChunks_InflateToTheCompactRowsInIdentityOrder() {
        var data = new CanopyGridRowData(Grid(), new CanopyRowDataOptions { Format = CanopyRowFormat.CompactGzip });
        using var input = new GZipStream(new MemoryStream(Convert.FromBase64String(data.GetChunk(0))), CompressionMode.Decompress);
        using var reader = new StreamReader(input, Encoding.UTF8);
        Assert.Equal("[[\"r0\",\"Item 0\"],[\"r1\",\"Item 1\"],[\"r2\",\"Item 2\"]]", reader.ReadToEnd());
        Assert.Contains("\"rowData\":{\"columns\":[\"name\"],\"count\":3,\"ordered\":true,\"encoding\":\"gzip\",\"chunks\":1}", data.ToJson());
    }

    [Fact]
    public void SaveHtmlBundle_WritesThePageAndTheRowFiles() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-net472-bundle-" + Guid.NewGuid().ToString("N"));
        try {
            var result = Grid().SaveHtmlBundle(directory);
            Assert.Equal(1, result.FileCount);
            Assert.True(File.Exists(Path.Combine(directory, "index.html")));
            Assert.True(File.Exists(Path.Combine(result.DataDirectory, "rows", "0.js")));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, true);
        }
    }
}
