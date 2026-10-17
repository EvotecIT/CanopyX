using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Parsing and normalizing runtime grouping levels (<c>groupBy</c>) as the browser normalizes its queries.</summary>
public sealed class GroupByParserTests {
    private static readonly CanopyDataSchema Dynamic = Fleet.Map(Fleet.DynamicView()).Schema;
    private static readonly CanopyDataSchema Fixed = Fleet.Map(Fleet.View(grouped: true)).Schema;
    private static readonly CanopyDataSchema Plain = Fleet.Map(Fleet.View()).Schema;

    [Fact]
    public void Levels_LeadTheSortAndKeepTheirAggregates() {
        var request = CanopyRequestParser.ParseQuery("""
            {"groupBy":[{"column":"owner","direction":"desc","aggregate":"memorySum"},{"column":"online","direction":"asc"}],
             "sort":[{"column":"memory","direction":"desc"},{"column":"owner","direction":"asc"}]}
            """, Dynamic);
        Assert.Equal(new[] { "owner", "online" }, request.Levels.Select(level => level.Column.Id));
        Assert.Equal("memorySum", request.Levels[0].Aggregate!.Id);
        Assert.True(request.Levels[0].Descending);
        // An aggregate level keeps its own direction and leads the sort ascending; the reader's sort follows inside the groups.
        Assert.Equal(new[] { "owner:asc", "online:asc", "memory:desc" }, request.Sort.Select(key => key.Column.Id + (key.Descending ? ":desc" : ":asc")));
    }

    [Fact]
    public void SortOfAValueLevel_TurnsItsGroupsAround() {
        var request = CanopyRequestParser.ParseQuery("""{"groupBy":[{"column":"site","direction":"asc"}],"sort":[{"column":"site","direction":"desc"}]}""", Dynamic);
        Assert.True(request.Levels[0].Descending);
        Assert.Equal(new[] { "site:desc" }, request.Sort.Select(key => key.Column.Id + (key.Descending ? ":desc" : ":asc")));
    }

    [Fact]
    public void MissingGroupBy_UsesTheDeclaredLevels_AndAnEmptyListUngroups() {
        var declared = CanopyRequestParser.ParseQuery("{}", Dynamic);
        Assert.Equal(new[] { "site:asc", "os:desc" }, declared.Levels.Select(level => level.Column.Id + (level.Descending ? ":desc" : ":asc")));
        Assert.Equal(new[] { "site", "os" }, declared.Sort.Select(key => key.Column.Id));
        var ungrouped = CanopyRequestParser.ParseQuery("""{"groupBy":[],"sort":[{"column":"site","direction":"desc"}]}""", Dynamic);
        Assert.Empty(ungrouped.Levels);
        Assert.Equal(new[] { "site" }, ungrouped.Sort.Select(key => key.Column.Id));
    }

    [Fact]
    public void FixedGrouping_IsOneLevel() {
        var request = CanopyRequestParser.ParseQuery("""{"sort":[{"column":"name","direction":"asc"}]}""", Fixed);
        var level = Assert.Single(request.Levels);
        Assert.Equal("site", level.Column.Id);
        Assert.Null(level.Aggregate);
        Assert.Empty(CanopyRequestParser.ParseQuery("{}", Plain).Levels);
    }

    [Theory]
    [InlineData("""{"groupBy":{}}""", CanopyRequestError.InvalidGroupBy)]
    [InlineData("""{"groupBy":["site"]}""", CanopyRequestError.InvalidGroupBy)]
    [InlineData("""{"groupBy":[{"column":"site"}]}""", CanopyRequestError.InvalidGroupBy)]
    [InlineData("""{"groupBy":[{"column":"site","direction":"up"}]}""", CanopyRequestError.InvalidGroupBy)]
    [InlineData("""{"groupBy":[{"column":"notes","direction":"asc"}]}""", CanopyRequestError.InvalidGroupBy)]
    [InlineData("""{"groupBy":[{"column":"secret","direction":"asc"}]}""", CanopyRequestError.UnknownColumn)]
    [InlineData("""{"groupBy":[{"column":"site","direction":"asc"},{"column":"site","direction":"desc"}]}""", CanopyRequestError.InvalidGroupBy)]
    [InlineData("""{"groupBy":[{"column":"site","direction":"asc","aggregate":"nope"}]}""", CanopyRequestError.InvalidGroupBy)]
    [InlineData("""{"groupBy":[{"column":"site","direction":"asc"},{"column":"os","direction":"asc"},{"column":"online","direction":"asc"},{"column":"cores","direction":"asc"},{"column":"owner","direction":"asc"}]}""", CanopyRequestError.InvalidGroupBy)]
    public void InvalidLevels_AreRejected(string json, CanopyRequestError error) =>
        Assert.Equal(error, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseQuery(json, Dynamic)).Error);

    [Fact]
    public void ViewsWithoutRuntimeGrouping_RejectGroupBy() {
        Assert.Equal(CanopyRequestError.InvalidGroupBy, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseQuery("""{"groupBy":[]}""", Fixed)).Error);
        Assert.Equal(CanopyRequestError.InvalidGroupBy, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseQuery("""{"groupBy":[{"column":"site","direction":"asc"}]}""", Plain)).Error);
        Assert.Empty(CanopyRequestParser.ParseQuery("""{"groupBy":null}""", Plain).Levels);
    }

    [Fact]
    public void QueryStrings_CarryGroupBy() {
        var request = CanopyRequestParser.ParseQuery(new[] {
            new KeyValuePair<string, string?>("groupBy", """[{"column":"os","direction":"desc"}]"""),
            new KeyValuePair<string, string?>("sort", "name")
        }, Dynamic);
        Assert.Equal("os", Assert.Single(request.Levels).Column.Id);
        Assert.Equal(new[] { "os", "name" }, request.Sort.Select(key => key.Column.Id));
    }

    [Fact]
    public void Schema_RejectsLevelsOverUnmappedColumns() {
        var view = Fleet.DynamicView();
        var map = new CanopyColumnMap<Host>(view).Key(x => x.Id).Column("name", x => x.Name).Column("os", x => x.Os).Column("cores", x => x.Cores)
            .Column("memory", x => x.Memory).Column("owner", x => x.Owner!.Name).Column("lastSeen", x => x.LastSeen);
        Assert.Throws<ArgumentException>(() => map.Schema);
    }
}
