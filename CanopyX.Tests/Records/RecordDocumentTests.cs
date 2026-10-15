using System.Text.Json.Nodes;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Records;

/// <summary>The gridRecordQuery and gridRecord exchange and the record packs a sidecar source loads from beside its page.</summary>
public sealed class RecordDocumentTests {
    [Fact]
    public void RecordQuery_WritesTheRequestTheBrowserSends() {
        Assert.Equal("{\"protocol\":\"canopyx/2\",\"type\":\"gridRecordQuery\",\"view\":\"certs\",\"id\":\"c1\"}", new CanopyGridRecordQuery("certs", "c1").ToJson());
        var page = new CanopyGridRecordQuery("certs", "c1") { Revision = "r7", Field = "contacts", Offset = 25, Limit = 25, Row = true }.ToJson();
        Assert.Equal("{\"protocol\":\"canopyx/2\",\"type\":\"gridRecordQuery\",\"view\":\"certs\",\"id\":\"c1\",\"revision\":\"r7\",\"field\":\"contacts\",\"offset\":25,\"limit\":25,\"row\":true}", page);
        ProtocolSchema.AssertValid(page, "a field page request");
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridRecordQuery("certs", "c1") { Limit = 0 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridRecordQuery("certs", "c1") { Offset = -1 });
    }

    [Fact]
    public void Record_WritesFieldsCellsAndRow_CheckedAgainstTheGrid() {
        var view = RecordPanelContractTests.Grid();
        var answer = new CanopyGridRecord("c1") { Revision = "r7", Row = RecordPanelContractTests.Row("c1") };
        answer.Fields["thumbprint"] = "AB12";
        answer.Cells["names"] = CanopyCell.List("one", "two", "three");
        var json = answer.ToJson(view);
        ProtocolSchema.AssertValid(json, "a gridRecord answer");
        var doc = JsonNode.Parse(json)!;
        Assert.Equal("gridRecord", doc["type"]!.GetValue<string>());
        Assert.Equal(3, doc["cells"]!["names"]!["items"]!.AsArray().Count);
        Assert.Equal("c1", doc["row"]!["id"]!.GetValue<string>());
        answer.Fields["nope"] = "x";
        Assert.Throws<InvalidOperationException>(() => answer.ToJson(view));
        answer.Fields.Remove("nope"); answer.Cells["nope"] = "x";
        Assert.Throws<InvalidOperationException>(() => answer.ToJson(view));
        answer.Cells.Remove("nope"); answer.Row = RecordPanelContractTests.Row("c2");
        Assert.Throws<InvalidOperationException>(() => answer.ToJson(view));
    }

    [Theory]
    [InlineData("c1", 16, 9)]
    [InlineData("cert-0007", 16, 11)]
    [InlineData("é😀", 7, 0)]
    public void Shard_IsFnv1aOfUtf16CodeUnits(string id, int shards, int expected) {
        // The browser computes the same: Math.imul(hash ^ code unit, 16777619) from 2166136261, unsigned, modulo the shards.
        Assert.Equal(expected, CanopyRecordSidecar.Shard(id, shards));
    }

    [Fact]
    public void Sidecar_StreamsEveryRecordIntoItsPack_AsScriptsThatRegisterGridRecordPacks() {
        var folder = Path.Combine(Path.GetTempPath(), "canopyx-records-" + Guid.NewGuid().ToString("N"));
        try {
            var view = RecordPanelContractTests.Grid();
            view.Record!.Source = CanopyRecordSource.Sidecar("data/records/", 4);
            var written = CanopyRecordSidecar.Write(folder, view, Enumerable.Range(0, 40).Select(index => {
                var record = new CanopyGridRecord("c" + index);
                record.Fields["thumbprint"] = "</script><b>" + index;
                return record;
            }));
            Assert.Equal(4, written.Count);
            Assert.All(written, file => Assert.StartsWith("data/records/r", file));
            var seen = 0;
            foreach (var file in written) {
                var text = File.ReadAllText(Path.Combine(folder, file));
                Assert.DoesNotContain("</script>", text);
                const string Start = "(self.CanopyXSidecar = self.CanopyXSidecar || []).push([\"certs\",\"";
                Assert.StartsWith(Start, text);
                Assert.EndsWith("]);\n", text);
                var entry = JsonNode.Parse(text.Substring("(self.CanopyXSidecar = self.CanopyXSidecar || []).push(".Length, text.Length - "(self.CanopyXSidecar = self.CanopyXSidecar || []).push(".Length - 3))!.AsArray();
                var shard = int.Parse(file.Substring("data/records/r".Length, file.Length - "data/records/r".Length - 3), System.Globalization.CultureInfo.InvariantCulture);
                Assert.Equal("r" + shard, entry[1]!.GetValue<string>());
                ProtocolSchema.AssertValid(entry[2]!.ToJsonString(), "a record pack");
                foreach (var record in entry[2]!["records"]!.AsArray()) {
                    Assert.Equal(shard, CanopyRecordSidecar.Shard(record!["id"]!.GetValue<string>(), 4));
                    seen++;
                }
            }
            Assert.Equal(40, seen);
            Assert.Throws<InvalidOperationException>(() => CanopyRecordSidecar.Write(folder, view, new[] { new CanopyGridRecord("a"), new CanopyGridRecord("a") }));
            var proto = new CanopyGridRecord("p"); proto.Cells["__proto__"] = "x";
            Assert.Throws<InvalidOperationException>(() => CanopyRecordSidecar.Write(folder, view, new[] { proto }));
            view.Record.Source = CanopyRecordSource.Inline();
            Assert.Throws<InvalidOperationException>(() => CanopyRecordSidecar.Write(folder, view, Array.Empty<CanopyGridRecord>()));
        } finally {
            if (Directory.Exists(folder)) Directory.Delete(folder, true);
        }
    }

    [Fact]
    public void Sidecar_WritesTreeRecordsWithoutRows() {
        var folder = Path.Combine(Path.GetTempPath(), "canopyx-tree-records-" + Guid.NewGuid().ToString("N"));
        try {
            var tree = new CanopyTreeView("tree", "Tree") { Record = new CanopyRecordPanel { Source = CanopyRecordSource.Sidecar("records/", 2) } };
            tree.Columns.Add(new CanopyColumn("name", "Name"));
            tree.Record.Fields.Add(new CanopyColumn("owner", "Owner"));
            var record = new CanopyGridRecord("a"); record.Fields["owner"] = "Team";
            Assert.Single(CanopyRecordSidecar.Write(folder, tree, new[] { record }));
            record.Row = new CanopyGridRow("a");
            Assert.Throws<InvalidOperationException>(() => CanopyRecordSidecar.Write(folder, tree, new[] { record }));
            Assert.Throws<InvalidOperationException>(() => new CanopyGridRecord("a") { Row = new CanopyGridRow("a") }.ToJson(tree));
            ProtocolSchema.AssertValid(new CanopyGridRecord("a").ToJson(tree), "a tree record answer");
        } finally {
            if (Directory.Exists(folder)) Directory.Delete(folder, true);
        }
    }
}
