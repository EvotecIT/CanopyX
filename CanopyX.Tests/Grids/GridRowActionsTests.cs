using System.IO.Compression;
using System.Text;
using System.Text.Json;
using CanopyX.Html;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>The rowActions definition: its document, its checks, the part it brings and its absence from static output.</summary>
public sealed class GridRowActionsTests {
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("jobs", "Jobs");
        view.Columns.Add(new CanopyColumn("name", "Job") { RowHeader = true });
        view.Columns.Add(new CanopyColumn("status", "Status"));
        view.Columns.Add(new CanopyColumn("owner", "Owner"));
        var row = new CanopyGridRow("backup"); row.Cells["name"] = "Nightly backup"; row.Cells["status"] = "Failed"; row.Cells["owner"] = "Operations";
        view.Rows.Add(row);
        return view;
    }

    [Fact]
    public void WriterDescribesTheActionsColumnAndMatchesTheSchema() {
        var view = View();
        var running = CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "Running");
        view.RowActions.Inline = 1;
        view.RowActions.Reveal = CanopyRowActionReveal.Hover;
        view.RowActions.Pinned = false;
        view.RowActions.LockedWhen = CanopyFormatCondition.Where("owner", CanopyFormatOperator.Equal, "System");
        view.RowActions.LockedLabel = "System job";
        view.RowActions.Add(new CanopyRowAction("run", "Run now", CanopyRowActionIcon.Play) { Tone = CanopyRowActionTone.Primary, When = CanopyFormatCondition.Where("status", CanopyFormatOperator.NotEqual, "Running") })
            .Add(new CanopyRowAction("delete", "Delete", CanopyRowActionIcon.Delete) { Tone = CanopyRowActionTone.Danger, DisabledWhen = running, DisabledReason = "Pause it first.", Refresh = true })
            .Add(new CanopyRowAction("note", "Add a note"));
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "row actions");
        using var document = JsonDocument.Parse(json);
        var actions = document.RootElement.GetProperty("rowActions");
        Assert.Equal(1, actions.GetProperty("inline").GetInt32());
        Assert.Equal("hover", actions.GetProperty("reveal").GetString());
        Assert.Equal("none", actions.GetProperty("pin").GetString());
        Assert.Equal("System job", actions.GetProperty("lockedLabel").GetString());
        Assert.Equal("owner", actions.GetProperty("lockedWhen").GetProperty("filters")[0].GetProperty("column").GetString());
        var list = actions.GetProperty("actions");
        Assert.Equal(new[] { "run", "delete", "note" }, list.EnumerateArray().Select(item => item.GetProperty("id").GetString()));
        Assert.Equal("play", list[0].GetProperty("icon").GetString());
        Assert.Equal("primary", list[0].GetProperty("tone").GetString());
        Assert.Equal("danger", list[1].GetProperty("tone").GetString());
        Assert.Equal("Pause it first.", list[1].GetProperty("disabledReason").GetString());
        Assert.True(list[1].GetProperty("refresh").GetBoolean());
        // Defaults stay out of the document.
        Assert.False(list[2].TryGetProperty("icon", out _));
        Assert.False(list[2].TryGetProperty("tone", out _));
        Assert.DoesNotContain("cx-row-actions", json, StringComparison.Ordinal);
    }

    [Fact]
    public void GridWithoutActionsWritesNoColumnAndLoadsNoPart() {
        var view = View();
        Assert.False(JsonDocument.Parse(view.ToJson()).RootElement.TryGetProperty("rowActions", out _));
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "row-actions");
        Assert.DoesNotContain("application/x-canopyx-row-actions", view.ToHtmlPage(), StringComparison.Ordinal);
    }

    [Fact]
    public void ValidationRefusesDuplicatesUndeclaredColumnsAndTheReservedColumnId() {
        var duplicate = View();
        duplicate.RowActions.Add(new CanopyRowAction("run", "Run")).Add(new CanopyRowAction("run", "Run again"));
        Assert.Throws<InvalidOperationException>(duplicate.Validate);

        var undeclared = View();
        undeclared.RowActions.Add(new CanopyRowAction("run", "Run") { When = CanopyFormatCondition.Where("missing", CanopyFormatOperator.Equal, "x") });
        Assert.ThrowsAny<Exception>(undeclared.Validate);

        var reserved = View();
        reserved.Columns.Add(new CanopyColumn(CanopyRowActions.ColumnId, "Mine"));
        reserved.RowActions.Add(new CanopyRowAction("run", "Run"));
        Assert.Throws<InvalidOperationException>(reserved.Validate);

        var many = View();
        for (var index = 0; index < 17; index++) many.RowActions.Add(new CanopyRowAction("a" + index, "Action " + index));
        Assert.Throws<InvalidOperationException>(many.Validate);

        Assert.Throws<ArgumentOutOfRangeException>(() => View().RowActions.Inline = 5);
        Assert.Throws<ArgumentException>(() => new CanopyRowAction("run", " "));
        Assert.Throws<ArgumentException>(() => new CanopyRowAction("run", "Run") { DisabledReason = new string('x', 501) });
    }

    [Fact]
    public void StaticOutputLeavesTheActionsOut() {
        var view = View();
        view.RowActions.Add(new CanopyRowAction("run", "Run this job now", CanopyRowActionIcon.Play));
        var html = CanopyStaticHtml.RenderGrid(view);
        Assert.Contains("Nightly backup", html, StringComparison.Ordinal);
        Assert.DoesNotContain("Run this job now", html, StringComparison.Ordinal);
        Assert.DoesNotContain("<script", html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void PartLoadsOnlyForGridsWithActionsAndStaysWithinItsGzipBudget() {
        var part = CanopyHtmlAssets.GetPart("row-actions");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Equal(new[] { "ui-menu" }, part.Requires);
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }, part.Runtimes);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        var size = Gzip(part.Script) + Gzip(part.Style!);
        Assert.True(size <= 9216, "row-actions uses " + size + " bytes gzip and exceeds its optional-part budget.");
        var view = View();
        view.RowActions.Add(new CanopyRowAction("run", "Run"));
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(view), item => item.Name == "row-actions");
        Assert.Contains("application/x-canopyx-row-actions", view.ToHtmlPage(), StringComparison.Ordinal);
    }

    private static long Gzip(string value) {
        using var stream = new MemoryStream();
        using (var gzip = new GZipStream(stream, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes); }
        return stream.Length;
    }
}
