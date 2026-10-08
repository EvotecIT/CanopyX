using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridMapperTests {
    private sealed record Item(string Key, string Name, double Size);

    [Fact]
    public void TypedMappingPreservesStableIdsRawValuesAndDisplayMetadata() {
        var mapper = new CanopyGridMapper<Item>(item => item.Key)
            .AddColumn(new CanopyColumn("name", "Record") { Sortable = true, Ordering = new CanopyGridOrdering(CanopyGridTextOrder.Natural) }, item => item.Name)
            .AddColumn(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number }, item => new CanopyCell(item.Size) { Text = item.Size + " KiB" });
        var view = mapper.CreateView("mapped", "Mapped records", new[] { new Item("stable", "Record", 12) }, view => view.Reporting = new CanopyGridReporting());
        using var json = JsonDocument.Parse(view.ToJson());
        var row = json.RootElement.GetProperty("rows")[0];
        Assert.Equal("stable", row.GetProperty("id").GetString());
        Assert.Equal(12, row.GetProperty("cells").GetProperty("size").GetProperty("value").GetDouble());
        Assert.Equal("12 KiB", row.GetProperty("cells").GetProperty("size").GetProperty("text").GetString());
        var hosted = mapper.CreateView("hosted", "Hosted records", configure: view => { view.Reporting = new CanopyGridReporting(); view.Source = CanopyGridSource.HostedOffset(); });
        var page = new CanopyGridPage("hosted", "revision", 0, 1, 1); page.Rows.Add(mapper.MapRow(new Item("stable", "Record", 12)));
        Assert.Contains("stable", page.ToJson(hosted));
    }

    [Fact]
    public void MappingRejectsDuplicateColumnsAndValidatesDuplicateRecordIds() {
        var mapper = new CanopyGridMapper<Item>(item => item.Key).AddColumn(new CanopyColumn("name", "Record"), item => item.Name);
        Assert.Throws<ArgumentException>(() => mapper.AddColumn(new CanopyColumn("name", "Other"), item => item.Name));
        Assert.Throws<InvalidOperationException>(() => mapper.CreateView("duplicates", "Duplicates", new[] { new Item("same", "A", 1), new Item("same", "B", 2) }));
    }
}
