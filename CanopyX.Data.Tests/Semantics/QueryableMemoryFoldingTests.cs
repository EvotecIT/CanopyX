using System.Globalization;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>An in-memory IQueryable filters the values the wire shows: local instants as UTC, lowercase text invariantly.</summary>
public sealed class QueryableMemoryFoldingTests {
    private static CanopyColumnMap<Item> Map() {
        var view = new CanopyDataGridView("items", "Items") { Source = CanopyGridSource.HostedOffset() };
        view.Columns.Add(new CanopyColumn("name", "Name") { Filterable = true });
        view.Columns.Add(new CanopyColumn("seen", "Seen") { Kind = CanopyColumnKind.DateTime, Filterable = true });
        return new CanopyColumnMap<Item>(view).Key(x => x.Id).Column("name", x => x.Name).Column("seen", x => x.Seen);
    }

    [Fact]
    public async Task LocalInstants_FilterAtTheUtcInstantTheyDisplay() {
        var local = new DateTime(2026, 3, 1, 12, 0, 0, DateTimeKind.Local);
        var map = Map();
        var provider = new CanopyQueryableProvider<Item>(new[] { new Item { Id = 1, Name = "a", Seen = local } }.AsQueryable(), map);
        var shown = CanopyDataValues.FormatDate(local);
        var request = CanopyRequestParser.ParseQuery("{\"filters\":[{\"column\":\"seen\",\"operator\":\"eq\",\"values\":[\"" + shown + "\"]}]}", map.Schema);
        Assert.Equal(1, await provider.CountAsync(request, default));
    }

    [Fact]
    public async Task LowercaseComparison_FoldsBothSidesInvariantly() {
        var map = Map();
        var provider = new CanopyQueryableProvider<Item>(new[] { new Item { Id = 1, Name = "ID" } }.AsQueryable(), map,
            new CanopyQueryOptions { TextComparison = CanopyTextComparison.Lowercase });
        var request = CanopyRequestParser.ParseQuery("{\"filters\":[{\"column\":\"name\",\"operator\":\"eq\",\"values\":[\"id\"]}]}", map.Schema);
        var culture = CultureInfo.CurrentCulture;
        try {
            // The Turkish culture lowers I to a dotless ı, which the invariant operand never contains.
            CultureInfo.CurrentCulture = new CultureInfo("tr-TR");
            Assert.Equal(1, await provider.CountAsync(request, default));
        } finally {
            CultureInfo.CurrentCulture = culture;
        }
    }

    public sealed class Item {
        public int Id { get; set; }
        public string? Name { get; set; }
        public DateTime Seen { get; set; }
    }
}
