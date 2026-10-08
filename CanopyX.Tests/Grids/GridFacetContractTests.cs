using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridFacetContractTests {
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("inventory", "Inventory") { Reporting = new CanopyGridReporting() };
        view.Columns.Add(new CanopyColumn("value", "Value"));
        view.Reporting!.FacetColumns.Add("value");
        return view;
    }

    [Fact]
    public void FacetRequest_CarriesAcceptedRevisionProjectionAndBoundedSearchInTheReportingContract() {
        var view = View();
        ProtocolSchema.AssertValid(view.ToJson(), "facet-capable view");
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        var query = new CanopyGridQuery(view.Id) { Revision = "snapshot", Offset = 400, Limit = 5 };
        var request = new CanopyGridFacetQuery(query, "value") { IncludeCurrentFilter = false, Search = "<script>", Limit = 200 };
        var json = request.ToJson(view);
        ProtocolSchema.AssertValid(json, "facet request");
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal("<script>", root.GetProperty("search").GetString());
        Assert.False(root.GetProperty("includeCurrentFilter").GetBoolean());
        Assert.Equal("snapshot", root.GetProperty("query").GetProperty("revision").GetString());
        Assert.Equal(400, root.GetProperty("query").GetProperty("offset").GetInt32());
        Assert.DoesNotContain("<script>", json);
        query.Revision = null;
        Assert.Throws<InvalidOperationException>(() => request.ToJson(view));
        Assert.Throws<ArgumentOutOfRangeException>(() => request.Limit = 201);
        view.Reporting!.FacetColumns.Add("value");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void FacetResponse_PreservesRawBooleanTextAndMissingBucketsAndAccountsForCompleteCounts() {
        var view = View();
        var result = new CanopyGridFacetPage(view.Id, "snapshot", "value", 4, 3);
        result.Items.Add(new CanopyGridFacetValue(new CanopyCell("true") { Text = "Display label" }, 1));
        result.Items.Add(new CanopyGridFacetValue(true, 2));
        result.Items.Add(new CanopyGridFacetValue(null, 1));
        var json = result.ToJson(view);
        ProtocolSchema.AssertValid(json, "typed facet response");
        using var document = JsonDocument.Parse(json);
        var items = document.RootElement.GetProperty("items");
        Assert.Equal(JsonValueKind.String, items[0].GetProperty("value").ValueKind);
        Assert.Equal(JsonValueKind.True, items[1].GetProperty("value").ValueKind);
        Assert.Equal(JsonValueKind.Null, items[2].GetProperty("value").ValueKind);
        Assert.DoesNotContain("Display label", json);
        result.Items[2] = new CanopyGridFacetValue(null, 2);
        Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
        result.Items[2] = new CanopyGridFacetValue(null, 1);
        result.Items[0] = new CanopyGridFacetValue("TRUE", 1);
        result.Items[1] = new CanopyGridFacetValue("true", 2);
        Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
    }

    [Fact]
    public void FacetResponse_RejectsWrongKindsUnboundColumnsAndInvalidDistinctTotals() {
        var view = View();
        var result = new CanopyGridFacetPage(view.Id, "snapshot", "value", 1, 1);
        result.Items.Add(new CanopyGridFacetValue(42, 1));
        Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
        result.Items[0] = new CanopyGridFacetValue("safe", 1);
        view.Reporting!.FacetColumns.Clear();
        Assert.Throws<InvalidOperationException>(() => result.ToJson(view));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridFacetPage(view.Id, "snapshot", "value", 1, 2));
        Assert.False(ProtocolSchema.Evaluate("{\"protocol\":\"canopyx/2\",\"type\":\"gridFacetQuery\",\"column\":\"value\",\"search\":\"\",\"limit\":201,\"includeCurrentFilter\":true,\"query\":{}}").IsValid);
    }

    [Fact]
    public void Facets_CarryCursorRevisionsAndRejectDuplicateUtcMillisecondBuckets() {
        var view = View(); view.Source = CanopyGridSource.HostedCursor();
        view.Presentation = CanopyGridPresentation.Paged;
        view.Columns[0].Kind = CanopyColumnKind.DateTime;
        var query = new CanopyGridQuery(view.Id) { Revision = "snapshot", Cursor = "next" };
        var request = new CanopyGridFacetQuery(query, "value");
        ProtocolSchema.AssertValid(request.ToJson(view), "cursor facet request");
        using var document = JsonDocument.Parse(request.ToJson(view));
        Assert.Equal("gridCursorQuery", document.RootElement.GetProperty("query").GetProperty("type").GetString());
        var instant = new DateTime(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc);
        var response = new CanopyGridFacetPage(view.Id, "snapshot", "value", 2, 2);
        response.Items.Add(new CanopyGridFacetValue(instant, 1));
        response.Items.Add(new CanopyGridFacetValue(new DateTimeOffset(instant).ToOffset(TimeSpan.FromHours(2)).AddTicks(9999), 1));
        Assert.Throws<InvalidOperationException>(() => response.ToJson(view));
        response.Items[1] = new CanopyGridFacetValue(instant.AddMilliseconds(1), 1);
        ProtocolSchema.AssertValid(response.ToJson(view), "distinct UTC millisecond facets");
    }
}
