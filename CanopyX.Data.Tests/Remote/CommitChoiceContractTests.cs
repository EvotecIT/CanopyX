using System.Runtime.Serialization;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Choices accepted by the public commit handler remain writable through the mapped store.</summary>
public sealed class CommitChoiceContractTests {
    [Theory]
    [InlineData("text")]
    [InlineData("number")]
    [InlineData("boolean")]
    [InlineData("date")]
    [InlineData("enum")]
    public async Task OptionalSelect_NoneClearsTheMappedNullableMember(string kind) {
        switch (kind) {
            case "text": await Clears<string?>("Oslo", CanopyColumnKind.Text, new CanopyEditorOption("Oslo")); break;
            case "number": await Clears<int?>(4, CanopyColumnKind.Number, new CanopyEditorOption(4)); break;
            case "boolean": await Clears<bool?>(true, CanopyColumnKind.Text, new CanopyEditorOption(true)); break;
            case "date": await Clears<DateTime?>(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), CanopyColumnKind.DateTime,
                new CanopyEditorOption("2026-01-01T00:00:00Z")); break;
            default: await Clears<Access?>(Access.Read, CanopyColumnKind.Text, new CanopyEditorOption("read")); break;
        }
    }

    private static async Task Clears<T>(T initial, CanopyColumnKind kind, CanopyEditorOption option) {
        var fixture = new Fixture<T>(initial, kind, CanopyCellEditor.Select(new[] { option }));
        var row = await fixture.Commit("null");
        Assert.Equal("saved", row.GetProperty("status").GetString());
        Assert.Equal(default, fixture.Record.Value);
        Assert.Equal(JsonValueKind.Null, row.GetProperty("cells").GetProperty("value").ValueKind);
        Assert.Equal(1, fixture.Store.Saves);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task RequiredSelect_MissingRemainsAnErrorEvenWithAnEmptyChoice(bool includeEmpty, bool emptyText) {
        var editor = includeEmpty ? CanopyCellEditor.Select("", "Oslo") : CanopyCellEditor.Select("Oslo");
        var fixture = new Fixture<string?>("Oslo", CanopyColumnKind.Text, editor, required: true);
        var row = await fixture.Commit(emptyText ? "\"\"" : "null");
        Assert.Equal("Value is required.", row.GetProperty("errors").GetProperty("value").GetString());
        Assert.Equal("Oslo", fixture.Record.Value);
        Assert.Equal(0, fixture.Store.Saves);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task EmptyTextSelect_RequiresAnExplicitEmptyChoice(bool includeEmpty) {
        var editor = includeEmpty ? CanopyCellEditor.Select("", "Oslo") : CanopyCellEditor.Select("Oslo");
        var fixture = new Fixture<string?>("Oslo", CanopyColumnKind.Text, editor);
        var row = await fixture.Commit("\"\"");
        Assert.Equal(includeEmpty ? "saved" : "error", row.GetProperty("status").GetString());
        Assert.Equal(includeEmpty ? "" : "Oslo", fixture.Record.Value);
        Assert.Equal(includeEmpty ? 1 : 0, fixture.Store.Saves);
    }

    [Theory]
    [InlineData("2026-03-04T04:06:07.250Z")]
    [InlineData("2026-03-04T05:06:07.250+01:00")]
    [InlineData("2026-03-04T05:06:07.250123+01:00")]
    public async Task DateSelect_UsesTheListedInstantAtProtocolPrecision(string option) {
        var fixture = new Fixture<DateTime?>(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), CanopyColumnKind.DateTime,
            CanopyCellEditor.Select(option));
        var row = await fixture.Commit("\"2026-03-04T04:06:07.250999Z\"");
        Assert.Equal("saved", row.GetProperty("status").GetString());
        Assert.Equal(new DateTime(2026, 3, 4, 4, 6, 7, 250, DateTimeKind.Utc), fixture.Record.Value);
        Assert.Equal("2026-03-04T04:06:07.250Z", row.GetProperty("cells").GetProperty("value").GetString());
        Assert.Equal(1, fixture.Store.Saves);
    }

    [Fact]
    public async Task DateSelect_UnlistedInstantStillFailsMembership() {
        var initial = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var fixture = new Fixture<DateTime?>(initial, CanopyColumnKind.DateTime, CanopyCellEditor.Select("2026-03-04T04:06:07.250Z"));
        var row = await fixture.Commit("\"2026-03-04T04:06:07.251Z\"");
        Assert.Equal("Choose Value from the list.", row.GetProperty("errors").GetProperty("value").GetString());
        Assert.Equal(initial, fixture.Record.Value);
        Assert.Equal(0, fixture.Store.Saves);
    }

    [Fact]
    public async Task OptionalSelect_NonNullableMemberStillRejectsNone() {
        var fixture = new Fixture<int>(4, CanopyColumnKind.Number, CanopyCellEditor.Select(new[] { new CanopyEditorOption(4) }));
        var row = await fixture.Commit("null");
        Assert.Equal("Value is required.", row.GetProperty("errors").GetProperty("value").GetString());
        Assert.Equal(4, fixture.Record.Value);
        Assert.Equal(0, fixture.Store.Saves);
    }

    [Fact]
    public async Task EmptyNumericSelect_NormalizesToMissingForANullableMember() {
        var fixture = new Fixture<int?>(4, CanopyColumnKind.Number, CanopyCellEditor.Select(new[] { new CanopyEditorOption(4) }));
        var row = await fixture.Commit("\"\"");
        Assert.Equal("saved", row.GetProperty("status").GetString());
        Assert.Null(fixture.Record.Value);
        Assert.Equal(1, fixture.Store.Saves);
    }

    [Theory]
    [InlineData("byte")]
    [InlineData("sbyte")]
    [InlineData("ushort")]
    [InlineData("short")]
    [InlineData("uint")]
    [InlineData("int")]
    [InlineData("ulong")]
    [InlineData("long")]
    public async Task UnnamedFlagsComposite_RoundTripsTheQueryDomainForEveryUnderlyingWidth(string width) {
        switch (width) {
            case "byte": await SavesFlags(ByteFlags.Read, ByteFlags.Read | ByteFlags.High, "Read, High"); break;
            case "sbyte": await SavesFlags(SByteFlags.Read, SByteFlags.Read | SByteFlags.High, "Read, High"); break;
            case "ushort": await SavesFlags(UShortFlags.Read, UShortFlags.Read | UShortFlags.High, "Read, High"); break;
            case "short": await SavesFlags(ShortFlags.Read, ShortFlags.Read | ShortFlags.High, "Read, High"); break;
            case "uint": await SavesFlags(UIntFlags.Read, UIntFlags.Read | UIntFlags.High, "Read, High"); break;
            case "int": await SavesFlags(IntFlags.Read, IntFlags.Read | IntFlags.High, "Read, High"); break;
            case "ulong": await SavesFlags(ULongFlags.Read, ULongFlags.Read | ULongFlags.High, "Read, High"); break;
            default: await SavesFlags(LongFlags.Read, LongFlags.Read | LongFlags.High, "Read, High"); break;
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FlagsComposite_UsesCanonicalDisplayNamesWithOrWithoutSelect(bool select) {
        await SavesFlags(Access.Read, Access.Read | Access.Write, "read, write",
            select ? CanopyCellEditor.Select("read", "write", "read, write") : null);
    }

    [Fact]
    public async Task NamedFlagsComposite_PreservesItsExplicitDisplayName() =>
        await SavesFlags(NamedFlags.Read, NamedFlags.Both, "full access");

    [Fact]
    public async Task NullableFlagsComposite_UsesTheSameCanonicalDomain() =>
        await SavesFlags<Access?>(Access.Read, Access.Read | Access.Write, "read, write");

    [Fact]
    public async Task ImplicitFlagsZero_RoundTripsTheSameDomainAsQueries() =>
        await SavesFlags(ByteFlags.Read, (ByteFlags)0, "0");

    [Fact]
    public async Task MaximumSupportedFlagsDomain_AcceptsItsUnnamedComposite() =>
        await SavesFlags(BoundedFlags.Read, BoundedFlags.Read | BoundedFlags.Write | BoundedFlags.Execute, "Read, Write, Execute");

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SignedAllWithinEightBits_PreservesNamedAndUnnamedValues(bool all) =>
        await SavesFlags(SByteAll.Read, all ? SByteAll.All : SByteAll.Read | SByteAll.Write, all ? "All" : "Read, Write");

    [Fact]
    public void LargerSignedAllDomains_AreRejectedDuringMappingBeforeAWriterCanBeConstructed() {
        RejectsMapping<ShortAll>();
        RejectsMapping<IntAll>();
        RejectsMapping<LongAll>();
    }

    private static void RejectsMapping<T>() {
        var view = new CanopyDataGridView("choices", "Choices");
        view.Columns.Add(new CanopyColumn("value", "Value") { Editable = true });
        var map = new CanopyColumnMap<Record<T>>(view).Key(row => row.Id);
        var error = Assert.Throws<ArgumentException>(() => map.Column("value", row => row.Value));
        Assert.Contains("at most eight bits", error.Message);
    }

    [Theory]
    [InlineData("3")]
    [InlineData("read, admin")]
    [InlineData("read, read")]
    [InlineData("write, read")]
    public async Task FlagsOutsideTheCanonicalDomain_AreRejectedWithoutSaving(string text) {
        var fixture = new Fixture<Access>(Access.Read, CanopyColumnKind.Text);
        var row = await fixture.Commit(JsonSerializer.Serialize(text));
        Assert.Equal("Choose Value from the list.", row.GetProperty("errors").GetProperty("value").GetString());
        Assert.Equal(Access.Read, fixture.Record.Value);
        Assert.Equal(0, fixture.Store.Saves);
    }

    [Fact]
    public async Task SelectChoices_StillRestrictAnOtherwiseValidFlagsComposite() {
        var fixture = new Fixture<Access>(Access.Read, CanopyColumnKind.Text, CanopyCellEditor.Select("read", "write"));
        var row = await fixture.Commit("\"read, write\"");
        Assert.Equal("Choose Value from the list.", row.GetProperty("errors").GetProperty("value").GetString());
        Assert.Equal(Access.Read, fixture.Record.Value);
        Assert.Equal(0, fixture.Store.Saves);
    }

    private static async Task SavesFlags<T>(T initial, T expected, string text, CanopyCellEditor? editor = null) {
        var fixture = new Fixture<T>(initial, CanopyColumnKind.Text, editor);
        var row = await fixture.Commit(JsonSerializer.Serialize(text));
        Assert.Equal("saved", row.GetProperty("status").GetString());
        Assert.Equal(expected, fixture.Record.Value);
        Assert.Equal(text, row.GetProperty("cells").GetProperty("value").GetString());
        Assert.Equal(1, fixture.Store.Saves);
        using var page = JsonDocument.Parse(await fixture.Handler.QueryAsync(
            "{\"filters\":[{\"column\":\"value\",\"operator\":\"eq\",\"values\":[" + JsonSerializer.Serialize(text) + "]}]}"));
        Assert.Equal("1", Assert.Single(page.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetString());
    }

    [Flags] private enum ByteFlags : byte { Read = 1, High = 128 }
    [Flags] private enum SByteFlags : sbyte { Read = 1, High = -128 }
    [Flags] private enum UShortFlags : ushort { Read = 1, High = 32768 }
    [Flags] private enum ShortFlags : short { Read = 1, High = -32768 }
    [Flags] private enum UIntFlags : uint { Read = 1, High = 2147483648 }
    [Flags] private enum IntFlags : int { Read = 1, High = int.MinValue }
    [Flags] private enum ULongFlags : ulong { Read = 1, High = 9223372036854775808 }
    [Flags] private enum LongFlags : long { Read = 1, High = long.MinValue }
    [Flags] private enum Access { None = 0, [EnumMember(Value = "read")] Read = 1, [EnumMember(Value = "write")] Write = 2 }
    [Flags] private enum NamedFlags { Read = 1, Write = 2, [EnumMember(Value = "full access")] Both = 3 }
    [Flags] private enum BoundedFlags : byte { Read = 1, Write = 2, Execute = 4, All = byte.MaxValue }
    [Flags] private enum SByteAll : sbyte { Read = 1, Write = 2, All = -1 }
    [Flags] private enum ShortAll : short { Read = 1, All = -1 }
    [Flags] private enum IntAll : int { Read = 1, All = -1 }
    [Flags] private enum LongAll : long { Read = 1, All = -1 }

    private sealed class Record<T> {
        public int Id { get; set; } = 1;
        public T Value { get; set; } = default!;
    }

    private sealed class Fixture<T> {
        public Fixture(T initial, CanopyColumnKind kind, CanopyCellEditor? editor = null, bool required = false) {
            Record = new Record<T> { Value = initial };
            Store = new Store<T>(Record);
            var view = new CanopyDataGridView("choices", "Choices");
            view.Columns.Add(new CanopyColumn("value", "Value") {
                Kind = kind, Editable = true, Editor = editor, Validation = new CanopyCellValidation { Required = required }
            });
            var map = new CanopyColumnMap<Record<T>>(view).Key(row => row.Id).Column("value", row => row.Value);
            Handler = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Record<T>>(Store.Records, map), null,
                new CanopyQueryableWriter<Record<T>>(map, Store));
        }
        public Record<T> Record { get; }
        public Store<T> Store { get; }
        public CanopyRemoteHandler Handler { get; }
        public async Task<JsonElement> Commit(string jsonValue) {
            var original = JsonSerializer.Serialize(CanopyDataValues.Normalize(Record.Value));
            using var response = JsonDocument.Parse(await Handler.CommitAsync(
                "{\"view\":\"choices\",\"rows\":[{\"id\":\"1\",\"values\":{\"value\":" + jsonValue +
                "},\"original\":{\"value\":" + original + "}}]}"));
            return Assert.Single(response.RootElement.GetProperty("rows").EnumerateArray()).Clone();
        }
    }

    private sealed class Store<T> : ICanopyWriteStore<Record<T>> {
        public Store(Record<T> record) { Records = new[] { record }.AsQueryable(); }
        public IQueryable<Record<T>> Records { get; }
        public int Saves { get; private set; }
        public ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken cancellationToken) => new ValueTask<ICanopyWriteTransaction>(new Transaction());
        public ValueTask SaveChangesAsync(CancellationToken cancellationToken) { Saves++; return default; }
        public void DiscardChanges() { }
    }
    private sealed class Transaction : ICanopyWriteTransaction {
        public ValueTask CommitAsync(CancellationToken cancellationToken) => default;
        public ValueTask RollbackAsync(CancellationToken cancellationToken) => default;
        public ValueTask DisposeAsync() => default;
    }
}
