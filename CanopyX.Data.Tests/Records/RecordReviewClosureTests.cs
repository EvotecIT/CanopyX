using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Returned parent rows share the record field policy, and records retain their captured validation metadata.</summary>
public sealed class RecordReviewClosureTests {
    [Theory]
    [InlineData("reference")]
    [InlineData("linq")]
    [InlineData("custom")]
    public async Task ParentRowFields_CannotBypassTheRecordReadPolicy(string kind) {
        var columns = Assets.Columns(Assets.View()).DecorateRows(row => row.Fields["secret"] = "sensitive");
        var records = Assets.Records(columns);
        var data = new[] { new Asset { Id = 1, Name = "one", Site = "Main", Secret = "sensitive" } };
        ICanopyRecordProvider provider = kind switch {
            "reference" => new CanopyInMemoryRecordProvider<Asset>(records, () => data),
            "linq" => new CanopyQueryableRecordProvider<Asset>(data.AsQueryable(), records),
            _ => new Custom(records.Schema, request => new CanopyGridRecord(request.Id) {
                Row = new CanopyGridRow(request.Id) { Fields = { ["secret"] = "sensitive" } }
            })
        };
        var handler = Assets.Handler(records, provider);
        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.RecordAsync(Assets.Query("1", ",\"row\":true"), field => field != "secret"));
    }

    [Theory]
    [InlineData("unmapped")]
    [InlineData("rows")]
    [InlineData("events")]
    [InlineData("collection-value")]
    [InlineData("page-size")]
    public async Task ParentRowFields_UseTheSameAllowListAndShapeBoundsAsRecordFields(string violation) {
        var records = Assets.Records(Assets.Columns(Assets.View()));
        var options = new CanopyRemoteOptions();
        options.Limits.MaxRecordItems = 2;
        var handler = Assets.Handler(records, new Custom(records.Schema, request => {
            var record = new CanopyGridRecord(request.Id) { Row = new CanopyGridRow(request.Id) };
            var field = violation == "unmapped" ? "unknown" : violation == "events" ? "events" : violation == "collection-value" ? "notes" : "parts";
            record.Row.Fields[field] = violation == "events"
                ? CanopyCell.Timeline(Enumerable.Range(0, 3).Select(i => new CanopyRecordEvent(DateTime.UtcNow, "event " + i)))
                : violation == "unmapped" ? new CanopyCell("unknown") : Rows(violation == "rows" ? 11 : 2, violation == "total" ? 1 : 20, violation == "page-size" ? 201 : 10);
            return record;
        }), options);
        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.RecordAsync(Assets.Query("1", ",\"row\":true")));
    }

    [Fact]
    public async Task AllowedParentRowFields_KeepBaseRowCellAndTextSemantics() {
        const string longText = "abcdefghijklmnopqrstuvwxyz0123456789";
        var records = Assets.Records(Assets.Columns(Assets.View()));
        var options = new CanopyRemoteOptions();
        options.Limits.MaxRecordTextLength = 16;
        var handler = Assets.Handler(records, new Custom(records.Schema, request => new CanopyGridRecord(request.Id) {
            Row = new CanopyGridRow(request.Id) { Cells = { ["site"] = longText }, Fields = { ["notes"] = longText } }
        }), options);
        using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1", ",\"row\":true"), field => field != "site"));
        var row = document.RootElement.GetProperty("row");
        Assert.Equal(longText, row.GetProperty("cells").GetProperty("site").GetString());
        Assert.Equal(longText, row.GetProperty("fields").GetProperty("notes").GetString());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RecordSerialization_UsesCapturedRecordAndRowMetadata(bool row) {
        var view = Assets.View();
        var columns = Assets.Columns(view);
        var records = Assets.Records(columns);
        var data = new[] { new Asset { Id = 1, Name = "one", Notes = "note", Site = "Main" } };
        var handler = Assets.Handler(records, new CanopyQueryableRecordProvider<Asset>(data.AsQueryable(), records));
        var json = Assets.Query("1", row ? ",\"row\":true" : "");
        var before = await handler.RecordAsync(json);
        view.Record!.Fields.Clear();
        view.Columns[0].Kind = CanopyColumnKind.Number;
        Assert.Equal(before, await handler.RecordAsync(json));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RecordSchema_CapturesFieldsAddedAfterTheDataSchemaAndFreezesNestedDefinitions(bool tree) {
        var view = Assets.View();
        var nested = new CanopyDataGridView("nested", "Nested");
        nested.Columns.Add(new CanopyColumn("value", "Value"));
        var nestedTree = new CanopyTreeView("nested-tree", "Nested tree");
        nestedTree.Columns.Add(new CanopyColumn("value", "Value"));
        view.Reporting = new CanopyGridReporting { Detail = tree ? new CanopyGridDetail { TreeView = nestedTree } : new CanopyGridDetail { View = nested } };
        var columns = Assets.Columns(view);
        _ = columns.Schema;
        view.Record!.Fields.Add(new CanopyColumn("later", "Later"));
        var records = new CanopyRecordMap<Asset>(columns).Field("later", asset => asset.Notes);
        var schema = records.Schema;
        var handler = Assets.Handler(records, new Custom(schema, request => {
            CanopyDetail detail;
            if (tree) detail = new CanopyTreeDetail { Roots = { new CanopyNode("child", "child") { Cells = { ["value"] = "nested" } } } };
            else detail = new CanopyGridRowsDetail { Rows = { new CanopyGridRow("child") { Cells = { ["value"] = "nested" } } } };
            return new CanopyGridRecord(request.Id) { Fields = { ["later"] = "captured" }, Row = new CanopyGridRow(request.Id) { Detail = detail } };
        }));
        var before = await handler.RecordAsync(Assets.Query("1", ",\"row\":true"));
        Assert.Contains("captured", before);
        view.Record.Fields.Clear();
        nested.Columns[0].Kind = CanopyColumnKind.Number;
        nestedTree.Columns.Clear();
        Assert.Equal(before, await handler.RecordAsync(Assets.Query("1", ",\"row\":true")));
    }

    [Fact]
    public async Task CreatingALaterRecordSchema_DoesNotAdvanceCapturedColumnOrNestedMetadata() {
        var view = Assets.View();
        var nested = new CanopyDataGridView("nested", "Nested");
        nested.Columns.Add(new CanopyColumn("value", "Value"));
        view.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = nested } };
        var columns = Assets.Columns(view);
        _ = columns.Schema;
        view.Columns[0].Kind = CanopyColumnKind.Number;
        nested.Columns[0].Kind = CanopyColumnKind.Number;
        view.Record!.Fields.Add(new CanopyColumn("later", "Later"));
        var records = new CanopyRecordMap<Asset>(columns).Field("later", asset => asset.Notes);
        var handler = Assets.Handler(records, new Custom(records.Schema, request => new CanopyGridRecord(request.Id) {
            Fields = { ["later"] = "captured later" },
            Row = new CanopyGridRow(request.Id) {
                Cells = { ["name"] = "parent" },
                Detail = new CanopyGridRowsDetail { Rows = { new CanopyGridRow("child") { Cells = { ["value"] = "nested" } } } }
            }
        }));
        using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1", ",\"row\":true")));
        Assert.Equal("captured later", document.RootElement.GetProperty("fields").GetProperty("later").GetString());
        Assert.Equal("parent", document.RootElement.GetProperty("row").GetProperty("cells").GetProperty("name").GetString());
        Assert.Equal("nested", document.RootElement.GetProperty("row").GetProperty("detail").GetProperty("rows")[0].GetProperty("cells").GetProperty("value").GetString());
    }

    private static CanopyCell Rows(int count, int total, int pageSize) {
        var list = new CanopyRecordList { Total = total, PageSize = pageSize };
        list.Columns.Add(new CanopyColumn("name", "Name"));
        for (var i = 0; i < count; i++) list.Rows.Add(new CanopyGridRow("part-" + i) { Cells = { ["name"] = "part" } });
        return CanopyCell.Collection(list);
    }

    private sealed class Custom : ICanopyRecordProvider {
        private readonly Func<CanopyRecordRequest, CanopyGridRecord> _answer;
        internal Custom(CanopyRecordSchema schema, Func<CanopyRecordRequest, CanopyGridRecord> answer) { Schema = schema; _answer = answer; }
        public CanopyRecordSchema Schema { get; }
        public ValueTask<CanopyGridRecord?> GetRecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken) => new(_answer(request));
    }
}
