using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

/// <summary>Fixed-group heading templates follow the supported wire contract.</summary>
public sealed class GridHeaderTemplateTests {
    private static CanopyDataGridView View(string? template) {
        var view = new CanopyDataGridView("orders", "Orders") {
            Reporting = new CanopyGridReporting {
                Grouping = new CanopyGridGrouping("region") { HeaderTemplate = template }
            }
        };
        view.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true });
        return view;
    }

    [Fact]
    public void HeaderTemplate_RejectsEmpty() {
        var view = View(string.Empty);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void HeaderTemplate_RejectsWhitespace() {
        var view = View(" \t\r\n ");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void HeaderTemplate_Accepts512CharactersAndPreservesWireText() {
        var template = "{column}: {value} ({count})".PadRight(512, ' ');
        var json = View(template).ToJson();
        ProtocolSchema.AssertValid(json, "512-character group header template");
        using var document = JsonDocument.Parse(json);
        Assert.Equal(template, document.RootElement.GetProperty("reporting").GetProperty("grouping")
            .GetProperty("headerTemplate").GetString());
    }

    [Fact]
    public void HeaderTemplate_Rejects513Characters() {
        var view = View(new string('x', 513));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void HeaderTemplate_AllowsNullAndOmitsWireProperty() {
        var json = View(null).ToJson();
        ProtocolSchema.AssertValid(json, "grouping without a header template");
        using var document = JsonDocument.Parse(json);
        Assert.False(document.RootElement.GetProperty("reporting").GetProperty("grouping")
            .TryGetProperty("headerTemplate", out _));
    }
}
