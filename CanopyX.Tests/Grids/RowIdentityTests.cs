using System.Text.Json;
using CanopyX.Tests.Protocol;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Row identity order and numeric keys: canonical integers order as numbers, before every other id.</summary>
public sealed class RowIdentityTests {
    public sealed class Link {
        public int Index { get; set; }
        public string Source { get; set; } = "";
    }

    private static (string[] Ids, string[] Ordered) Fixture() {
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(RepositoryPaths.Root, "tests", "fixtures", "row-identity-order.json")));
        string[] Read(string name) => fixture.RootElement.GetProperty(name).EnumerateArray().Select(value => value.GetString()!).ToArray();
        return (Read("ids"), Read("ordered"));
    }

    [Fact]
    public void Compare_OrdersTheSharedFixtureLikeTheBrowser() {
        var (ids, ordered) = Fixture();
        var sorted = ids.ToArray();
        Array.Sort(sorted, CanopyRowIdentity.Compare);
        Assert.Equal(ordered, sorted);
        foreach (var left in ids) foreach (var right in ids)
            Assert.Equal(Math.Sign(CanopyRowIdentity.Compare(left, right)), -Math.Sign(CanopyRowIdentity.Compare(right, left)));
    }

    [Fact]
    public void IsInteger_AcceptsOnlyCanonicalDigits() {
        Assert.True(CanopyRowIdentity.IsInteger("0"));
        Assert.True(CanopyRowIdentity.IsInteger("9007199254740993"));
        foreach (var id in new[] { "", "042", "-1", "+1", "1.0", "1e3", "٣", " 1", null }) Assert.False(CanopyRowIdentity.IsInteger(id));
        Assert.Equal("-42", CanopyRowIdentity.Format(-42));
        Assert.Equal("1234567", CanopyRowIdentity.Format(1234567));
    }

    [Fact]
    public void NumericKeys_PreserveVersionOneWireOrderForExistingReaders() {
        Assert.Equal("17", new CanopyGridRow(17L).Id);
        var grid = new CanopyDataGridView<Link>("links", "Links", link => (long)link.Index);
        grid.Column(x => x.Source);
        grid.AddRows(new[] { 10, 2, 1, 100 }.Select(index => new Link { Index = index, Source = "dc" + index }));
        Assert.Equal(new[] { "10", "2", "1", "100" }, grid.View.Rows.Select(row => row.Id));
        var data = new CanopyGridRowData(grid.View, new CanopyRowDataOptions { Format = CanopyRowFormat.Compact });
        using var chunk = JsonDocument.Parse(data.GetChunk(0));
        Assert.Equal(new[] { "1", "10", "100", "2" }, chunk.RootElement.EnumerateArray().Select(row => row[0].GetString()));
        using var document = JsonDocument.Parse(data.ToJson());
        Assert.Equal(1, document.RootElement.GetProperty("rowData").GetProperty("version").GetInt32());
        Assert.True(document.RootElement.GetProperty("rowData").GetProperty("ordered").GetBoolean());
    }

    [Fact]
    public void TypedGrid_TakesAnIntegerKeyThroughTheNumericIdentity() {
        var grid = new CanopyDataGridView<Link>("links", "Links", link => link.Index);
        grid.Column(x => x.Source);
        Assert.Equal("7", grid.Row(new Link { Index = 7 }).Id);
        Assert.Throws<ArgumentNullException>(() => new CanopyDataGridView<Link>("links", "Links", (Func<Link, long>)null!));
    }
}
