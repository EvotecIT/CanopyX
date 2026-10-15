using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Row grouping and detail rows ship as lazy parts of the grid entry points, within their own gzip guards.</summary>
public sealed class GroupingPartAssetsTests {
    [Fact]
    public void GroupingParts_StayWithinTheirGuardsAndRequireEachOther() {
        var detail = CanopyHtmlAssets.GetPart("detail-rows");
        var grouping = CanopyHtmlAssets.GetPart("grouping");
        Assert.True(Gzip(detail.Script) + Gzip(detail.Style!) <= 10 * 1024, "The detail rows part is " + (Gzip(detail.Script) + Gzip(detail.Style!)) + " bytes gzip; the guard is 10 KiB.");
        Assert.True(Gzip(grouping.Script) + Gzip(grouping.Style!) <= 14 * 1024, "The grouping part is " + (Gzip(grouping.Script) + Gzip(grouping.Style!)) + " bytes gzip; the guard is 14 KiB.");
        Assert.Equal(new[] { "detail-rows" }, grouping.Requires);
        Assert.Empty(detail.Requires);
        Assert.True(grouping.IsShippedWith(CanopyRuntime.ReportingGrid) && !grouping.IsShippedWith(CanopyRuntime.TreeGrid));
    }

    [Fact]
    public void GroupingCode_LeavesTheReportingEntryPoint() {
        var reporting = CanopyHtmlAssets.GetScript(CanopyRuntime.ReportingGrid);
        Assert.DoesNotContain("function groupSummaryResult(", reporting);
        Assert.DoesNotContain("prepareRowProjection(){", reporting);
        Assert.Contains("function groupSummaryResult(", CanopyHtmlAssets.GetPart("grouping").Script);
        Assert.Contains("prepareRowProjection(){", CanopyHtmlAssets.GetPart("detail-rows").Script);
    }

    [Fact]
    public void SingleFilePages_CarryTheRowPartsOnlyWhenTheGridGroupsOrHasDetails() {
        var grid = new CanopyDataGridView("orders", "Orders") { Reporting = new CanopyGridReporting() };
        grid.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true });
        grid.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        Assert.DoesNotContain("detail-rows", Names(grid));
        grid.Reporting.Detail = new CanopyGridDetail();
        Assert.Equal(new[] { "filter-editor", "export", "detail-rows" }, Names(grid));
        grid.Reporting.Detail = null;
        grid.Reporting.GroupBy.Add(new CanopyGridGroupLevel("region"));
        Assert.Equal(new[] { "filter-editor", "export", "detail-rows", "grouping" }, Names(grid));
        grid.Reporting.GroupBy.Clear();
        grid.Reporting.Aggregates.Add(new CanopyGridAggregate("total", "amount", CanopyGridAggregateOperation.Sum, "Total"));
        Assert.Contains("grouping", Names(grid));
        var fragment = grid.ToHtmlFragment();
        Assert.Contains("application/x-canopyx-grouping", fragment);
        Assert.Contains("application/x-canopyx-detail-rows", fragment);
    }

    private static string[] Names(CanopyDataGridView view) => CanopyHtmlAssets.GetRequiredParts(view).Select(part => part.Name).ToArray();

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
