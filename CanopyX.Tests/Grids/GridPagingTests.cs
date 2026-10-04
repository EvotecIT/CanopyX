using System.Text.Json;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridPagingTests {
    [Fact]
    public void Presentation_IsOptionalAndIndependentOfSourceFetchSize() {
        var view = new CanopyGridView("inventory", "Inventory");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        using (var defaults = JsonDocument.Parse(view.ToJson())) {
            Assert.False(defaults.RootElement.TryGetProperty("presentation", out _));
            Assert.Equal("offset", defaults.RootElement.GetProperty("source").GetProperty("navigation").GetString());
        }
        view.Presentation = CanopyGridPresentation.Paged;
        view.PageLength = 25;
        view.PageSize = 7;
        view.Labels.GridPageRange = "{first}–{last} / {count}";
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "paged presentation over an offset source");
        using var document = JsonDocument.Parse(json);
        Assert.Equal("paged", document.RootElement.GetProperty("presentation").GetString());
        Assert.Equal(25, document.RootElement.GetProperty("pageLength").GetInt32());
        Assert.Equal(7, document.RootElement.GetProperty("pageSize").GetInt32());
        Assert.Equal("{first}–{last} / {count}", document.RootElement.GetProperty("labels").GetProperty("gridPageRange").GetString());
        Assert.Throws<ArgumentOutOfRangeException>(() => view.PageLength = 0);
        Assert.Throws<ArgumentOutOfRangeException>(() => view.PageLength = 10001);
        view.Presentation = (CanopyGridPresentation)123;
        Assert.Throws<ArgumentOutOfRangeException>(() => view.ToJson());
    }
}
