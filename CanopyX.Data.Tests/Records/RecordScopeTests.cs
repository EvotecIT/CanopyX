using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Navigations kept within the grid, bounded text, keyless child rows and the answer bounds, over the reference and LINQ to objects.</summary>
public sealed class RecordScopeTests {
    private static readonly List<Asset> All = Assets.Create(200, seed: 11);

    public static IEnumerable<object[]> Kinds => new[] { new object[] { ProviderKind.Reference }, new object[] { ProviderKind.Linq } };

    private static CanopyRemoteHandler Handler(ProviderKind kind, CanopyRemoteOptions? options = null, CanopyRecordMap<Asset>? map = null) {
        var records = map ?? Assets.Records(Assets.Columns(Assets.View()));
        ICanopyRecordProvider provider = kind == ProviderKind.Reference
            ? new CanopyInMemoryRecordProvider<Asset>(records, () => Assets.Scoped(All))
            : new CanopyQueryableRecordProvider<Asset>(() => Assets.Scoped(All).AsQueryable(), records);
        return Assets.Handler(records, provider, options);
    }

    private static string Id(Asset asset) => asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture);

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task RelatedRecordsOutsideTheScope_AreNeverShown(ProviderKind kind) {
        var handler = Handler(kind);
        var asset = Assets.Scoped(All).First(item => item.Group != null && item.Group.Members.Any(member => member.Site == "Hidden") && item.Group.Members.Count(member => member.Site != "Hidden") > 1);
        var visiblePeers = asset.Group!.Members.Where(member => member.Site != "Hidden").ToList();
        using var whole = JsonDocument.Parse(await handler.RecordAsync(Assets.Query(Id(asset))));
        var peers = whole.RootElement.GetProperty("fields").GetProperty("peers").GetProperty("records");
        Assert.Equal(visiblePeers.Count, peers.GetProperty("total").GetInt32());
        var shown = peers.GetProperty("rows").EnumerateArray().Select(row => row.GetProperty("id").GetString()).ToList();
        Assert.DoesNotContain(shown, id => asset.Group.Members.Any(member => member.Site == "Hidden" && Id(member) == id));
        using var page = JsonDocument.Parse(await handler.RecordAsync(Assets.Query(Id(asset), ",\"field\":\"peers\",\"offset\":0,\"limit\":200")));
        Assert.Equal(visiblePeers.Select(Id).OrderBy(id => id, StringComparer.Ordinal),
            page.RootElement.GetProperty("fields").GetProperty("peers").GetProperty("records").GetProperty("rows").EnumerateArray().Select(row => row.GetProperty("id").GetString()!).OrderBy(id => id, StringComparer.Ordinal));

        // A link to a record outside the scope is an empty field: neither its identity nor its text is answered.
        var hiddenLink = Assets.Scoped(All).First(item => item.Replaces != null && item.Replaces.Site == "Hidden");
        var text = await handler.RecordAsync(Assets.Query(Id(hiddenLink)));
        Assert.False(JsonDocument.Parse(text).RootElement.GetProperty("fields").TryGetProperty("replaces", out _));
        Assert.DoesNotContain(hiddenLink.Replaces!.Name, text);
        var shownLink = Assets.Scoped(All).First(item => item.Replaces != null && item.Replaces.Site != "Hidden");
        Assert.Contains(shownLink.Replaces!.Name, await handler.RecordAsync(Assets.Query(Id(shownLink))));
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task LongText_IsShortenedWithAnEllipsis_KeysNever(ProviderKind kind) {
        var options = new CanopyRemoteOptions();
        options.Limits.MaxRecordTextLength = 16;
        var handler = Handler(kind, options);
        var asset = Assets.Scoped(All).First(item => item.Notes != null && item.Notes.Length > 16 && item.Replaces != null && item.Replaces.Site != "Hidden");
        using var document = JsonDocument.Parse(await handler.RecordAsync(Assets.Query(Id(asset), ",\"row\":true")));
        var fields = document.RootElement.GetProperty("fields");
        Assert.Equal(asset.Notes!.Substring(0, 16) + "…", fields.GetProperty("notes").GetString());
        Assert.Equal(Id(asset.Replaces!), fields.GetProperty("replaces").GetProperty("ref").GetProperty("id").GetString());
        // The row is the page row, never shortened.
        Assert.Equal(asset.Name, document.RootElement.GetProperty("row").GetProperty("cells").GetProperty("name").GetString());
        var tags = new List<Tag> { new Tag { Id = Guid.NewGuid(), Code = "A-very-long-identity-of-forty-characters", Note = new string('n', 40) } };
        foreach (var queryable in new[] { false, true }) {
            var tagOptions = new CanopyRemoteOptions();
            tagOptions.Limits.MaxRecordTextLength = 16;
            var tagHandler = Tag.Handler(false, tags, queryable, caseInsensitive: false, tagOptions);
            using var tag = JsonDocument.Parse(await tagHandler.RecordAsync(Tag.Query(tags[0].Code)));
            Assert.Equal(tags[0].Code, tag.RootElement.GetProperty("id").GetString());
            Assert.Equal(new string('n', 16) + "…", tag.RootElement.GetProperty("fields").GetProperty("note").GetString());
        }
    }

    [Fact]
    public async Task ChildRowsWithoutAKey_AreLeftOut() {
        var view = Assets.View();
        var columns = new CanopyColumnMap<Holder>(view).Key(item => item.Id).Column("name", item => item.Name);
        var records = new CanopyRecordMap<Holder>(columns).Collection("parts", item => item.Items, list => list.Key(child => child.Code).Column(new CanopyColumn("name", "Name"), child => child.Name));
        var holders = new[] { new Holder { Id = 1, Name = "one", Items = { new Keyed { Code = "a", Name = "A" }, new Keyed { Code = null, Name = "N" }, new Keyed { Code = "", Name = "E" }, new Keyed { Code = "b", Name = "B" } } } };
        foreach (var provider in new ICanopyRecordProvider[] { new CanopyInMemoryRecordProvider<Holder>(records, () => holders), new CanopyQueryableRecordProvider<Holder>(holders.AsQueryable(), records) }) {
            var handler = new CanopyRemoteHandler(columns.Schema, new CanopyQueryableProvider<Holder>(holders.AsQueryable(), columns), null, null, provider);
            using var document = JsonDocument.Parse(await handler.RecordAsync("{\"view\":\"assets\",\"id\":\"1\"}"));
            var list = document.RootElement.GetProperty("fields").GetProperty("parts").GetProperty("records");
            Assert.Equal(2, list.GetProperty("total").GetInt32());
            Assert.Equal(new[] { "a", "b" }, list.GetProperty("rows").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
        }
    }

    [Fact]
    public void Map_KeepsWithinGridToTheGridsTypeAndKey() {
        var columns = Assets.Columns(Assets.View());
        Assert.Throws<ArgumentException>(() => new CanopyRecordMap<Asset>(columns).Collection("parts", asset => asset.Parts, list => list.Key(part => part.Id)
            .Column(new CanopyColumn("name", "Name"), part => part.Name).WithinGrid()));
        Assert.Throws<ArgumentException>(() => new CanopyRecordMap<Asset>(columns).Link("replaces", asset => asset.ReplacesId, view: "other", withinGrid: true));
        Assert.Throws<InvalidOperationException>(() => new CanopyRecordMap<Asset>(columns).Link("replaces", asset => asset.Serial, withinGrid: true).Schema);
        var clash = Assets.View();
        clash.Record!.Fields.Add(new CanopyColumn("site", "Site again"));
        Assert.Throws<ArgumentException>(() => new CanopyRecordMap<Asset>(Assets.Columns(clash)));
    }

    public sealed class Holder {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public List<Keyed> Items { get; } = new List<Keyed>();
    }

    public sealed class Keyed {
        public string? Code { get; set; }
        public string Name { get; set; } = string.Empty;
    }
}
