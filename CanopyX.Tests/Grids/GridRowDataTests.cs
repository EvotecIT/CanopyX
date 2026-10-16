using System.IO.Compression;
using System.Text;
using System.Text.Json;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>
/// Compact row data carries an inline grid's rows as arrays in column order, in chunks the browser decodes one at a time,
/// written in ordinal identity order so the first rows can show before the last chunk is decoded.
/// </summary>
public sealed class GridRowDataTests {
    private static CanopyDataGridView Grid(int rows = 3) {
        var view = new CanopyDataGridView("inventory", "Inventory");
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("notes", "Notes"));
        for (var i = rows - 1; i >= 0; i--) {
            var row = new CanopyGridRow("r" + i.ToString("D4", System.Globalization.CultureInfo.InvariantCulture));
            row.Cells["name"] = "Item " + i;
            row.Cells["size"] = i * 10;
            if (i % 2 == 0) row.Cells["notes"] = "even";
            view.Rows.Add(row);
        }

        return view;
    }

    private static JsonElement Chunk(CanopyGridRowData data, int index) => JsonDocument.Parse(data.GetChunk(index)).RootElement;

    [Fact]
    public void GetChunk_WritesArraysInColumnOrder_InIdentityOrder_WithoutTrailingEmptyCells() {
        var view = Grid();
        view.Rows[0].Tone = CanopyTone.Warning;
        view.Rows[0].ClassName = "flagged";
        view.Rows[1].Cells["size"] = new CanopyCell { Text = "unknown", Tone = CanopyTone.Muted };

        var data = new CanopyGridRowData(view);
        var rows = Chunk(data, 0);

        Assert.Equal(new[] { "name", "size", "notes" }, data.Columns);
        Assert.Equal(1, data.ChunkCount);
        Assert.Equal(3, rows.GetArrayLength());
        Assert.Equal("[\"r0000\",\"Item 0\",0,\"even\"]", rows[0].GetRawText());
        // r0001 has no notes: the trailing empty cell is left out. Its size is a cell object with text and a tone.
        Assert.Equal("[\"r0001\",\"Item 1\",{\"text\":\"unknown\",\"tone\":\"muted\"}]", rows[1].GetRawText());
        // The row with a tone and a class names them next to its id.
        Assert.Equal("{\"id\":\"r0002\",\"tone\":\"warning\",\"className\":\"flagged\"}", rows[2][0].GetRawText());
    }

    [Fact]
    public void Constructor_RowWithRecordFields_ThrowsBecauseCompactRowsHaveNoPlaceForThem() {
        var view = Grid();
        view.Record = new CanopyRecordPanel();
        view.Record.Fields.Add(new CanopyColumn("serial", "Serial number"));
        view.Rows[1].Fields["serial"] = "SN-1";

        var error = Assert.Throws<InvalidOperationException>(() => new CanopyGridRowData(view));
        Assert.Contains("'r0001'", error.Message);
    }

    [Fact]
    public void ToJson_WritesTheDescriptorInPlaceOfRows_AndMatchesTheSchema() {
        var data = new CanopyGridRowData(Grid(250), new CanopyRowDataOptions { ChunkSize = 100 });
        var json = data.ToJson();

        ProtocolSchema.AssertValid(json, "grid with compact row data");
        using var document = JsonDocument.Parse(json);
        Assert.False(document.RootElement.TryGetProperty("rows", out _));
        var rowData = document.RootElement.GetProperty("rowData");
        Assert.Equal("{\"columns\":[\"name\",\"size\",\"notes\"],\"count\":250,\"ordered\":true,\"chunks\":3}", rowData.GetRawText());
        Assert.Equal(100, Chunk(data, 1).GetArrayLength());
        Assert.Equal(50, Chunk(data, 2).GetArrayLength());
        Assert.Equal("r0100", Chunk(data, 1)[0][0].GetString());

        var sidecar = JsonDocument.Parse(data.ToJson("data/inventory/")).RootElement.GetProperty("rowData");
        Assert.Equal("data/inventory/", sidecar.GetProperty("base").GetString());
        ProtocolSchema.AssertValid(data.ToJson("data/inventory/"), "grid with sidecar row data");
        // The ordinary document keeps its rows.
        Assert.True(JsonDocument.Parse(data.View.ToJson()).RootElement.TryGetProperty("rows", out _));
    }

    [Fact]
    public void Schema_RejectsRowsBesideRowData_AndRowDataOnHostGrids() {
        var json = new CanopyGridRowData(Grid()).ToJson();
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, node => node["rows"] = new System.Text.Json.Nodes.JsonArray())).IsValid);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, node => node["source"]!["kind"] = "host")).IsValid);
        // rowData has no version of its own (canopyx/2 is the only version): a version member is an unknown one.
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, node => node["rowData"]!["version"] = 1)).IsValid);
    }

    [Fact]
    public void GzipChunks_AreBase64OfTheCompressedJson() {
        var view = Grid(120);
        var plain = new CanopyGridRowData(view, new CanopyRowDataOptions { ChunkSize = 100 });
        var packed = new CanopyGridRowData(view, new CanopyRowDataOptions { ChunkSize = 100, Format = CanopyRowFormat.CompactGzip });

        using (var input = new GZipStream(new MemoryStream(Convert.FromBase64String(packed.GetChunk(1))), CompressionMode.Decompress))
        using (var reader = new StreamReader(input, Encoding.UTF8)) Assert.Equal(plain.GetChunk(1), reader.ReadToEnd());
        Assert.Equal("gzip", JsonDocument.Parse(packed.ToJson()).RootElement.GetProperty("rowData").GetProperty("encoding").GetString());
        ProtocolSchema.AssertValid(packed.ToJson(), "grid with compressed row data");
    }

    [Fact]
    public void Chunks_AreSafeInsideScriptsAndTemplates() {
        var view = Grid(1);
        view.Rows[0].Cells["notes"] = "</script> `${x}` & <b>";
        var chunk = new CanopyGridRowData(view).GetChunk(0);

        Assert.DoesNotContain("<", chunk);
        Assert.DoesNotContain("`", chunk);
        Assert.DoesNotContain("${", chunk);
        Assert.Equal("</script> `${x}` & <b>", JsonDocument.Parse(chunk).RootElement[0][3].GetString());
    }

    [Fact]
    public void Options_AndSources_AreChecked() {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRowDataOptions { ChunkSize = 99 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRowDataOptions { ChunkSize = 100001 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRowDataOptions { Format = (CanopyRowFormat)7 });
        var hosted = new CanopyDataGridView("hosted", "Hosted") { Source = CanopyGridSource.HostedOffset() };
        hosted.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Throws<InvalidOperationException>(() => new CanopyGridRowData(hosted));
        Assert.Throws<ArgumentNullException>(() => new CanopyGridRowData(null!));
        var data = new CanopyGridRowData(Grid());
        Assert.Throws<ArgumentOutOfRangeException>(() => data.GetChunk(1));
        var changed = Grid();
        var taken = new CanopyGridRowData(changed);
        changed.Columns.Add(new CanopyColumn("owner", "Owner"));
        Assert.Throws<InvalidOperationException>(() => taken.ToJson());
        var empty = new CanopyGridRowData(Grid(0));
        Assert.Equal(0, empty.ChunkCount);
        ProtocolSchema.AssertValid(empty.ToJson(), "grid with empty row data");
    }

    [Fact]
    public void WriteFiles_WritesOneSidecarScriptPerChunk() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-rowdata-" + Guid.NewGuid().ToString("N"));
        try {
            var data = new CanopyGridRowData(Grid(250), new CanopyRowDataOptions { ChunkSize = 100 });
            var result = data.WriteFiles(directory);

            Assert.Equal(data.DataFolder, result.Base);
            Assert.StartsWith("data/inventory-", result.Base);
            Assert.EndsWith("/", result.Base);
            Assert.Equal(3, result.FileCount);
            Assert.Equal(250, result.RowCount);
            var files = Directory.GetFiles(Path.Combine(result.DataDirectory, "rows")).Select(Path.GetFileName).OrderBy(name => name, StringComparer.Ordinal);
            Assert.Equal(new[] { "0.js", "1.js", "2.js" }, files);
            var text = File.ReadAllText(Path.Combine(result.DataDirectory, "rows", "1.js"));
            Assert.Equal("(self.CanopyXSidecar = self.CanopyXSidecar || []).push([\"inventory\",\"rows/1\",String.raw`" + data.GetChunk(1) + "`]);\n", text);
            Assert.Equal(result.TotalBytes, Directory.GetFiles(Path.Combine(result.DataDirectory, "rows")).Sum(file => new FileInfo(file).Length));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, true);
        }
    }
}
