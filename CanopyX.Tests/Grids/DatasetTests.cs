using System.Text.Json;
using CanopyX.Html;
using CanopyX.Tests.Protocol;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>A shared dataset is written once and the views that read it carry only its id.</summary>
public sealed class DatasetTests {
    private static CanopyDataset Orders(int rows = 3) {
        var dataset = CanopyDataset.Inline("orders");
        dataset.Columns.Add(new CanopyColumn("region", "region"));
        dataset.Columns.Add(new CanopyColumn("amount", "amount") { Kind = CanopyColumnKind.Number });
        for (var index = 0; index < rows; index++) {
            dataset.Rows.Add(new CanopyGridRow("o" + index) { Cells = { ["region"] = index % 2 == 0 ? "North" : "South", ["amount"] = index * 10 } });
        }
        return dataset;
    }

    private static CanopyDataGridView View(CanopyDataset dataset, string id = "list") {
        var view = new CanopyDataGridView(id, "Orders") { Source = CanopyGridSource.FromDataset(dataset) };
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        return view;
    }

    [Fact]
    public void Views_NameTheDatasetAndCarryNoRows_WhileTheDatasetCarriesThemOnce() {
        var dataset = Orders();
        var list = View(dataset);
        var json = list.ToJson();
        ProtocolSchema.AssertValid(json, "grid over a dataset");
        ProtocolSchema.AssertValid(dataset.ToJson(), "dataset");
        using var document = JsonDocument.Parse(json);
        Assert.Equal("orders", document.RootElement.GetProperty("source").GetProperty("dataset").GetString());
        Assert.Equal("inline", document.RootElement.GetProperty("source").GetProperty("kind").GetString());
        Assert.False(document.RootElement.TryGetProperty("rows", out _));
        // A grid over a dataset that also carries rows contradicts itself, in the writer and in the schema.
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, node => node["rows"] = System.Text.Json.Nodes.JsonNode.Parse("[{\"id\":\"a\",\"cells\":{}}]"))).IsValid);
        list.Rows.Add(new CanopyGridRow("a"));
        Assert.Throws<InvalidOperationException>(() => list.ToJson());
        using var data = JsonDocument.Parse(dataset.ToJson());
        Assert.Equal("dataset", data.RootElement.GetProperty("type").GetString());
        Assert.Equal(3, data.RootElement.GetProperty("rows").GetArrayLength());
        Assert.Equal("number", data.RootElement.GetProperty("columns")[1].GetProperty("kind").GetString());
    }

    [Fact]
    public void ValidateView_RefusesColumnsTheDatasetLacksOrTypesDifferently() {
        var dataset = Orders();
        dataset.ValidateView(View(dataset));
        var missing = View(dataset); missing.Columns.Add(new CanopyColumn("owner", "Owner"));
        Assert.Throws<InvalidOperationException>(() => dataset.ValidateView(missing));
        var retyped = new CanopyDataGridView("retyped", "Orders") { Source = CanopyGridSource.FromDataset(dataset) };
        retyped.Columns.Add(new CanopyColumn("amount", "Amount"));
        Assert.Throws<InvalidOperationException>(() => dataset.ValidateView(retyped));
        var other = View(Orders()); other.Source = CanopyGridSource.FromDataset(CanopyDataset.Inline("other"));
        Assert.Throws<InvalidOperationException>(() => dataset.ValidateView(other));
    }

    [Fact]
    public void InlineViews_RefuseWritingIntoTheSharedRows() {
        var calculated = View(Orders()); calculated.CalculatedColumnsEditable = true;
        Assert.Throws<InvalidOperationException>(() => calculated.ToJson());
        var editable = View(Orders()); editable.Columns[0].Editable = true;
        Assert.Throws<InvalidOperationException>(() => editable.ToJson());
        // A hosted view writes nothing into shared rows: its host source owns them.
        var hosted = View(CanopyDataset.Hosted("machines")); hosted.Columns[0].Editable = true;
        ProtocolSchema.AssertValid(hosted.ToJson(), "hosted grid over a dataset");
    }

    [Fact]
    public void AddressAndHostedDatasets_CarryNoRows() {
        var address = CanopyDataset.FromUrl("orders", "data/orders.json", TimeSpan.FromMinutes(1));
        address.Columns.Add(new CanopyColumn("amount", "amount") { Kind = CanopyColumnKind.Number });
        var json = address.ToJson();
        ProtocolSchema.AssertValid(json, "address dataset");
        using (var document = JsonDocument.Parse(json)) {
            Assert.Equal("data/orders.json", document.RootElement.GetProperty("url").GetString());
            Assert.Equal(60, document.RootElement.GetProperty("refreshSeconds").GetInt32());
            Assert.False(document.RootElement.TryGetProperty("rows", out _));
        }
        address.Rows.Add(new CanopyGridRow("a"));
        Assert.Throws<InvalidOperationException>(() => address.ToJson());
        Assert.Throws<InvalidOperationException>(() => address.ToRowData());
        var hosted = CanopyDataset.Hosted("machines");
        ProtocolSchema.AssertValid(hosted.ToJson(), "hosted dataset");
        Assert.Equal(CanopyGridSourceKind.Host, CanopyGridSource.FromDataset(hosted).Kind);
        Assert.Throws<ArgumentException>(() => CanopyDataset.FromUrl("bad", "javascript:alert(1)"));
    }

    [Fact]
    public void Fragment_IsAHiddenElementWithCompactChunks_AndTheViewsCarryTheDatasetsPart() {
        var dataset = Orders(250);
        var options = new CanopyHtmlOptions { RowData = new CanopyRowDataOptions { ChunkSize = 100, Format = CanopyRowFormat.Compact } };
        var html = dataset.ToHtmlFragment(options);
        Assert.StartsWith("<div class=\"cx-dataset\" data-cx-dataset=\"orders\" hidden><script type=\"application/json\" class=\"cx-config\">", html);
        Assert.Equal(3, html.Split("<script type=\"application/x-canopyx-rows\">").Length - 1);
        Assert.Contains("x-canopyx-data", html);
        var config = html.Substring(html.IndexOf("cx-config\">", StringComparison.Ordinal) + 11);
        config = config.Substring(0, config.IndexOf("</script>", StringComparison.Ordinal));
        ProtocolSchema.AssertValid(config, "compact dataset");
        using (var document = JsonDocument.Parse(config)) Assert.Equal(250, document.RootElement.GetProperty("rowData").GetProperty("count").GetInt32());
        // Few rows stay row objects, and external assets leave the parts to the page.
        Assert.DoesNotContain("x-canopyx-rows", Orders().ToHtmlFragment(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External }));
        Assert.DoesNotContain("x-canopyx-data", Orders().ToHtmlFragment(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External }));
        var parts = CanopyHtmlAssets.GetRequiredParts(View(dataset)).Select(part => part.Name).ToList();
        Assert.Contains("datasets", parts);
        Assert.Contains("rich-cells", parts);
        Assert.DoesNotContain("datasets", CanopyHtmlAssets.GetRequiredParts(new CanopyDataGridView("own", "Own") { Columns = { new CanopyColumn("a", "A") } }).Select(part => part.Name));
    }
}
