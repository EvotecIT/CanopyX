using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Custom record answers retain parent identity and the collection metadata needed for paging.</summary>
public sealed class RecordProviderAnswerTests {
    [Fact]
    public async Task AnotherParentRowIdentity_IsRejectedBeforeTheHandlerReturnsAResponse() {
        var handler = Handler(request => new CanopyGridRecord(request.Id) {
            Row = new CanopyGridRow("another") { Cells = { ["name"] = "another-row-value" } }
        });
        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.RecordAsync(Assets.Query("1", ",\"row\":true")));
    }

    [Theory]
    [InlineData("whole", "scalar")]
    [InlineData("whole", "missing-total")]
    [InlineData("parent", "scalar")]
    [InlineData("parent", "missing-total")]
    [InlineData("page", "scalar")]
    [InlineData("page", "missing-total")]
    public async Task ReturnedCollectionFields_RequireAListAndItsTotal(string location, string shape) {
        var handler = Handler(request => {
            var record = new CanopyGridRecord(request.Id);
            var cell = shape == "scalar" ? new CanopyCell("not a collection") : Rows(1, null);
            if (location == "parent") record.Row = new CanopyGridRow(request.Id) { Fields = { ["parts"] = cell } };
            else record.Fields["parts"] = cell;
            return record;
        });
        var extra = location == "parent" ? ",\"row\":true" : location == "page" ? ",\"field\":\"parts\",\"limit\":2" : "";
        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.RecordAsync(Assets.Query("1", extra)));
    }

    [Theory]
    [InlineData("omitted")]
    [InlineData("null")]
    [InlineData("empty-list")]
    public async Task EmptyCollectionFields_KeepTheirSupportedEmptyRepresentations(string shape) {
        var handler = Handler(request => {
            var record = new CanopyGridRecord(request.Id);
            if (shape == "null") record.Fields["parts"] = null!;
            else if (shape == "empty-list") record.Fields["parts"] = Rows(0, 0);
            return record;
        });
        using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
        if (shape == "omitted") Assert.False(document.RootElement.TryGetProperty("fields", out _));
        else if (shape == "null") Assert.Equal(JsonValueKind.Null, document.RootElement.GetProperty("fields").GetProperty("parts").ValueKind);
        else {
            var list = document.RootElement.GetProperty("fields").GetProperty("parts").GetProperty("records");
            Assert.Equal(0, list.GetProperty("total").GetInt32());
            Assert.Empty(list.GetProperty("rows").EnumerateArray());
        }
    }

    [Fact]
    public async Task ValidCollectionMetadata_KeepsItsSummaryAndLoadMoreWindow() {
        var handler = Handler(request => {
            var cell = Rows(request.IsPage ? 2 : 1, 3, request.Offset);
            var record = new CanopyGridRecord(request.Id);
            record.Fields["parts"] = new CanopyCell("collection summary") { Records = cell.Records };
            return record;
        });
        using var whole = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
        var field = whole.RootElement.GetProperty("fields").GetProperty("parts");
        Assert.Equal("collection summary", field.GetProperty("value").GetString());
        Assert.Equal(3, field.GetProperty("records").GetProperty("total").GetInt32());
        Assert.Equal(2, field.GetProperty("records").GetProperty("pageSize").GetInt32());
        using var page = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1", ",\"field\":\"parts\",\"offset\":1,\"limit\":2")));
        var list = page.RootElement.GetProperty("fields").GetProperty("parts").GetProperty("records");
        Assert.Equal(3, list.GetProperty("total").GetInt32());
        Assert.Equal(2, list.GetProperty("rows").GetArrayLength());
        Assert.Equal(new[] { "part-1", "part-2" }, list.GetProperty("rows").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
    }

    private static CanopyCell Rows(int count, int? total, int offset = 0) {
        var list = new CanopyRecordList { Total = total, PageSize = 2, Columns = { new CanopyColumn("name", "Name") } };
        for (var i = 0; i < count; i++) list.Rows.Add(new CanopyGridRow("part-" + (offset + i)) { Cells = { ["name"] = "part" } });
        return CanopyCell.Collection(list);
    }

    [Theory]
    [InlineData("whole", null, 4, false)]
    [InlineData("parent", null, 4, false)]
    [InlineData("page", null, 4, false)]
    [InlineData("whole", 4, 4, true)]
    [InlineData("parent", 4, 4, true)]
    [InlineData("page", 4, 4, true)]
    [InlineData("whole", null, 50, true)]
    [InlineData("parent", null, 50, true)]
    [InlineData("page", null, 50, true)]
    public async Task CollectionPageSize_MustFitTheEndpointIncludingItsImplicitDefault(string location, int? pageSize, int maximum, bool accepted) {
        var options = new CanopyRemoteOptions();
        options.Limits.MaxRecordPageSize = maximum;
        var handler = Handler(request => {
            var cell = Rows(request.Offset == 0 ? 1 : 2, 3, request.Offset);
            cell.Records!.PageSize = pageSize;
            var record = new CanopyGridRecord(request.Id);
            if (location == "parent" && !request.IsPage) record.Row = new CanopyGridRow(request.Id) { Fields = { ["parts"] = cell } };
            else record.Fields["parts"] = cell;
            return record;
        }, options);
        var extra = location == "parent" ? ",\"row\":true" : location == "page" ? ",\"field\":\"parts\",\"limit\":4" : "";
        var query = Assets.Query("1", extra);
        if (!accepted) {
            // The browser's omitted-pageSize default would make its normal follow-up exceed this endpoint.
            var error = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RecordAsync(Assets.Query("1", ",\"field\":\"parts\",\"offset\":1,\"limit\":50")));
            Assert.Equal(CanopyRequestError.LimitExceeded, error.Error);
            await Assert.ThrowsAsync<InvalidOperationException>(() => handler.RecordAsync(query));
            return;
        }
        using var document = JsonDocument.Parse(await handler.RecordAsync(query));
        var fields = location == "parent" ? document.RootElement.GetProperty("row").GetProperty("fields") : document.RootElement.GetProperty("fields");
        var list = fields.GetProperty("parts").GetProperty("records");
        Assert.Equal(3, list.GetProperty("total").GetInt32());
        Assert.Single(list.GetProperty("rows").EnumerateArray());
        var limit = list.TryGetProperty("pageSize", out var size) ? size.GetInt32() : 50;
        using var page = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1", ",\"field\":\"parts\",\"offset\":1,\"limit\":" + limit)));
        Assert.Equal(new[] { "part-1", "part-2" }, page.RootElement.GetProperty("fields").GetProperty("parts").GetProperty("records").GetProperty("rows").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
    }

    private static CanopyRemoteHandler Handler(Func<CanopyRecordRequest, CanopyGridRecord> answer, CanopyRemoteOptions? options = null) {
        var records = Assets.Records(Assets.Columns(Assets.View()));
        return Assets.Handler(records, new Custom(records.Schema, answer), options);
    }

    private sealed class Custom : ICanopyRecordProvider {
        private readonly Func<CanopyRecordRequest, CanopyGridRecord> _answer;
        internal Custom(CanopyRecordSchema schema, Func<CanopyRecordRequest, CanopyGridRecord> answer) { Schema = schema; _answer = answer; }
        public CanopyRecordSchema Schema { get; }
        public ValueTask<CanopyGridRecord?> GetRecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken) => new(_answer(request));
    }
}
