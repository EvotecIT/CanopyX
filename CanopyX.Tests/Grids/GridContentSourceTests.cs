using System.Text.Json;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Rich cells, footer text cells, group footer templates and rows from an address follow the wire contract.</summary>
public sealed class GridContentSourceTests {
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("orders", "Orders");
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        return view;
    }

    [Fact]
    public void FromHtml_KeepsMarkupAndItsTextAsTheValue() {
        var cell = CanopyCell.FromHtml("<span class=\"badge\">Active</span>&nbsp;<b>now</b><br>next<script>alert(1)</script><!-- note -->");
        Assert.Equal("Active now next", cell.Value);
        Assert.Equal("<span class=\"badge\">Active</span>&nbsp;<b>now</b><br>next<script>alert(1)</script><!-- note -->", cell.Html);
        Assert.Equal("Shown", CanopyCell.FromHtml("<i>x</i>", "Shown").Value);
        // A quoted > belongs to its attribute; a bare < in text is text.
        Assert.Equal("Details", CanopyCell.FromHtml("<span title=\"10 > 5\">Details</span>").Value);
        Assert.Equal("1 < 2 and 3", CanopyCell.FromHtml("1 < 2 <b class='x>y'>and</b> 3").Value);
    }

    [Fact]
    public void RowsFromAnAddress_NeverWriteCompactRowDataAndCarryTheRichCellsPart() {
        var view = View(); view.Source = CanopyGridSource.FromUrl("rows.json");
        Assert.False(CanopyGridRowData.ShouldWrite(view, new CanopyRowDataOptions { Format = CanopyRowFormat.CompactGzip }));
        Assert.Contains(CanopyX.Html.CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "url-rows");
        Assert.Contains(CanopyX.Html.CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "rich-cells");
        var hosted = View(); hosted.Source = CanopyGridSource.HostedOffset();
        Assert.Contains(CanopyX.Html.CanopyHtmlAssets.GetRequiredParts(hosted), part => part.Name == "rich-cells");
        Assert.DoesNotContain(CanopyX.Html.CanopyHtmlAssets.GetRequiredParts(View()), part => part.Name == "rich-cells");
    }

    [Fact]
    public void HtmlCells_WriteMarkupBesideTheirValueAndTheStaticOutlineShowsText() {
        var view = View();
        var row = new CanopyGridRow("a"); row.Cells["name"] = CanopyCell.FromHtml("<b>Alpha</b> <a href=\"https://example.test\">site</a>"); row.Cells["amount"] = 1;
        view.Rows.Add(row);
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "rich cell");
        using var document = JsonDocument.Parse(json);
        var cell = document.RootElement.GetProperty("rows")[0].GetProperty("cells").GetProperty("name");
        Assert.Equal("Alpha site", cell.GetProperty("value").GetString());
        Assert.Equal("<b>Alpha</b> <a href=\"https://example.test\">site</a>", cell.GetProperty("html").GetString());
        var html = CanopyStaticHtml.RenderGrid(view);
        Assert.Contains("Alpha site", html);
        Assert.DoesNotContain("<b>Alpha</b>", html);
    }

    [Fact]
    public void HtmlCells_RejectMarkupOverTheLimit() {
        var view = View();
        var row = new CanopyGridRow("a"); row.Cells["name"] = new CanopyCell("x") { Html = new string('x', 65537) };
        view.Rows.Add(row);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void FooterTextCells_WriteAloneOrBesideAggregatesAndRenderEscaped() {
        var view = View();
        var notes = new CanopyGridFooter("notes", "Notes"); notes.Cells["name"] = "<b>See below</b>";
        var total = new CanopyGridFooter("total", "Total"); total.Cells["name"] = "Total";
        total.Aggregates.Add(new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Sum, "Sum"));
        view.Footers.Add(notes); view.Footers.Add(total);
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["name"] = "A", ["amount"] = 3 } });
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "footer text cells");
        using var document = JsonDocument.Parse(json);
        var footers = document.RootElement.GetProperty("footers");
        Assert.Equal(0, footers[0].GetProperty("aggregates").GetArrayLength());
        Assert.Equal("<b>See below</b>", footers[0].GetProperty("cells").GetProperty("name").GetString());
        Assert.False(footers[1].GetProperty("cells").TryGetProperty("amount", out _));
        var html = CanopyStaticHtml.RenderGrid(view);
        Assert.Contains("&lt;b&gt;See below&lt;/b&gt;", html);
        var totalRow = html.Substring(html.LastIndexOf("<tr><th scope=\"row\"", StringComparison.Ordinal));
        Assert.Contains(">Total</td>", totalRow);
        Assert.Contains(">Sum: 3</td>", totalRow);
    }

    [Theory]
    [InlineData("missing", "x")]
    [InlineData("name", " ")]
    public void FooterTextCells_NeedDeclaredColumnsAndText(string column, string text) {
        var view = View();
        var footer = new CanopyGridFooter("notes", "Notes"); footer.Cells[column] = text; view.Footers.Add(footer);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void Footers_NeedAnAggregateOrText() {
        var view = View(); view.Footers.Add(new CanopyGridFooter("empty", "Empty"));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        var json = ProtocolSchema.Mutate(View().ToJson(), node => node["footers"] = JsonNode("[{\"id\":\"e\",\"label\":\"E\",\"scope\":\"all\",\"aggregates\":[]}]"));
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
    }

    [Fact]
    public void GroupFooterTemplate_IsWrittenAndValidated() {
        var view = View();
        view.Reporting = new CanopyGridReporting { Grouping = new CanopyGridGrouping("name") { FooterTemplate = "{value}: {count}" } };
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "group footer template");
        using var document = JsonDocument.Parse(json);
        Assert.Equal("{value}: {count}", document.RootElement.GetProperty("reporting").GetProperty("grouping").GetProperty("footerTemplate").GetString());
        view.Reporting.Grouping.FooterTemplate = " ";
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Reporting.Grouping.FooterTemplate = new string('x', 513);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void RowsFromAnAddress_WriteTheAddressAndRefreshAndCarryNoRows() {
        var view = View(); view.Source = CanopyGridSource.FromUrl("data/orders.json", TimeSpan.FromMinutes(2));
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "rows from an address");
        // The browser reads the rows, so the document may leave them out, but never carries rows of its own or compact row data.
        ProtocolSchema.AssertValid(ProtocolSchema.Mutate(json, node => node.Remove("rows")), "rows from an address without a rows list");
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, node => node["rows"] = JsonNode("[{\"id\":\"a\",\"cells\":{}}]"))).IsValid);
        void Compact(System.Text.Json.Nodes.JsonObject node) {
            node.Remove("rows");
            node["rowData"] = JsonNode("{\"version\":1,\"columns\":[\"" + node["columns"]![0]!["id"] + "\"],\"count\":0,\"chunks\":0}");
        }
        ProtocolSchema.AssertValid(ProtocolSchema.Mutate(json, node => { Compact(node); ((System.Text.Json.Nodes.JsonObject)node["source"]!).Remove("url"); ((System.Text.Json.Nodes.JsonObject)node["source"]!).Remove("refreshSeconds"); }), "compact rows without an address");
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, Compact)).IsValid);
        using var document = JsonDocument.Parse(json);
        var source = document.RootElement.GetProperty("source");
        Assert.Equal("inline", source.GetProperty("kind").GetString());
        Assert.Equal("data/orders.json", source.GetProperty("url").GetString());
        Assert.Equal(120, source.GetProperty("refreshSeconds").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("rows").GetArrayLength());
        view.Rows.Add(new CanopyGridRow("a"));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        var once = View(); once.Source = CanopyGridSource.FromUrl("https://example.test/rows.json");
        using var single = JsonDocument.Parse(once.ToJson());
        Assert.False(single.RootElement.GetProperty("source").TryGetProperty("refreshSeconds", out _));
    }

    [Fact]
    public void RowsFromAnAddress_RefuseCalculatedColumns() {
        var view = View(); view.Source = CanopyGridSource.FromUrl("rows.json"); view.CalculatedColumnsEditable = true;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("//evil.test/rows.json")]
    [InlineData("file:///c:/rows.json")]
    [InlineData("data\\rows.json")]
    [InlineData("rows\n.json")]
    [InlineData(" ")]
    public void RowsFromAnAddress_RejectUnsafeAddresses(string url) {
        Assert.Throws<ArgumentException>(() => CanopyGridSource.FromUrl(url));
    }

    [Theory]
    [InlineData(4)]
    [InlineData(86401)]
    public void RowsFromAnAddress_RejectRefreshOutsideFiveSecondsToADay(int seconds) {
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridSource.FromUrl("rows.json", TimeSpan.FromSeconds(seconds)));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridSource.FromUrl("rows.json", TimeSpan.FromMilliseconds(5500)));
    }

    private static System.Text.Json.Nodes.JsonNode JsonNode(string json) => System.Text.Json.Nodes.JsonNode.Parse(json)!;
}
