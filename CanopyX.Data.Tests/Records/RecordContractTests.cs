using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>The record map refuses mappings it cannot serve safely, and the handler fails closed when a provider answers more than asked.</summary>
public sealed class RecordContractTests {
    private static CanopyRecordMap<Asset> Map() => new CanopyRecordMap<Asset>(Assets.Columns(Assets.View()));

    [Fact]
    public void Map_RefusesUndeclaredDuplicateAndMistypedFields() {
        Assert.Throws<ArgumentException>(() => Map().Field("nothing", asset => asset.Serial));
        Assert.Throws<ArgumentException>(() => Map().Field("name", asset => asset.Name));
        Assert.Throws<ArgumentException>(() => Map().Field("serial", asset => asset.Serial).Field("serial", asset => asset.Notes));
        Assert.Throws<ArgumentException>(() => Map().Field("weight", asset => asset.Serial));
        Assert.Throws<ArgumentException>(() => Map().Field("purchased", asset => asset.Weight));
        Assert.Throws<ArgumentException>(() => Map().Field("serial", asset => asset.Group));
        Assert.Throws<ArgumentException>(() => Map().Link("weight", asset => asset.ReplacesId));
        Assert.Throws<ArgumentException>(() => Map().Link("replaces", asset => asset.Seen));
        Assert.Throws<ArgumentException>(() => Map().Cell("nothing", asset => asset.Site));
        Assert.Throws<ArgumentException>(() => Map().Cell("cores", asset => asset.Site));
        Assert.Throws<ArgumentException>(() => Map().Cell("site", asset => asset.Site).Cell("site", asset => asset.Site));
        Assert.Throws<ArgumentException>(() => Map().Collection("parts", asset => asset.Parts, list => list.Key(part => part.Installed)));
        Assert.Throws<ArgumentException>(() => Map().Collection("parts", asset => asset.Parts, list => list.Key(part => part.Id).Column(new CanopyColumn("q", "Q") { Kind = CanopyColumnKind.Number }, part => part.Name)));
        Assert.Throws<InvalidOperationException>(() => Map().Collection("parts", asset => asset.Parts, list => list.Column(new CanopyColumn("q", "Q"), part => part.Name)));
        Assert.Throws<InvalidOperationException>(() => Map().Collection("parts", asset => asset.Parts, list => list.Key(part => part.Id)));
        Assert.Throws<InvalidOperationException>(() => Map().Timeline("events", asset => asset.Events, events => events.Key(item => item.Id)));
        Assert.Throws<ArgumentException>(() => Map().Timeline("events", asset => asset.Events, events => events.Time(item => item.Summary)));
        Assert.Throws<InvalidOperationException>(() => Map().Changes("changes", asset => asset.Changes, changes => changes.Key(item => item.Id).Name(item => item.Setting)));
        Assert.Throws<ArgumentOutOfRangeException>(() => Map().Changes("changes", asset => asset.Changes, changes => changes.Limit(513)));
        Assert.Throws<ArgumentException>(() => Map().Changes("changes", asset => asset.Changes, changes => changes.Before(item => item.Before).After(item => item.At)));
        Assert.Throws<ArgumentException>(() => Map().Changes("changes", asset => asset.Changes, changes => changes.After(item => item.Id).Before(item => item.Setting)));
    }

    [Fact]
    public void Map_NeedsARecordPanelAndALookupKey() {
        var plain = Fleet.View();
        Assert.Throws<ArgumentException>(() => new CanopyRecordMap<Host>(Fleet.Map(plain)));
        var view = Assets.View();
        var dated = new CanopyColumnMap<Asset>(view).Key(asset => asset.Seen).Column("name", asset => asset.Name);
        Assert.Throws<InvalidOperationException>(() => new CanopyRecordMap<Asset>(dated).Schema);
        var map = Map().Field("serial", asset => asset.Serial);
        _ = map.Schema;
        Assert.Throws<InvalidOperationException>(() => map.Field("notes", asset => asset.Notes));
    }

    [Fact]
    public void Schema_ChecksItsFieldsAndCells() {
        var data = Assets.Columns(Assets.View()).Schema;
        Assert.Throws<ArgumentException>(() => new CanopyRecordSchema(data, new[] { CanopyRecordField.Value("nothing") }));
        Assert.Throws<ArgumentException>(() => new CanopyRecordSchema(data, new[] { CanopyRecordField.Value("serial"), CanopyRecordField.Value("serial") }));
        Assert.Throws<ArgumentException>(() => new CanopyRecordSchema(data, Array.Empty<CanopyRecordField>(), new[] { "nothing" }));
        Assert.Throws<ArgumentException>(() => new CanopyRecordSchema(Fleet.Map(Fleet.View()).Schema, Array.Empty<CanopyRecordField>()));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecordField.Collection("parts", 0));
        var schema = new CanopyRecordSchema(data, new[] { CanopyRecordField.Collection("parts", 25) }, new[] { "display" });
        Assert.True(schema.TryGetField("parts", out var parts) && parts.IsCollection && parts.PageSize == 25);
        Assert.Equal(new[] { "display" }, schema.Cells);
    }

    [Fact]
    public void Handler_RefusesARecordProviderOfAnotherSchema() {
        var records = Assets.Records(Assets.Columns(Assets.View()));
        var other = Assets.Columns(Assets.View());
        var provider = new CanopyInMemoryRecordProvider<Asset>(records, () => Array.Empty<Asset>());
        Assert.Throws<ArgumentException>(() => new CanopyRemoteHandler(other.Schema, new CanopyQueryableProvider<Asset>(Array.Empty<Asset>().AsQueryable(), other), null, null, provider));
    }

    public static IEnumerable<object[]> Violations => new[] {
        new object[] { "another record", "", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => new CanopyGridRecord("2")) },
        new object[] { "a field not asked for", "", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Fields["unmapped"] = "x")) },
        new object[] { "a hidden field", "", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Fields["secret"] = "x")) },
        new object[] { "a hidden cell", "", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Cells["site"] = "x")) },
        new object[] { "a row not asked for", "", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Row = new CanopyGridRow("1"))) },
        new object[] { "no row when asked", ",\"row\":true", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => new CanopyGridRecord("1")) },
        new object[] { "too many collection rows", "", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Fields["parts"] = Rows(11, 30))) },
        new object[] { "too many events", "", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Fields["events"] =
            CanopyCell.Timeline(Enumerable.Range(0, 201).Select(i => new CanopyRecordEvent(DateTime.UtcNow, "e" + i))))) },
        new object[] { "a total below the rows", "", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Fields["parts"] = Rows(3, 1))) },
        new object[] { "a page size the endpoint refuses", "", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Fields["parts"] = Rows(2, 2, 500))) },
        new object[] { "a page with a page size the endpoint refuses", ",\"field\":\"parts\",\"limit\":5", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Fields["parts"] = Rows(2, 2, 201))) },
        new object[] { "events in a collection field", "", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Fields["parts"] =
            CanopyCell.Timeline(new[] { new CanopyRecordEvent(DateTime.UtcNow, "e") }))) },
        new object[] { "a collection in a value field", "", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Fields["serial"] = Rows(1, 1))) },
        new object[] { "a page with another field", ",\"field\":\"parts\",\"limit\":5", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => { record.Fields["parts"] = Rows(1, 1); record.Fields["serial"] = "x"; })) },
        new object[] { "a page with too many rows", ",\"field\":\"parts\",\"limit\":5", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Fields["parts"] = Rows(6, 10))) },
        new object[] { "a page without a total", ",\"field\":\"parts\",\"limit\":5", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => record.Fields["parts"] = Rows(2, null))) },
        new object[] { "a page with a row", ",\"field\":\"parts\",\"limit\":5", (Func<CanopyRecordRequest, CanopyGridRecord>)(request => With(request, record => { record.Fields["parts"] = Rows(1, 1); record.Row = new CanopyGridRow("1"); })) }
    };

    [Theory]
    [MemberData(nameof(Violations))]
    public async Task Handler_FailsClosedWhenAProviderAnswersMoreThanAsked(string what, string extra, Func<CanopyRecordRequest, CanopyGridRecord> answer) {
        var records = Assets.Records(Assets.Columns(Assets.View()));
        var handler = Assets.Handler(records, new Fake(records.Schema, answer));
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => handler.RecordAsync(Assets.Query("1", extra), id => id != "secret" && id != "site"));
        Assert.False(string.IsNullOrEmpty(error.Message), what);
    }

    private static CanopyGridRecord With(CanopyRecordRequest request, Action<CanopyGridRecord> change) {
        var record = new CanopyGridRecord(request.Id);
        change(record);
        return record;
    }

    private static CanopyCell Rows(int count, int? total, int? pageSize = null) {
        var list = new CanopyRecordList { Total = total, PageSize = pageSize };
        list.Columns.Add(new CanopyColumn("name", "Name"));
        for (var i = 0; i < count; i++) { var row = new CanopyGridRow("p" + i); row.Cells["name"] = "part"; list.Rows.Add(row); }
        return CanopyCell.Collection(list);
    }

    private sealed class Fake : ICanopyRecordProvider {
        private readonly Func<CanopyRecordRequest, CanopyGridRecord> _answer;
        public Fake(CanopyRecordSchema schema, Func<CanopyRecordRequest, CanopyGridRecord> answer) { Schema = schema; _answer = answer; }
        public CanopyRecordSchema Schema { get; }
        public ValueTask<CanopyGridRecord?> GetRecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken) => new ValueTask<CanopyGridRecord?>(_answer(request));
    }
}
