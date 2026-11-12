using CanopyX.Rendering;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridActivityPresenterTests {
    private static CanopyDataGridView Jobs() {
        var view = new CanopyDataGridView("jobs", "Scheduled jobs");
        view.Columns.Add(new CanopyColumn("state", "State") {
            Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> { ["Active"] = CanopyTone.Success, ["Error"] = CanopyTone.Danger })
                .WithPill().WithIcons(new Dictionary<string, string> { ["Read-only"] = "🔒" })
        });
        view.Columns.Add(new CanopyColumn("at", "Schedule"));
        view.Columns.Add(new CanopyColumn("next", "Next run") { Kind = CanopyColumnKind.DateTime, Presenter = CanopyGridPresenter.RelativeTime("at") });
        view.Columns.Add(new CanopyColumn("runs", "Recent runs") { Presenter = CanopyGridPresenter.SparklineBars().WithSlots() });
        view.Columns.Add(new CanopyColumn("log", "Log") { Presenter = CanopyGridPresenter.Log(3, levelTones: new Dictionary<string, CanopyTone> { ["SKIP"] = CanopyTone.Warning }) });
        view.Columns.Add(new CanopyColumn("raw", "Raw log") { Presenter = CanopyGridPresenter.Log(split: true) });
        var row = new CanopyGridRow("backup");
        row.Cells["state"] = "Active";
        row.Cells["at"] = "At 02:00";
        row.Cells["next"] = new DateTime(2026, 11, 12, 2, 0, 0, DateTimeKind.Utc);
        var runs = new CanopyCell("3 runs");
        runs.Series.Add(new CanopyCellPeriod("Mon", 42, tone: CanopyTone.Success));
        runs.Series.Add(new CanopyCellPeriod("Tue"));
        runs.Series.Add(new CanopyCellPeriod("Wed", 3, tone: CanopyTone.Danger));
        row.Cells["runs"] = runs;
        var log = new CanopyCell("Backup started\nBackup failed");
        log.Events.Add(new CanopyRecordEvent(new DateTime(2026, 11, 11, 2, 0, 1, DateTimeKind.Utc), "Backup started") { Kind = "INFO" });
        log.Events.Add(new CanopyRecordEvent(new DateTime(2026, 11, 11, 2, 0, 9, DateTimeKind.Utc), "Disk <full>") { Kind = "ERROR" });
        row.Cells["log"] = log;
        row.Cells["raw"] = "02:00:01 INFO Started\r\n02:00:09 ERROR Failed";
        view.Rows.Add(row);
        var locked = new CanopyGridRow("audit");
        locked.Cells["state"] = "Read-only";
        view.Rows.Add(locked);
        return view;
    }

    [Fact]
    public void ActivityPresenters_WriteTheirOptionsWithinTheSchema() {
        var json = Jobs().ToJson();
        ProtocolSchema.AssertValid(json, "relative time, log, state pill and run-history presenters");
        using var document = JsonDocument.Parse(json);
        var columns = document.RootElement.GetProperty("columns");
        var state = columns[0].GetProperty("presenter");
        Assert.Equal("pill", state.GetProperty("style").GetString());
        Assert.Equal("🔒", state.GetProperty("icons").GetProperty("Read-only").GetString());
        Assert.Equal("relativeTime", columns[2].GetProperty("presenter").GetProperty("kind").GetString());
        Assert.Equal("at", columns[2].GetProperty("presenter").GetProperty("secondaryColumn").GetString());
        Assert.True(columns[3].GetProperty("presenter").GetProperty("slots").GetBoolean());
        var log = columns[4].GetProperty("presenter");
        Assert.Equal(3, log.GetProperty("lines").GetInt32());
        Assert.Equal("warning", log.GetProperty("tones").GetProperty("SKIP").GetString());
        Assert.False(log.TryGetProperty("split", out _));
        Assert.True(columns[5].GetProperty("presenter").GetProperty("split").GetBoolean());
        Assert.False(columns[5].GetProperty("presenter").TryGetProperty("lines", out _));
    }

    [Fact]
    public void ActivityPart_IsBoundedOutsideTheEntryPointsAndCarriedByViewsThatUseIt() {
        var part = CanopyX.Html.CanopyHtmlAssets.GetPart("activity");
        Assert.Contains("function gridRenderActivity", part.Script);
        foreach (var runtime in new[] { CanopyX.Html.CanopyRuntime.DataGrid, CanopyX.Html.CanopyRuntime.ReportingGrid })
            Assert.DoesNotContain("function gridRenderActivity", CanopyX.Html.CanopyHtmlAssets.GetScript(runtime));
        Assert.True(SharedGzip(part.Script) + SharedGzip(part.Style!) <= 4096, "The activity part exceeds 4 KiB gzip.");
        Assert.Contains(part, CanopyX.Html.CanopyHtmlAssets.GetRequiredParts(Jobs()));
        var plain = new CanopyDataGridView("plain", "Plain") { Columns = { new CanopyColumn("state", "State") { Presenter = CanopyGridPresenter.State().WithPill() } } };
        Assert.DoesNotContain(part, CanopyX.Html.CanopyHtmlAssets.GetRequiredParts(plain));
    }

    private static long SharedGzip(string text) {
        using var bytes = new MemoryStream();
        using (var gzip = new System.IO.Compression.GZipStream(bytes, System.IO.Compression.CompressionLevel.SmallestSize, true)) gzip.Write(System.Text.Encoding.UTF8.GetBytes(text));
        return bytes.Length;
    }

    [Fact]
    public void ActivityPresenters_RefuseTheWrongColumnsAndOptions() {
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Log(0));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Log(501));
        Assert.Throws<InvalidOperationException>(() => CanopyGridPresenter.Enum().WithPill());
        Assert.Throws<InvalidOperationException>(() => CanopyGridPresenter.SparklineLine().WithSlots());
        Assert.Throws<ArgumentException>(() => CanopyGridPresenter.State().WithIcons(new Dictionary<string, string> { ["Locked"] = " " }));
        foreach (var (kind, presenter) in new[] { (CanopyColumnKind.Text, CanopyGridPresenter.RelativeTime()), (CanopyColumnKind.Number, CanopyGridPresenter.Log()) }) {
            var view = new CanopyDataGridView("wrong", "Wrong");
            view.Columns.Add(new CanopyColumn("value", "Value") { Kind = kind, Presenter = presenter });
            Assert.Throws<InvalidOperationException>(() => view.ToJson());
        }
    }

    [Fact]
    public void StaticOutput_ShowsExactTimesLogBlocksAndDecorativeStateMarks() {
        var result = CanopyStaticHtml.RenderGridWithResult(Jobs());
        var html = System.Net.WebUtility.HtmlDecode(result.Html);
        // Captured text keeps the value: the mark is decorative, the time exact, the log its lines.
        Assert.Equal("Active", result.Rows[0][0]);
        Assert.Equal("2026-11-12 02:00 UTC · At 02:00", result.Rows[0][2]);
        Assert.Equal("2026-11-11 02:00:01Z INFO Backup started\n2026-11-11 02:00:09Z ERROR Disk <full>", result.Rows[0][4]);
        Assert.Equal("02:00:01 INFO Started\n02:00:09 ERROR Failed", result.Rows[0][5]);
        Assert.Equal("Read-only", result.Rows[1][0]);
        Assert.Contains("<span aria-hidden=\"true\">● </span>Active", html);
        Assert.Contains("<span aria-hidden=\"true\">🔒 </span>Read-only", html);
        Assert.Contains("<pre style=\"margin:0;white-space:pre-wrap;", html);
        Assert.Contains("&lt;full&gt;", result.Html);
        Assert.DoesNotContain("<script", result.Html, StringComparison.OrdinalIgnoreCase);
    }
}
