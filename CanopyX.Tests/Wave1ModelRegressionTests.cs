using System.Text.Json;
using System.Text.Json.Nodes;
using CanopyX.Html;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests;

public sealed class Wave1ModelRegressionTests {
    private static CanopyDataGridView Grid(string id = "grid") {
        var grid = new CanopyDataGridView(id, "Grid");
        grid.Columns.Add(new CanopyColumn("value", "Value"));
        return grid;
    }

    [Theory]
    [InlineData("not a date")]
    [InlineData("2026-10-01")]
    [InlineData("2026-10-01T12:30:00")]
    [InlineData("2026-02-30T12:30:00Z")]
    public void DatetimeSelect_RejectsChoicesTheEditorCannotSave(string value) {
        var grid = Grid();
        grid.Columns[0].Kind = CanopyColumnKind.DateTime;
        grid.Columns[0].Editable = true;
        grid.Columns[0].Editor = CanopyCellEditor.Select(value);
        Assert.Throws<InvalidOperationException>(() => grid.ToJson());
    }

    [Fact]
    public void DatetimeSelect_AcceptsZonedChoicesAndRejectsBooleanChoices() {
        var grid = Grid();
        grid.Columns[0].Kind = CanopyColumnKind.DateTime;
        grid.Columns[0].Editable = true;
        grid.Columns[0].Editor = CanopyCellEditor.Select("2026-10-01T12:30:00Z", "2026-10-01T14:30:00+02:00");
        ProtocolSchema.AssertValid(grid.ToJson(), "datetime select choices");
        grid.Columns[0].Editor = CanopyCellEditor.Select(new[] { new CanopyEditorOption(true) });
        Assert.Throws<InvalidOperationException>(() => grid.ToJson());
    }

    [Theory]
    [InlineData("duplicate")]
    [InlineData("column")]
    [InlineData("kind")]
    public void HostedPages_RejectInvalidNestedGridRows(string fault) {
        var nested = Grid("nested");
        nested.Columns[0].Kind = CanopyColumnKind.Number;
        var grid = Grid();
        grid.Source = CanopyGridSource.HostedOffset();
        grid.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = nested } };
        var detail = new CanopyGridRowsDetail();
        detail.Rows.Add(new CanopyGridRow("a") { Cells = { ["value"] = 1 } });
        if (fault == "duplicate") detail.Rows.Add(new CanopyGridRow("a"));
        else if (fault == "column") detail.Rows[0].Cells["unknown"] = 1;
        else detail.Rows[0].Cells["value"] = "text";
        var page = new CanopyGridPage("grid", "r1", 0, 1, 1);
        page.Rows.Add(new CanopyGridRow("outer") { Detail = detail });
        Assert.Throws<InvalidOperationException>(() => page.ToJson(grid));
        grid.Source = CanopyGridSource.HostedCursor();
        var cursor = new CanopyGridCursorPage("grid", "r1", 0);
        cursor.Rows.Add(page.Rows[0]);
        Assert.Throws<InvalidOperationException>(() => cursor.ToJson(grid));
    }

    [Fact]
    public void TreeDetails_RejectCyclesAndUndeclaredColumnsBeforeWriting() {
        var grid = Grid();
        var tree = new CanopyTreeView("nested", "Nested");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        grid.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { TreeView = tree } };
        var detail = new CanopyTreeDetail();
        var root = new CanopyNode("a", "A");
        root.Children.Add(root);
        detail.Roots.Add(root);
        grid.Rows.Add(new CanopyGridRow("outer") { Detail = detail });
        Assert.Throws<InvalidOperationException>(() => grid.ToJson());
        root.Children.Clear();
        root.Cells["unknown"] = "No binding";
        Assert.Throws<InvalidOperationException>(() => grid.ToJson());
        root.Cells.Clear();
        tree.Roots.Add(new CanopyNode("template", "Template data"));
        Assert.Throws<InvalidOperationException>(() => grid.ToJson());
    }

    [Fact]
    public void DetailAndRecordIdentifiers_UseTheBrowserCharacterSetAndNestedHeightsAreRejected() {
        var grid = Grid();
        grid.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { Template = "Aé" } };
        Assert.Throws<InvalidOperationException>(() => grid.ToJson());
        grid.Reporting.Detail.Template = "A_name:part-1.2";
        ProtocolSchema.AssertValid(grid.ToJson(), "ASCII detail template");
        Assert.Throws<ArgumentException>(() => new CanopyRecordPanel { DeepLinkKey = "réc" });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridRowsDetail { Height = 1 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyTreeDetail { Height = 1 });
    }

    [Theory]
    [InlineData("presenter")]
    [InlineData("tooltip")]
    [InlineData("tree-total")]
    [InlineData("tree-editor")]
    [InlineData("tree-column")]
    public void RecordCollections_ValidateTheNestedViewContract(string fault) {
        var list = new CanopyRecordList();
        var column = new CanopyColumn("value", "Value");
        list.Columns.Add(column);
        if (fault.StartsWith("tree-", StringComparison.Ordinal)) list.Roots.Add(new CanopyNode("root", "Root"));
        if (fault == "presenter") column.Presenter = CanopyGridPresenter.Link("unknown");
        if (fault == "tooltip") column.Tooltip = "unknown";
        if (fault == "tree-total") list.Total = 0;
        if (fault == "tree-editor") { column.Editable = true; column.Editor = CanopyCellEditor.Text(); }
        if (fault == "tree-column") list.Roots[0].Cells["unknown"] = "Unknown";
        var grid = Grid();
        grid.Rows.Add(new CanopyGridRow("outer") { Cells = { ["value"] = CanopyCell.Collection(list) } });
        Assert.Throws<InvalidOperationException>(() => grid.ToJson());
    }

    [Fact]
    public void CompactRows_CaptureCellsStructuredContentsAndRowPresentationAtConstruction() {
        var grid = Grid();
        var cell = CanopyCell.List("Before", "Other");
        cell.Title = "Original title";
        var row = new CanopyGridRow("r1") { Cells = { ["value"] = cell }, Tone = CanopyTone.Info, ClassName = "before" };
        grid.Rows.Add(row);
        var data = new CanopyGridRowData(grid);
        var captured = data.GetChunk(0);
        cell.Title = "Changed title";
        cell.Items.Clear();
        row.Cells["value"] = "After";
        row.Tone = CanopyTone.Danger;
        row.ClassName = "after";
        Assert.Equal(captured, data.GetChunk(0));
        Assert.Contains("Before", captured);
        Assert.Contains("Original title", captured);
        Assert.Contains("before", captured);
    }

    [Fact]
    public void SidecarRegeneration_RemovesObsoleteRowsAndRecordPacksAndPreservesOtherFiles() {
        var folder = Path.Combine(Path.GetTempPath(), "canopyx-wave1-" + Guid.NewGuid().ToString("N"));
        try {
            var grid = Grid();
            for (var index = 0; index < 201; index++) grid.Rows.Add(new CanopyGridRow("r" + index));
            var first = new CanopyGridRowData(grid, new CanopyRowDataOptions { ChunkSize = 100 }).WriteFiles(folder);
            var rows = Path.Combine(first.DataDirectory, "rows");
            File.WriteAllText(Path.Combine(rows, "notes.js"), "Preserve");
            while (grid.Rows.Count > 1) grid.Rows.RemoveAt(grid.Rows.Count - 1);
            var result = new CanopyGridRowData(grid, new CanopyRowDataOptions { ChunkSize = 100 }).WriteFiles(folder);
            Assert.Equal(1, result.FileCount);
            Assert.True(File.Exists(Path.Combine(rows, "0.js")));
            Assert.False(File.Exists(Path.Combine(rows, "1.js")));
            Assert.False(File.Exists(Path.Combine(rows, "2.js")));
            Assert.Equal("Preserve", File.ReadAllText(Path.Combine(rows, "notes.js")));
            grid.Record = new CanopyRecordPanel { Source = CanopyRecordSource.Sidecar("records/", 8) };
            var old = CanopyRecordSidecar.Write(folder, grid, new[] { new CanopyGridRecord("removed") });
            Assert.Single(old);
            File.WriteAllText(Path.Combine(folder, "records", "notes.js"), "Preserve");
            Assert.Empty(CanopyRecordSidecar.Write(folder, grid, Array.Empty<CanopyGridRecord>()));
            Assert.False(File.Exists(Path.Combine(folder, old[0])));
            Assert.Equal("Preserve", File.ReadAllText(Path.Combine(folder, "records", "notes.js")));
        } finally {
            if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true);
        }
    }

    [Fact]
    public void StaticNestedDetails_ShareTheOuterRowBudgetAndReportOmittedRows() {
        var grid = Grid();
        grid.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = Grid("nested") } };
        var detail = new CanopyGridRowsDetail();
        for (var index = 0; index < 4; index++) detail.Rows.Add(new CanopyGridRow("n" + index) { Cells = { ["value"] = "Nested " + index } });
        grid.Rows.Add(new CanopyGridRow("a") { Detail = detail, Cells = { ["value"] = "Outer A" } });
        grid.Rows.Add(new CanopyGridRow("b") { Detail = detail, Cells = { ["value"] = "Outer B" } });
        var result = CanopyStaticHtml.RenderGridWithResult(grid, options: new CanopyStaticHtmlOptions { MaxRows = 3, OverflowNote = "Shown {shown} of {total}" });
        Assert.Equal(2, result.Rows.Count);
        Assert.Equal("Outer A", Assert.Single(result.Rows[0]));
        Assert.Equal("Value Nested 0 Nested 1", Assert.Single(result.Rows[1]));
        Assert.Contains("Outer A", result.Html);
        Assert.Contains("Nested 1", result.Html);
        Assert.DoesNotContain("Nested 2", result.Html);
        Assert.DoesNotContain("Outer B", result.Html);
        Assert.Contains("Shown 2 of 4", result.Html);
        Assert.Contains("Shown 1 of 2", result.Html);
    }

    [Fact]
    public void StaticFormatting_HidesBarTextAccessiblyAndKeepsMergedTone() {
        var grid = Grid();
        grid.Columns[0].Kind = CanopyColumnKind.Number;
        grid.Rows.Add(new CanopyGridRow("a") { Cells = { ["value"] = 75 } });
        var bar = CanopyFormatStyle.DataBar(CanopyTone.Info, 0, 100);
        bar.Bar!.ShowValue = false;
        grid.FormatRules.Add(CanopyFormatRule.ForCell("bar", "value", bar));
        grid.FormatRules.Add(CanopyFormatRule.ForCell("danger", "value", CanopyFormatStyle.Highlight(CanopyTone.Danger)));
        var html = CanopyStaticHtml.RenderGrid(grid, options: new CanopyStaticHtmlOptions { UseThemeVariables = true });
        Assert.Contains("clip:rect(0,0,0,0)", html);
        Assert.Contains("border:0;\">75</span>", html);
        Assert.Contains("color:color-mix(in srgb,var(--hfx-color-status-bad-fg", html);
        Assert.Contains("75", CanopyStaticHtml.RenderGridWithResult(grid).Rows[0][0]);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"emphasis\":\"strong\"}")]
    [InlineData("{\"icon\":\"none\"}")]
    [InlineData("{\"css\":{}}")]
    public void FormattingSchema_RejectsIneffectiveStyles(string style) {
        var grid = Grid();
        var document = JsonNode.Parse(grid.ToJson())!;
        document["formatRules"] = JsonNode.Parse("[{\"id\":\"invalid\",\"column\":\"value\",\"style\":" + style + "}]");
        Assert.False(ProtocolSchema.Evaluate(document.ToJsonString()).IsValid);
    }

    [Fact]
    public void SingleFileHostedAndOnDemandRecords_EmbedPartsForStructuredPayloads() {
        var grid = Grid();
        grid.Source = CanopyGridSource.HostedOffset();
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(grid), part => part.Name == "record-panel");
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(grid), part => part.Name == "tree-tools");
        grid.Source = CanopyGridSource.Inline();
        grid.Record = new CanopyRecordPanel { Source = CanopyRecordSource.Host() };
        var html = grid.ToHtmlFragment();
        Assert.Contains("application/x-canopyx-record-panel", html);
        Assert.Contains("application/x-canopyx-tree-tools", html);
        var tree = new CanopyTreeView("remote", "Remote") { Source = CanopySource.Remote("api/tree?ref={ref}&cursor={cursor}") };
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(tree), part => part.Name == "record-panel");
    }
}
