using CanopyX.Rendering;
using CanopyX.Tests.Protocol;
using Xunit;

namespace CanopyX.Tests;

public sealed class BucketProtocolTests {
    [Fact]
    public void NamedRawCellFiltersRejectBucketOperandsBeforeWritingAQuery() {
        var view = new CanopyDataGridView("analysis", "Records");
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number });
        var query = new CanopyGridQuery(view.Id);
        query.Filters.Add(new CanopyGridFilter("amount", "named", new CanopyCell(1d)) { Bucket = CanopyBucket.FixedWidth(10) });
        Assert.Throws<System.InvalidOperationException>(() => query.ToJson(view));
    }

    [Fact]
    public void BucketDefinitionsQueriesFacetsAndSummariesFollowTheSchemaAndRenderWithoutScripts() {
        var view = new CanopyDataGridView("analysis", "Records by month") { Reporting = new CanopyGridReporting { Groupable = true } };
        view.Columns.Add(new CanopyColumn("at", "Observed") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number });
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("at", bucket: CanopyBucket.Calendar(CanopyBucketKind.Month)));
        view.Reporting.FacetColumns.Add("at");
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Sum, "Total"));
        view.FacetPanel = new CanopyFacetPanel(); view.FacetPanel.Facets.Add(new CanopyFacet("at") { Bucket = CanopyBucket.Calendar(CanopyBucketKind.Month) });
        view.Labels.GridBucket = "Partition";
        ProtocolSchema.AssertValid(view.ToJson(), "bucket view");
        var query = new CanopyGridQuery(view.Id) { Revision = "r1" };
        query.Filters.Add(new CanopyGridFilter("at", CanopyGridFilterOperator.Equal, new CanopyCell(24300d)) { Bucket = CanopyBucket.Calendar(CanopyBucketKind.Month) });
        ProtocolSchema.AssertValid(query.ToJson(view), "bucket filter");
        var facet = new CanopyGridFacetQuery(query, "at") { Bucket = CanopyBucket.Calendar(CanopyBucketKind.Month) };
        ProtocolSchema.AssertValid(facet.ToJson(view), "bucket facet request");
        var page = new CanopyGridFacetPage(view.Id, "r1", "at", 3, 2) { Bucket = facet.Bucket };
        page.Items.Add(new CanopyGridFacetValue(new CanopyCell(24300d), 2)); page.Items.Add(new CanopyGridFacetValue(new CanopyCell(24301d), 1));
        ProtocolSchema.AssertValid(page.ToJson(view), "bucket facet response");
        var summary = new CanopyGridSummary(query, 3);
        var january = new CanopyGridGroup("january", new CanopyCell(24300d), 0, 2); january.Aggregates["sum"] = 30;
        var february = new CanopyGridGroup("february", new CanopyCell(24301d), 2, 1); february.Aggregates["sum"] = 20;
        summary.Groups.Add(january); summary.Groups.Add(february); summary.Aggregates["sum"] = 50;
        ProtocolSchema.AssertValid(summary.ToJson(view), "bucket summary");
        var html = CanopyStaticHtml.RenderGridSummary(view, summary);
        Assert.Contains("2026-01", html); Assert.Contains("2026-02", html); Assert.Contains("Grand total", html); Assert.DoesNotContain("<script", html);
        var bounded = CanopyStaticHtml.RenderGridSummary(view, summary, new CanopyStaticHtmlOptions { MaxRows = 1 });
        Assert.DoesNotContain("2026-02", bounded);
    }
}
