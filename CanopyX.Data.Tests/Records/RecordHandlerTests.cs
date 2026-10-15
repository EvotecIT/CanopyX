using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Record details over the reference provider and over LINQ to objects: fields, scope, read checks, revisions, paging and limits.</summary>
public sealed class RecordHandlerTests {
    private static readonly List<Asset> All = Assets.Create(160);

    public static IEnumerable<object[]> Kinds => new[] { new object[] { ProviderKind.Reference }, new object[] { ProviderKind.Linq } };

    private static CanopyRemoteHandler Handler(ProviderKind kind, CanopyRemoteOptions? options = null) {
        var records = Assets.Records(Assets.Columns(Assets.View()));
        ICanopyRecordProvider provider = kind == ProviderKind.Reference
            ? new CanopyInMemoryRecordProvider<Asset>(records, () => Assets.Scoped(All))
            : new CanopyQueryableRecordProvider<Asset>(() => Assets.Scoped(All).AsQueryable(), records);
        return Assets.Handler(records, provider, options);
    }

    private static async Task<JsonElement> Record(CanopyRemoteHandler handler, string id, string extra = "", Func<string, bool>? canRead = null) =>
        JsonDocument.Parse(await handler.RecordAsync(Assets.Query(id, extra), canRead)).RootElement;

    private static async Task<CanopyRequestException> Rejected(CanopyRemoteHandler handler, string id, string extra = "") =>
        await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RecordAsync(Assets.Query(id, extra)));

    private static Asset Visible(Func<Asset, bool> test) => Assets.Scoped(All).First(test);

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task WholeRecord_MapsEveryKindOfField(ProviderKind kind) {
        var asset = Visible(item => item.Parts.Count > 20 && item.ReplacesId != null && item.Events.Count > 0 && item.Changes.Count > 0 && item.Serial != null && item.Weight != null);
        var root = await Record(Handler(kind), asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture));
        Assert.Equal("gridRecord", root.GetProperty("type").GetString());
        Assert.Equal("r1", root.GetProperty("revision").GetString());
        Assert.False(root.TryGetProperty("row", out _));
        var fields = root.GetProperty("fields");
        Assert.Equal(asset.Serial, fields.GetProperty("serial").GetString());
        Assert.Equal(asset.Weight!.Value, fields.GetProperty("weight").GetDouble());
        Assert.Equal("secret-" + asset.Id, fields.GetProperty("secret").GetString());
        var link = fields.GetProperty("replaces");
        Assert.Equal(asset.Replaces!.Name, link.GetProperty("value").GetString());
        Assert.Equal(asset.ReplacesId!.Value.ToString(System.Globalization.CultureInfo.InvariantCulture), link.GetProperty("ref").GetProperty("id").GetString());
        var parts = fields.GetProperty("parts").GetProperty("records");
        Assert.Equal(asset.Parts.Count, parts.GetProperty("total").GetInt32());
        Assert.Equal(10, parts.GetProperty("rows").GetArrayLength());
        Assert.Equal(10, parts.GetProperty("pageSize").GetInt32());
        Assert.Equal(new[] { "name", "vendor", "quantity", "installed" }, parts.GetProperty("columns").EnumerateArray().Select(column => column.GetProperty("id").GetString()));
        Assert.Equal(OrderedParts(asset).Take(10).Select(part => part.Id.ToString(System.Globalization.CultureInfo.InvariantCulture)),
            parts.GetProperty("rows").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
        var events = fields.GetProperty("events").GetProperty("events");
        Assert.Equal(Math.Min(20, asset.Events.Count), events.GetArrayLength());
        var times = events.EnumerateArray().Select(item => item.TryGetProperty("time", out var time) ? time.GetString() : null).ToList();
        Assert.Equal(times.Where(time => time != null).OrderByDescending(time => time, StringComparer.Ordinal), times.Where(time => time != null));
        Assert.True(times.SkipWhile(time => time != null).All(time => time == null), "Events without a time come last.");
        Assert.All(events.EnumerateArray(), item => Assert.False(string.IsNullOrWhiteSpace(item.GetProperty("summary").GetString())));
        Assert.Equal(Math.Min(15, asset.Changes.Count), fields.GetProperty("changes").GetProperty("changes").GetArrayLength());
        Assert.Equal("Site " + asset.Site, root.GetProperty("cells").GetProperty("site").GetProperty("title").GetString());
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task Row_IsThePageEndpointsRow(ProviderKind kind) {
        var asset = Visible(item => item.Group != null && item.Cores != null);
        var id = asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var root = await Record(Handler(kind), id, ",\"row\":true");
        var map = Assets.Columns(Assets.View());
        var page = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Asset>(Assets.Scoped(All).AsQueryable(), map));
        using var document = JsonDocument.Parse(await page.QueryAsync("{\"offset\":0,\"limit\":1000}"));
        var expected = document.RootElement.GetProperty("items").EnumerateArray().Single(item => item.GetProperty("id").GetString() == id);
        Assert.Equal(expected.GetRawText(), root.GetProperty("row").GetRawText());
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task OutOfScopeMissingAndUnconvertible_AnswerAlike(ProviderKind kind) {
        var handler = Handler(kind);
        var hidden = All.First(asset => asset.Site == "Hidden").Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var errors = new List<CanopyRequestException> {
            await Rejected(handler, hidden), await Rejected(handler, hidden, ",\"row\":true"), await Rejected(handler, hidden, ",\"field\":\"parts\""),
            await Rejected(handler, "99999"), await Rejected(handler, "abc"), await Rejected(handler, "99999", ",\"field\":\"parts\",\"offset\":0,\"limit\":5")
        };
        foreach (var error in errors) {
            Assert.Equal(CanopyRequestError.RecordNotFound, error.Error);
            Assert.Equal(404, error.StatusCode);
            Assert.Equal(errors[0].Message, error.Message);
        }
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task ReadCheck_LeavesOutFieldsAndDrawerValues(ProviderKind kind) {
        var asset = Visible(item => item.Parts.Count > 0 && item.Site != null);
        var root = await Record(Handler(kind), asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture), ",\"row\":true", id => id != "secret" && id != "parts" && id != "site");
        var fields = root.GetProperty("fields");
        Assert.False(fields.TryGetProperty("secret", out _));
        Assert.False(fields.TryGetProperty("parts", out _));
        Assert.True(fields.TryGetProperty("serial", out _) || asset.Serial == null);
        Assert.False(root.TryGetProperty("cells", out _));
        Assert.DoesNotContain("secret-", root.GetRawText());
        // The row is the page row: grid columns follow the column map, as pages do.
        Assert.Equal(asset.Site, root.GetProperty("row").GetProperty("cells").GetProperty("site").GetString());
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task Revisions_StaleAnswers409BeforeTheLookup(ProviderKind kind) {
        var handler = Handler(kind);
        var hidden = All.First(asset => asset.Site == "Hidden").Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
        foreach (var id in new[] { "1", "99999", hidden, "not-a-key" }) {
            var error = await Rejected(handler, id, ",\"revision\":\"r0\"");
            Assert.Equal(CanopyRequestError.StaleRevision, error.Error);
            Assert.Equal(409, error.StatusCode);
        }
        var visible = Visible(item => true).Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal("r1", (await Record(handler, visible, ",\"revision\":\"r1\"")).GetProperty("revision").GetString());
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task CollectionPages_FollowOneStableOrderWithTheirTotal(ProviderKind kind) {
        var handler = Handler(kind);
        var asset = Visible(item => item.Parts.Count > 40);
        var id = asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var seen = new List<string>();
        for (var offset = 0; offset < asset.Parts.Count + 7; offset += 7) {
            var page = (await Record(handler, id, ",\"field\":\"parts\",\"offset\":" + offset + ",\"limit\":7")).GetProperty("fields");
            Assert.Single(page.EnumerateObject());
            var records = page.GetProperty("parts").GetProperty("records");
            Assert.Equal(asset.Parts.Count, records.GetProperty("total").GetInt32());
            seen.AddRange(records.GetProperty("rows").EnumerateArray().Select(row => row.GetProperty("id").GetString()!));
        }
        Assert.Equal(OrderedParts(asset).Select(part => part.Id.ToString(System.Globalization.CultureInfo.InvariantCulture)), seen);
        var again = await handler.RecordAsync(Assets.Query(id, ",\"field\":\"parts\",\"offset\":14,\"limit\":7"));
        Assert.Equal(again, await handler.RecordAsync(Assets.Query(id, ",\"field\":\"parts\",\"offset\":14,\"limit\":7")));
        // A record without parts pages to an empty list; in a whole record the empty collection is an empty field.
        var empty = Visible(item => item.Parts.Count == 0).Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var none = (await Record(handler, empty, ",\"field\":\"parts\"")).GetProperty("fields").GetProperty("parts").GetProperty("records");
        Assert.Equal(0, none.GetProperty("total").GetInt32());
        Assert.Equal(0, none.GetProperty("rows").GetArrayLength());
        Assert.False((await Record(handler, empty)).GetProperty("fields").TryGetProperty("parts", out _));
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task Limits_BoundRowsItemsAndBytes(ProviderKind kind) {
        var options = new CanopyRemoteOptions();
        options.Limits.MaxRecordPageSize = 4;
        options.Limits.MaxRecordItems = 3;
        var handler = Handler(kind, options);
        var asset = Visible(item => item.Parts.Count > 10 && item.Events.Count > 3 && item.Changes.Count > 3);
        var id = asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var fields = (await Record(handler, id)).GetProperty("fields");
        Assert.Equal(4, fields.GetProperty("parts").GetProperty("records").GetProperty("rows").GetArrayLength());
        Assert.Equal(asset.Parts.Count, fields.GetProperty("parts").GetProperty("records").GetProperty("total").GetInt32());
        // Load more asks for the page size the collection carries, which stays within the limit, so it is never refused.
        var pageSize = fields.GetProperty("parts").GetProperty("records").GetProperty("pageSize").GetInt32();
        Assert.Equal(4, pageSize);
        var more = (await Record(handler, id, ",\"field\":\"parts\",\"offset\":4,\"limit\":" + pageSize)).GetProperty("fields").GetProperty("parts").GetProperty("records");
        Assert.Equal(4, more.GetProperty("rows").GetArrayLength());
        Assert.Equal(4, more.GetProperty("pageSize").GetInt32());
        Assert.Equal(3, fields.GetProperty("events").GetProperty("events").GetArrayLength());
        Assert.Equal(3, fields.GetProperty("changes").GetProperty("changes").GetArrayLength());
        Assert.Equal(CanopyRequestError.LimitExceeded, (await Rejected(handler, id, ",\"field\":\"parts\",\"limit\":5")).Error);
        var small = new CanopyRemoteOptions();
        small.Limits.MaxRecordBytes = 1024;
        var bytes = await Rejected(Handler(kind, small), id);
        Assert.Equal(CanopyRequestError.LimitExceeded, bytes.Error);
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task Identities_MustBeTheKeysCanonicalText(ProviderKind kind) {
        var handler = Handler(kind);
        var asset = Visible(item => item.Id > 10 && item.Id < 100);
        var id = asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal(id, (await Record(handler, id)).GetProperty("id").GetString());
        foreach (var variant in new[] { "0" + id, "+" + id, " " + id, id + " ", id + ".0", id + "e0", "0x" + asset.Id.ToString("X"), "-0", "١٢",
            "99999999999999999999", "2147483648", "-2147483649", id + "\u0000" }) {
            Assert.Equal(CanopyRequestError.RecordNotFound, (await Rejected(handler, variant)).Error);
        }
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task HostileIdentities_AreNotFoundAndNeverEchoed(ProviderKind kind) {
        var handler = Handler(kind);
        foreach (var id in new[] { "1 OR 1=1", "1; DROP TABLE Assets; --", "1' OR '1'='1", "<script>alert(1)</script>", "${7*7}", "%27", new string('9', 4096) }) {
            var error = await Rejected(handler, id);
            Assert.Equal(CanopyRequestError.RecordNotFound, error.Error);
            Assert.DoesNotContain(id, error.Message);
        }
    }

    [Fact]
    public async Task GuidAndTextKeys_MatchExactly() {
        var tags = Enumerable.Range(1, 5).Select(i => new Tag { Id = new Guid(i, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11), Code = "Code-" + i, Note = "note " + i }).ToList();
        foreach (var (key, found, missing) in new[] {
            (Guid: true, Found: tags[2].Id.ToString("D"), Missing: new[] { tags[2].Id.ToString("D").ToUpperInvariant(), tags[2].Id.ToString("B"), tags[2].Id.ToString("N"), "not-a-guid" }),
            (Guid: false, Found: "Code-3", Missing: new[] { "code-3", "CODE-3", "Code-3 ", "Code" })
        }) {
            foreach (var queryable in new[] { false, true }) {
                var handler = Tag.Handler(key, tags, queryable, caseInsensitive: false);
                Assert.Contains("note 3", await handler.RecordAsync(Tag.Query(found)));
                foreach (var id in missing) Assert.Equal(CanopyRequestError.RecordNotFound, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RecordAsync(Tag.Query(id)))).Error);
            }
        }
        // A store whose collation matches other spellings still answers only the exact identity.
        var insensitive = Tag.Handler(false, tags, true, caseInsensitive: true);
        Assert.Contains("note 3", await insensitive.RecordAsync(Tag.Query("Code-3")));
        Assert.Equal(CanopyRequestError.RecordNotFound, (await Assert.ThrowsAsync<CanopyRequestException>(() => insensitive.RecordAsync(Tag.Query("CODE-3")))).Error);
    }

    [Fact]
    public async Task NullableKeysAndNulCharacters_AnswerNotFoundInsteadOfFailing() {
        var tags = Enumerable.Range(1, 4).Select(i => new Tag { Id = new Guid(i, 0, 0, new byte[8]), Code = i == 2 ? "" : "C" + i, Note = "n" + i }).ToList();
        foreach (var queryable in new[] { false, true }) {
            var handler = Tag.Handler(false, tags, queryable, caseInsensitive: false);
            Assert.Equal(CanopyRequestError.RecordNotFound, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RecordAsync(Tag.Query("C3\u0000")))).Error);
            Assert.Contains("n3", await handler.RecordAsync(Tag.Query("C3")));
        }
        var view = Assets.View();
        var nullable = new CanopyColumnMap<Asset>(view).Key(asset => asset.ReplacesId).Column("name", asset => asset.Name);
        var records = new CanopyRecordMap<Asset>(nullable).Field("serial", asset => asset.Serial);
        var withNulls = All.Take(40).ToList();
        var target = withNulls.First(asset => asset.ReplacesId != null && withNulls.Count(other => other.ReplacesId == asset.ReplacesId) == 1);
        var id = target.ReplacesId!.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
        foreach (var provider in new ICanopyRecordProvider[] {
            new CanopyQueryableRecordProvider<Asset>(withNulls.AsQueryable(), records), new CanopyInMemoryRecordProvider<Asset>(records, () => withNulls) }) {
            var handler = new CanopyRemoteHandler(nullable.Schema, new CanopyQueryableProvider<Asset>(withNulls.AsQueryable(), nullable), null, null, provider);
            Assert.Contains("\"id\":\"" + id + "\"", await handler.RecordAsync("{\"view\":\"assets\",\"id\":\"" + id + "\"}"));
        }
    }

    [Fact]
    public async Task ChildRowsThatChangeBetweenCountAndWindow_AnswerStale() {
        var view = Assets.View();
        var columns = new CanopyColumnMap<Shifting>(view).Key(item => item.Id).Column("name", item => item.Name);
        var records = new CanopyRecordMap<Shifting>(columns).Collection("parts", item => item.Parts, list => list.Key(part => part.Id).Column(new CanopyColumn("name", "Part"), part => part.Name));
        var items = new[] { new Shifting { Id = 1, Name = "one" } };
        var handler = new CanopyRemoteHandler(columns.Schema, new CanopyQueryableProvider<Shifting>(items.AsQueryable(), columns), null, null,
            new CanopyQueryableRecordProvider<Shifting>(items.AsQueryable(), records));
        Assert.Equal(CanopyRequestError.StaleRevision, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RecordAsync("{\"view\":\"assets\",\"id\":\"1\",\"field\":\"parts\",\"limit\":50}"))).Error);
    }

    [Fact]
    public async Task RequestsParsedWithLargerLimits_AreRefused() {
        var options = new CanopyRemoteOptions();
        options.Limits.MaxRecordItems = 5;
        var handler = Handler(ProviderKind.Linq, options);
        var request = CanopyRequestParser.ParseRecord(Assets.Query("1"), handler.Records!.Schema);
        Assert.Equal(CanopyRequestError.LimitExceeded, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RecordAsync(request))).Error);
    }

    /// <summary>A record whose child rows grow every time they are read, as rows written between two queries do.</summary>
    public sealed class Shifting {
        private int _reads;
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public List<AssetPart> Parts => Enumerable.Range(1, 3 + _reads++).Select(i => new AssetPart { Id = i, Name = "p" + i }).ToList();
    }

    [Fact]
    public async Task HandlerWithoutRecords_AnswersUnsupported() {
        var map = Assets.Columns(Assets.View());
        var handler = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Asset>(All.AsQueryable(), map));
        Assert.Equal(CanopyRequestError.Unsupported, (await Assert.ThrowsAsync<CanopyRequestException>(() => handler.RecordAsync(Assets.Query("1")))).Error);
    }

    internal static List<AssetPart> OrderedParts(Asset asset) => asset.Parts
        .OrderBy(part => part.Vendor == null ? 1 : 0).ThenBy(part => part.Vendor, StringComparer.Ordinal)
        .ThenBy(part => part.Installed == null ? 1 : 0).ThenByDescending(part => part.Installed).ThenBy(part => part.Id).ToList();
}
