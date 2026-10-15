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

    private sealed class Custom : ICanopyRecordProvider {
        private readonly Func<CanopyRecordRequest, CanopyGridRecord> _answer;
        public Custom(CanopyRecordSchema schema, Func<CanopyRecordRequest, CanopyGridRecord> answer) { Schema = schema; _answer = answer; }
        public CanopyRecordSchema Schema { get; }
        public ValueTask<CanopyGridRecord?> GetRecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken) => new ValueTask<CanopyGridRecord?>(_answer(request));
    }
}
