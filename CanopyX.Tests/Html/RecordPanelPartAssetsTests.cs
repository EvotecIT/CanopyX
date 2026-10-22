using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>The record panel ships as one lazy part of every entry point, within its own gzip guard, and single-file pages carry it
/// only when a view uses it.</summary>
public sealed class RecordPanelPartAssetsTests {
    [Fact]
    public void RecordPanelPart_StaysWithinItsGuardAndShipsWithTreeAndGridRuntimes() {
        var part = CanopyHtmlAssets.GetPart("record-panel");
        var size = Gzip(part.Script) + Gzip(part.Style!);
        // Guard: the part's size plus about 15% headroom (docs/plugins.md, size budgets).
        // Combined roadmap integration: its size plus about 15%.
        Assert.True(size <= 22016, "The record panel part is " + size + " bytes gzip; the guard is 21.5 KiB.");
        Assert.Empty(part.Requires);
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid })
            Assert.True(part.IsShippedWith(runtime), "The record panel part ships with " + runtime + ".");
        Assert.Contains("RECORD_IMPL.paint", part.Script);
        Assert.DoesNotContain("RECORD_IMPL.paint =", CanopyHtmlAssets.GetScript(CanopyRuntime.ReportingGrid));
    }

    [Fact]
    public void SingleFilePages_CarryTheRecordPanelOnlyWhenAViewUsesIt() {
        var grid = new CanopyDataGridView("certs", "Certificates");
        grid.Columns.Add(new CanopyColumn("cn", "Common name"));
        grid.Columns.Add(new CanopyColumn("names", "Names"));
        var row = new CanopyGridRow("c1"); row.Cells["cn"] = "app"; row.Cells["names"] = "a";
        grid.Rows.Add(row);
        Assert.DoesNotContain("record-panel", Names(grid));
        // A structured cell, a record link, a structured presenter or a record panel bring the part.
        row.Cells["names"] = CanopyCell.List("a", "b");
        Assert.Contains("record-panel", Names(grid));
        row.Cells["names"] = CanopyCell.Link("a", "c2");
        Assert.Contains("record-panel", Names(grid));
        row.Cells["names"] = "a";
        grid.GetColumn("names").Presenter = CanopyGridPresenter.Structured();
        Assert.Contains("record-panel", Names(grid));
        grid.GetColumn("names").Presenter = null;
        grid.Record = new CanopyRecordPanel();
        Assert.Equal(new[] { "presenters", "filter-editor", "export", "record-panel" }, Names(grid));
        // Record fields with history presenters bring the history part; a tree collection brings the tree tools.
        grid.Record.Fields.Add(new CanopyColumn("trend", "Trend") { Kind = CanopyColumnKind.Number, Presenter = CanopyGridPresenter.SparklineBars() });
        Assert.Contains("history", Names(grid));
        grid.Record.Fields.Add(new CanopyColumn("chain", "Chain"));
        var chain = new CanopyRecordList(); chain.Columns.Add(new CanopyColumn("name", "Name")); chain.Roots.Add(new CanopyNode("n", "Node"));
        row.Fields["chain"] = CanopyCell.Collection(chain);
        Assert.Contains("tree-tools", Names(grid));
        Assert.Contains("application/x-canopyx-record-panel", grid.ToHtmlFragment());

        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        var node = new CanopyNode("a", "A");
        tree.Roots.Add(node);
        Assert.DoesNotContain("record-panel", TreeNames(tree));
        var child = new CanopyNode("b", "B"); child.Cells["name"] = CanopyCell.Link("B", "a");
        node.Children.Add(child);
        Assert.Contains("record-panel", TreeNames(tree));
        node.Children.Clear();
        tree.Record = new CanopyRecordPanel { DeepLink = true };
        Assert.Contains("record-panel", TreeNames(tree));
    }

    private static string[] Names(CanopyDataGridView view) => CanopyHtmlAssets.GetRequiredParts(view).Select(part => part.Name).ToArray();
    private static string[] TreeNames(CanopyTreeView view) => CanopyHtmlAssets.GetRequiredParts(view).Select(part => part.Name).ToArray();

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
