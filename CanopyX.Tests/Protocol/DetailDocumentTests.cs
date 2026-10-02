using System.Text.Json.Nodes;
using CanopyX.Rendering;

namespace CanopyX.Tests.Protocol;

/// <summary>
/// A detail row is as tall as its content unless the host gives it a height, and a table detail can give its columns
/// width shares. The runtime reads both from the document, so what the writer emits is the contract.
/// </summary>
public sealed class DetailDocumentTests {
    [Fact]
    public void ToJson_DetailWithoutAHeight_LeavesTheHeightToTheRuntime() {
        var page = new CanopyPage("parent");
        page.Items.Add(new CanopyNode("auto", "Auto") { Detail = new CanopyTableDetail().AddColumns("A", "B").AddRow("1", "2") });
        page.Items.Add(new CanopyNode("fixed", "Fixed") { Detail = new CanopyPropertiesDetail { Height = 3 }.Add("Owner", "Team") });
        var json = page.ToJson();
        var items = JsonNode.Parse(json)!["items"]!.AsArray();

        ProtocolSchema.AssertValid(json, "page with detail rows");
        Assert.Null(items[0]!["detail"]!["height"]);
        Assert.Null(items[0]!["detail"]!["widths"]);
        Assert.Equal(3, items[1]!["detail"]!["height"]!.GetValue<int>());
    }

    [Fact]
    public void ToJson_TableDetailWithColumnWidths_WritesOneSharePerColumn() {
        var table = new CanopyTableDetail("Changes").AddColumns("Setting", "Before", "After").AddRow("Retention", "30 days", "90 days");
        table.ColumnWidths.Add(2);
        table.ColumnWidths.Add(3);
        table.ColumnWidths.Add(3);
        var page = new CanopyPage("parent");
        page.Items.Add(new CanopyNode("changes", "Changes") { Detail = table });
        var json = page.ToJson();

        ProtocolSchema.AssertValid(json, "page with a table detail with widths");
        Assert.Equal("[2,3,3]", JsonNode.Parse(json)!["items"]![0]!["detail"]!["widths"]!.ToJsonString());
    }

    [Theory]
    [InlineData(new[] { 1, 2 })]
    [InlineData(new[] { 1, 2, 3, 4 })]
    [InlineData(new[] { 1, 0, 3 })]
    [InlineData(new[] { 1, 1001, 3 })]
    public void ToJson_TableDetailWithWidthsThatDoNotFitItsColumns_Throws(int[] widths) {
        var table = new CanopyTableDetail().AddColumns("A", "B", "C");
        foreach (var width in widths) {
            table.ColumnWidths.Add(width);
        }

        var page = new CanopyPage("parent");
        page.Items.Add(new CanopyNode("bad", "Bad") { Detail = table });

        Assert.Throws<InvalidOperationException>(() => page.ToJson());
    }

    [Theory]
    [InlineData("\"widths\":[0,1]")]
    [InlineData("\"widths\":[]")]
    [InlineData("\"height\":0")]
    [InlineData("\"height\":41")]
    public void Schema_DetailOutsideItsRanges_IsRejected(string field) {
        var page = "{\"protocol\":\"canopyx/2\",\"type\":\"page\",\"parent\":null,\"offset\":0,\"next\":null,\"items\":[{\"id\":\"d\",\"label\":\"D\","
            + "\"detail\":{\"type\":\"table\",\"columns\":[\"A\",\"B\"],\"rows\":[]," + field + "}}]}";

        Assert.False(ProtocolSchema.Evaluate(page).IsValid);
        ProtocolSchema.AssertValid(page.Replace("," + field, string.Empty), "the same detail without the field");
    }

    [Fact]
    public void Render_TableDetailWithColumnWidths_GivesTheHeadersTheirShare() {
        var view = new CanopyView("v", "View");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var table = new CanopyTableDetail().AddColumns("Setting", "Value").AddRow("Retention", "90 days");
        table.ColumnWidths.Add(3);
        table.ColumnWidths.Add(1);
        view.Roots.Add(new CanopyNode("detail", "Detail") { Detail = table });

        var html = CanopyStaticHtml.Render(view);

        Assert.Contains("width:75%;\">Setting</th>", html);
        Assert.Contains("width:25%;\">Value</th>", html);
    }
}
