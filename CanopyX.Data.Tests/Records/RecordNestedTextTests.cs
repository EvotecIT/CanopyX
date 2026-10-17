using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Record text bounds include nested row/node fields and supported detail cells without modifying trusted markup.</summary>
public sealed class RecordNestedTextTests {
    private const string Long = "abcdefghijklmnopqrstuvwxyz0123456789";
    private const string Clipped = "abcdefghijklmno…";

    [Theory]
    [InlineData("row", "properties")]
    [InlineData("node", "properties")]
    [InlineData("row", "table")]
    [InlineData("node", "table")]
    [InlineData("row", "grid")]
    [InlineData("node", "grid")]
    [InlineData("row", "tree")]
    [InlineData("node", "tree")]
    public async Task NestedDetails_ClipDisplayTextAndCellsAtTheSameStructureDepth(string owner, string kind) {
        var handler = Handler(request => {
            var record = new CanopyGridRecord(request.Id);
            var list = new CanopyRecordList();
            list.Columns.Add(new CanopyColumn("name", "Name"));
            if (owner == "row") {
                list.Total = 1;
                list.Rows.Add(new CanopyGridRow("child") { Cells = { ["name"] = "child" }, Detail = Detail(kind) });
                record.Fields["parts"] = CanopyCell.Collection(list);
            } else {
                list.Roots.Add(new CanopyNode("child", "child") { Detail = Detail(kind) });
                record.Fields["notes"] = CanopyCell.Object(new[] { new CanopyCellField("tree", CanopyCell.Collection(list)) });
            }
            return record;
        });
        using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
        var fields = document.RootElement.GetProperty("fields");
        var list = owner == "row" ? fields.GetProperty("parts").GetProperty("records")
            : fields.GetProperty("notes").GetProperty("fields")[0].GetProperty("value").GetProperty("records");
        var detail = list.GetProperty(owner == "row" ? "rows" : "roots")[0].GetProperty("detail");
        switch (kind) {
            case "properties":
                Assert.Equal(Clipped, detail.GetProperty("items")[0].GetProperty("name").GetString());
                Assert.Equal(Clipped, detail.GetProperty("items")[0].GetProperty("value").GetProperty("value").GetString());
                Assert.Equal(Clipped, detail.GetProperty("items")[0].GetProperty("value").GetProperty("title").GetString());
                break;
            case "table":
                Assert.Equal(Clipped, detail.GetProperty("caption").GetString());
                Assert.Equal(Clipped, detail.GetProperty("columns")[0].GetString());
                Assert.Equal(Clipped, detail.GetProperty("rows")[0][0].GetString());
                break;
            case "grid":
                var row = detail.GetProperty("rows")[0];
                Assert.Equal(Clipped, row.GetProperty("cells").GetProperty("name").GetString());
                Assert.Equal(Clipped, row.GetProperty("fields").GetProperty("note").GetString());
                Assert.Equal(Clipped, row.GetProperty("detail").GetProperty("items")[0].GetProperty("value").GetProperty("value").GetString());
                break;
            case "tree":
                var node = detail.GetProperty("roots")[0];
                Assert.Equal(Clipped, node.GetProperty("label").GetString());
                Assert.Equal(Clipped, node.GetProperty("fields").GetProperty("note").GetString());
                Assert.Equal(Clipped, node.GetProperty("detail").GetProperty("items")[0].GetProperty("value").GetProperty("value").GetString());
                break;
        }
    }

    [Fact]
    public async Task TreeCollectionFields_AreClippedLikeTheirRowSiblings() {
        var handler = Handler(request => {
            var list = new CanopyRecordList { Columns = { new CanopyColumn("name", "Name") }, Roots = { new CanopyNode("child", "child") { Fields = { ["note"] = Long } } } };
            return new CanopyGridRecord(request.Id) { Fields = { ["notes"] = CanopyCell.Object(new[] { new CanopyCellField("tree", CanopyCell.Collection(list)) }) } };
        });
        using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
        var node = document.RootElement.GetProperty("fields").GetProperty("notes").GetProperty("fields")[0].GetProperty("value").GetProperty("records").GetProperty("roots")[0];
        Assert.Equal(Clipped, node.GetProperty("fields").GetProperty("note").GetString());
    }

    [Theory]
    [InlineData("row", "properties", CanopyCell.MaxStructureDepth, false)]
    [InlineData("node", "properties", CanopyCell.MaxStructureDepth, false)]
    [InlineData("row", "table", CanopyCell.MaxStructureDepth, false)]
    [InlineData("node", "table", CanopyCell.MaxStructureDepth, false)]
    [InlineData("row", "properties", CanopyCell.MaxStructureDepth + 1, true)]
    [InlineData("node", "properties", CanopyCell.MaxStructureDepth + 1, true)]
    [InlineData("row", "table", CanopyCell.MaxStructureDepth + 1, true)]
    [InlineData("node", "table", CanopyCell.MaxStructureDepth + 1, true)]
    public async Task NestedDetailClipping_UsesTheCanonicalStructureDepthBoundary(string owner, string kind, int depth, bool rejected) {
        var handler = Handler(request => {
            var list = new CanopyRecordList { Columns = { new CanopyColumn("name", "Name") } };
            if (owner == "row") list.Rows.Add(new CanopyGridRow("child") { Detail = Detail(kind) });
            else list.Roots.Add(new CanopyNode("child", "child") { Detail = Detail(kind) });
            var cell = CanopyCell.Collection(list);
            for (var i = 1; i < depth; i++) cell = CanopyCell.Object(new[] { new CanopyCellField("nested", cell) });
            return new CanopyGridRecord(request.Id) { Fields = { ["notes"] = cell } };
        });
        if (rejected) await Assert.ThrowsAsync<InvalidOperationException>(() => handler.RecordAsync(Assets.Query("1")));
        else {
            using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
            var cell = document.RootElement.GetProperty("fields").GetProperty("notes");
            for (var i = 1; i < depth; i++) cell = cell.GetProperty("fields")[0].GetProperty("value");
            var detail = cell.GetProperty("records").GetProperty(owner == "row" ? "rows" : "roots")[0].GetProperty("detail");
            var value = kind == "properties" ? detail.GetProperty("items")[0].GetProperty("value").GetProperty("value") : detail.GetProperty("rows")[0][0];
            Assert.Equal(Clipped, value.GetString());
        }
    }

    [Fact]
    public async Task TableDetail_ReadOnlyRowsAreClippedByReplacingOnlyTheAffectedRow() {
        var input = Array.AsReadOnly(new CanopyCell[] { Long });
        var table = new CanopyTableDetail().AddColumns("value");
        table.Rows.Add(input);
        var handler = Handler(request => new CanopyGridRecord(request.Id) { Fields = { ["parts"] = CanopyCell.Collection(new CanopyRecordList {
            Total = 1, Columns = { new CanopyColumn("name", "Name") }, Rows = { new CanopyGridRow("child") { Detail = table } }
        }) } });
        using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
        Assert.Equal(Clipped, document.RootElement.GetProperty("fields").GetProperty("parts").GetProperty("records").GetProperty("rows")[0].GetProperty("detail").GetProperty("rows")[0][0].GetString());
        Assert.Equal(Long, input[0].Value);
        Assert.NotSame(input, table.Rows[0]);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TrustedHtmlDetail_IsKeptWholeAndRemainsBoundedByRecordBytes(bool oversized) {
        var html = "<p data-purpose=\"trusted\">" + (oversized ? new string('x', 2000) : Long) + "</p>";
        var handler = Handler(request => new CanopyGridRecord(request.Id) { Fields = { ["parts"] = CanopyCell.Collection(new CanopyRecordList {
            Total = 1, Columns = { new CanopyColumn("name", "Name") }, Rows = { new CanopyGridRow("child") { Detail = new CanopyHtmlDetail(html) } }
        }) } }, 1024);
        if (oversized) {
            var error = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RecordAsync(Assets.Query("1")));
            Assert.Equal(CanopyRequestError.LimitExceeded, error.Error);
        } else {
            using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
            Assert.Equal(html, document.RootElement.GetProperty("fields").GetProperty("parts").GetProperty("records").GetProperty("rows")[0].GetProperty("detail").GetProperty("html").GetString());
        }
    }

    private static CanopyDetail Detail(string kind) => kind switch {
        "properties" => new CanopyPropertiesDetail().Add(Long, new CanopyCell(Long) { Title = Long }),
        "table" => new CanopyTableDetail(Long).AddColumns(Long).AddRow(Long),
        "grid" => new CanopyGridRowsDetail { Rows = { new CanopyGridRow("nested") { Cells = { ["name"] = Long }, Fields = { ["note"] = Long }, Detail = Detail("properties") } } },
        _ => new CanopyTreeDetail { Roots = { new CanopyNode("nested", Long) { Fields = { ["note"] = Long }, Detail = Detail("properties") } } }
    };

    private static CanopyRemoteHandler Handler(Func<CanopyRecordRequest, CanopyGridRecord> answer, int? bytes = null) {
        var map = Assets.Records(Assets.Columns(Assets.View()));
        var options = new CanopyRemoteOptions();
        options.Limits.MaxRecordTextLength = 16;
        if (bytes.HasValue) options.Limits.MaxRecordBytes = bytes.Value;
        return Assets.Handler(map, new Custom(map.Schema, answer), options);
    }

    private sealed class Custom : ICanopyRecordProvider {
        private readonly Func<CanopyRecordRequest, CanopyGridRecord> _answer;
        internal Custom(CanopyRecordSchema schema, Func<CanopyRecordRequest, CanopyGridRecord> answer) { Schema = schema; _answer = answer; }
        public CanopyRecordSchema Schema { get; }
        public ValueTask<CanopyGridRecord?> GetRecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken) => new(_answer(request));
    }
}
