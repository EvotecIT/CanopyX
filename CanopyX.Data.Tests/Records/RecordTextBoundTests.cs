using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>The endpoint holds every record provider, custom ones included, to the text bound: shortened text ends with an
/// ellipsis and fits the bound, surrogate pairs stay whole, and identities, link keys and the row are never shortened.</summary>
public sealed class RecordTextBoundTests {
    private const int Bound = 16;
    private static readonly string Long = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static readonly string Clipped = Long.Substring(0, Bound - 1) + "…";
    private static readonly string LongId = "link-identity-longer-than-the-text-bound";

    private static CanopyRemoteHandler Handler(Func<CanopyRecordRequest, CanopyGridRecord> answer) {
        var records = Assets.Records(Assets.Columns(Assets.View()));
        var options = new CanopyRemoteOptions();
        options.Limits.MaxRecordTextLength = Bound;
        return Assets.Handler(records, new Custom(records.Schema, answer), options);
    }

    [Fact]
    public async Task CustomProvider_IsHeldToTheTextBound() {
        var handler = Handler(request => {
            var record = new CanopyGridRecord(request.Id);
            record.Fields["serial"] = Long;
            record.Fields["notes"] = new CanopyCell(Long) { Text = Long, Title = Long, Secondary = Long, Badges = { new CanopyBadge(Long) { Title = Long } } };
            record.Fields["replaces"] = CanopyCell.Link(Long, LongId);
            var list = new CanopyRecordList { Total = 1 };
            list.Columns.Add(new CanopyColumn("name", "Name"));
            var row = new CanopyGridRow(LongId);
            row.Cells["name"] = Long;
            list.Rows.Add(row);
            record.Fields["parts"] = CanopyCell.Collection(list);
            record.Fields["events"] = CanopyCell.Timeline(new[] { new CanopyRecordEvent(new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc), Long) { Actor = Long, Kind = Long } });
            record.Fields["changes"] = CanopyCell.Diff(new[] { new CanopyFieldChange(Long, Long, new CanopyCell(Long) { Text = Long }) });
            record.Cells["site"] = new CanopyCell(Long) { Tone = CanopyTone.Danger, SortKey = 3, Badges = { new CanopyBadge("ok") } };
            record.Row = new CanopyGridRow(request.Id);
            record.Row.Cells["name"] = Long;
            return record;
        });
        using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1", ",\"row\":true")));
        var root = document.RootElement;
        var fields = root.GetProperty("fields");
        Assert.Equal(Clipped, fields.GetProperty("serial").GetString());
        var notes = fields.GetProperty("notes");
        foreach (var name in new[] { "value", "text", "title", "secondary" }) Assert.Equal(Clipped, notes.GetProperty(name).GetString());
        Assert.Equal(Clipped, notes.GetProperty("badges")[0].GetProperty("text").GetString());
        Assert.Equal(Clipped, notes.GetProperty("badges")[0].GetProperty("title").GetString());
        // A link keeps its key; only its text is shortened.
        Assert.Equal(Clipped, fields.GetProperty("replaces").GetProperty("value").GetString());
        Assert.Equal(LongId, fields.GetProperty("replaces").GetProperty("ref").GetProperty("id").GetString());
        var part = fields.GetProperty("parts").GetProperty("records").GetProperty("rows")[0];
        Assert.Equal(LongId, part.GetProperty("id").GetString());
        Assert.Equal(Clipped, part.GetProperty("cells").GetProperty("name").GetString());
        var item = fields.GetProperty("events").GetProperty("events")[0];
        foreach (var name in new[] { "summary", "actor", "kind" }) Assert.Equal(Clipped, item.GetProperty(name).GetString());
        var change = fields.GetProperty("changes").GetProperty("changes")[0];
        Assert.Equal(Clipped, change.GetProperty("name").GetString());
        Assert.Equal(Clipped, change.GetProperty("before").GetString());
        Assert.Equal(Clipped, change.GetProperty("after").GetProperty("value").GetString());
        Assert.Equal(Clipped, change.GetProperty("after").GetProperty("text").GetString());
        // A replaced cell keeps everything else it carries.
        var site = root.GetProperty("cells").GetProperty("site");
        Assert.Equal(Clipped, site.GetProperty("value").GetString());
        Assert.Equal("danger", site.GetProperty("tone").GetString());
        Assert.Equal(3, site.GetProperty("sort").GetInt32());
        Assert.Equal("ok", site.GetProperty("badges")[0].GetProperty("text").GetString());
        // The record's row is written as page rows are, never shortened.
        Assert.Equal(Long, root.GetProperty("row").GetProperty("cells").GetProperty("name").GetString());
    }

    [Theory]
    [InlineData(14, 14)]
    [InlineData(13, 15)]
    public async Task ShortenedText_NeverSplitsASurrogatePair(int before, int kept) {
        // An emoji is two code units; shortening stops before it rather than between its halves.
        var text = new string('a', before) + "\U0001F600" + "zzzzzz";
        var handler = Handler(request => {
            var record = new CanopyGridRecord(request.Id);
            record.Fields["serial"] = text;
            record.Fields["notes"] = new string('b', Bound);
            return record;
        });
        using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
        var fields = document.RootElement.GetProperty("fields");
        var shortened = fields.GetProperty("serial").GetString()!;
        Assert.Equal(text.Substring(0, kept) + "…", shortened);
        Assert.True(shortened.Length <= Bound);
        Assert.False(char.IsHighSurrogate(shortened[shortened.Length - 2]));
        // Text of exactly the bound is answered whole.
        Assert.Equal(new string('b', Bound), fields.GetProperty("notes").GetString());
    }

    [Fact]
    public async Task ReferenceProvider_ShortensSurrogatePairsAlike() {
        var asset = new Asset { Id = 1, Name = "one", Site = "Main", Notes = new string('a', 14) + "\U0001F600" + "zzzzzz" };
        var records = Assets.Records(Assets.Columns(Assets.View()));
        var options = new CanopyRemoteOptions();
        options.Limits.MaxRecordTextLength = Bound;
        foreach (var provider in new ICanopyRecordProvider[] { new CanopyInMemoryRecordProvider<Asset>(records, () => new[] { asset }), new CanopyQueryableRecordProvider<Asset>(new[] { asset }.AsQueryable(), records) }) {
            using var document = JsonDocument.Parse(await Assets.Handler(records, provider, options).RecordAsync(Assets.Query("1")));
            Assert.Equal(new string('a', 14) + "…", document.RootElement.GetProperty("fields").GetProperty("notes").GetString());
        }
    }

    [Fact]
    public async Task HistoryLabels_AreClippedInFieldsDrawerValuesAndNestedCells() {
        CanopyCell History() => new CanopyCell(Long) {
            Series = { new CanopyCellPeriod(Long, 3, Long, CanopyTone.Danger), new CanopyCellPeriod("short", 0) }
        };
        var handler = Handler(request => {
            var record = new CanopyGridRecord(request.Id);
            record.Fields["notes"] = CanopyCell.Object(new[] { new CanopyCellField("history", History()) });
            record.Cells["site"] = History();
            var list = new CanopyRecordList { Total = 1 };
            list.Columns.Add(new CanopyColumn("name", "Name"));
            var row = new CanopyGridRow(LongId);
            row.Cells["name"] = History();
            list.Rows.Add(row);
            record.Fields["parts"] = CanopyCell.Collection(list);
            var item = new CanopyRecordEvent(DateTime.UtcNow, "event");
            item.Changes.Add(new CanopyFieldChange("history", History(), History()));
            record.Fields["events"] = CanopyCell.Timeline(new[] { item });
            return record;
        });
        using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
        var root = document.RootElement;
        var fields = root.GetProperty("fields");
        var changes = fields.GetProperty("events").GetProperty("events")[0].GetProperty("changes")[0];
        foreach (var cell in new[] {
            root.GetProperty("cells").GetProperty("site"), fields.GetProperty("notes").GetProperty("fields")[0].GetProperty("value"),
            fields.GetProperty("parts").GetProperty("records").GetProperty("rows")[0].GetProperty("cells").GetProperty("name"),
            changes.GetProperty("before"), changes.GetProperty("after")
        }) {
            Assert.Equal(Clipped, cell.GetProperty("value").GetString());
            var series = cell.GetProperty("series");
            Assert.Equal(Clipped, series[0].GetProperty("period").GetString());
            Assert.Equal(Clipped, series[0].GetProperty("state").GetString());
            Assert.Equal(3, series[0].GetProperty("value").GetDouble());
            Assert.Equal("danger", series[0].GetProperty("tone").GetString());
            Assert.Equal("short", series[1].GetProperty("period").GetString());
            Assert.False(series[1].TryGetProperty("state", out _));
        }
    }

    [Fact]
    public async Task NestedTreeLabelsAndBadges_AreClippedWithoutChangingIdentityOrScopeMetadata() {
        var handler = Handler(request => {
            var record = new CanopyGridRecord(request.Id);
            var tree = new CanopyRecordList();
            tree.Columns.Add(new CanopyColumn("name", "Name"));
            var root = new CanopyNode(LongId, Long) { Kind = "host-kind", Flags = { "host-flag" }, Data = { ["host-key"] = LongId } };
            root.Badges.Add(new CanopyBadge(Long, CanopyTone.Warning) { Title = Long });
            root.Children.Add(new CanopyNode("child", Long) { Badges = { new CanopyBadge(Long) { Title = Long } } });
            tree.Roots.Add(root);
            record.Fields["notes"] = CanopyCell.Object(new[] { new CanopyCellField("tree", CanopyCell.Collection(tree)) });
            return record;
        });
        using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
        var node = document.RootElement.GetProperty("fields").GetProperty("notes").GetProperty("fields")[0].GetProperty("value").GetProperty("records").GetProperty("roots")[0];
        Assert.Equal(LongId, node.GetProperty("id").GetString());
        Assert.Equal("host-kind", node.GetProperty("kind").GetString());
        Assert.Equal("host-flag", node.GetProperty("flags")[0].GetString());
        Assert.Equal(LongId, node.GetProperty("data").GetProperty("host-key").GetString());
        foreach (var item in new[] { node, node.GetProperty("children")[0] }) {
            Assert.Equal(Clipped, item.GetProperty("label").GetString());
            Assert.Equal(Clipped, item.GetProperty("badges")[0].GetProperty("text").GetString());
            Assert.Equal(Clipped, item.GetProperty("badges")[0].GetProperty("title").GetString());
        }
        Assert.Equal("warning", node.GetProperty("badges")[0].GetProperty("tone").GetString());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DeepTrees_ClipEveryNodeAndKeepCanonicalCycleRejection(bool cyclic) {
        const int count = 300;
        var handler = Handler(request => {
            var record = new CanopyGridRecord(request.Id);
            var tree = new CanopyRecordList();
            tree.Columns.Add(new CanopyColumn("name", "Name"));
            var first = new CanopyNode("node-0", Long);
            tree.Roots.Add(first);
            var node = first;
            for (var i = 1; i < count; i++) {
                var child = new CanopyNode("node-" + i, Long) { Cells = { ["name"] = Long }, Badges = { new CanopyBadge(Long) } };
                node.Children.Add(child);
                node = child;
            }
            if (cyclic) node.Children.Add(first);
            record.Fields["notes"] = CanopyCell.Object(new[] { new CanopyCellField("tree", CanopyCell.Collection(tree)) });
            return record;
        });
        if (cyclic) {
            var error = await Assert.ThrowsAsync<InvalidOperationException>(() => handler.RecordAsync(Assets.Query("1")));
            Assert.Contains("more than one node with id", error.Message);
        } else {
            using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")), new JsonDocumentOptions { MaxDepth = count * 3 });
            var node = document.RootElement.GetProperty("fields").GetProperty("notes").GetProperty("fields")[0].GetProperty("value").GetProperty("records").GetProperty("roots")[0];
            for (var i = 0; i < count; i++) {
                Assert.Equal("node-" + i, node.GetProperty("id").GetString());
                Assert.Equal(Clipped, node.GetProperty("label").GetString());
                if (i > 0) {
                    Assert.Equal(Clipped, node.GetProperty("cells").GetProperty("name").GetString());
                    Assert.Equal(Clipped, node.GetProperty("badges")[0].GetProperty("text").GetString());
                }
                if (i + 1 < count) node = node.GetProperty("children")[0];
            }
        }
    }

    [Theory]
    [InlineData("object")]
    [InlineData("collection")]
    [InlineData("changes")]
    [InlineData("events")]
    public async Task CyclicCustomAnswers_AreRejectedBeforeClippingCanOverflowTheStack(string kind) {
        var handler = Handler(request => {
            var record = new CanopyGridRecord(request.Id);
            var cell = new CanopyCell();
            switch (kind) {
                case "object": cell.Fields.Add(new CanopyCellField("self", cell)); break;
                case "collection":
                    var list = new CanopyRecordList { Total = 1 };
                    list.Columns.Add(new CanopyColumn("name", "Name"));
                    var row = new CanopyGridRow("child");
                    row.Cells["name"] = cell;
                    list.Rows.Add(row);
                    cell.Records = list;
                    break;
                case "changes": cell.Changes.Add(new CanopyFieldChange("self", cell, null)); break;
                case "events":
                    var item = new CanopyRecordEvent(DateTime.UtcNow, "event");
                    item.Changes.Add(new CanopyFieldChange("self", cell, null));
                    cell.Events.Add(item);
                    break;
            }
            record.Fields[kind == "collection" ? "parts" : "notes"] = cell;
            return record;
        });
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => handler.RecordAsync(Assets.Query("1")));
        Assert.Contains("Structured values nest at most " + CanopyCell.MaxStructureDepth, error.Message);
    }

    [Theory]
    [InlineData(CanopyCell.MaxStructureDepth, false)]
    [InlineData(CanopyCell.MaxStructureDepth + 1, true)]
    public async Task NestedCustomAnswers_KeepTheCanonicalStructureDepthBoundary(int depth, bool rejected) {
        var handler = Handler(request => {
            var record = new CanopyGridRecord(request.Id);
            CanopyCell cell = Long;
            for (var i = 0; i < depth; i++) cell = CanopyCell.Object(new[] { new CanopyCellField("nested", cell) });
            record.Fields["notes"] = cell;
            return record;
        });
        if (rejected) await Assert.ThrowsAsync<InvalidOperationException>(() => handler.RecordAsync(Assets.Query("1")));
        else {
            using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query("1")));
            var cell = document.RootElement.GetProperty("fields").GetProperty("notes");
            for (var i = 0; i < depth; i++) cell = cell.GetProperty("fields")[0].GetProperty("value");
            Assert.Equal(Clipped, cell.GetString());
        }
    }

    private sealed class Custom : ICanopyRecordProvider {
        private readonly Func<CanopyRecordRequest, CanopyGridRecord> _answer;
        public Custom(CanopyRecordSchema schema, Func<CanopyRecordRequest, CanopyGridRecord> answer) { Schema = schema; _answer = answer; }
        public CanopyRecordSchema Schema { get; }
        public ValueTask<CanopyGridRecord?> GetRecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken) => new ValueTask<CanopyGridRecord?>(_answer(request));
    }
}
