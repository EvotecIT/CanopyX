using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// A scheduler dashboard of generic jobs: status pills (a lock for read-only jobs), next and last runs as relative times that
/// keep themselves current, a run history with empty slots and taller failed runs, and each job's log, previewed in the row
/// and complete in the record drawer. Times are relative to when the page was generated.
/// </summary>
internal static class ScheduledJobsExample {
    private static readonly string[] Names = { "Nightly backup", "Certificate renewal", "Index rebuild", "Mailbox export", "Log rotation",
        "Usage report", "Cache warm-up", "Audit archive", "Replica check", "Quota sweep", "Feed import", "Cleanup" };
    private static readonly string[] States = { "Active", "Active", "Error", "Paused", "Active", "Read-only", "Active", "Error", "Active", "Paused", "Active", "Active" };

    internal static void Write(string output) {
        var now = DateTime.UtcNow;
        now = new DateTime(now.Year, now.Month, now.Day, now.Hour, now.Minute, 0, DateTimeKind.Utc);
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark })
            Create(now).SaveHtmlPage(Path.Combine(output, "scheduled-jobs" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"),
                new CanopyHtmlOptions { Title = "Scheduled jobs", Theme = theme });
    }

    internal static CanopyDataGridView Create(DateTime now) {
        var view = new CanopyDataGridView("scheduled-jobs", "Scheduled jobs") { Selection = CanopySelectionMode.Single, Noun = "jobs" };
        view.Columns.Add(new CanopyColumn("name", "Job") { Sortable = true, RowHeader = true, Sizing = CanopyColumnSizing.Preferred(200) });
        view.Columns.Add(new CanopyColumn("state", "State") {
            Sortable = true,
            Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> {
                ["Active"] = CanopyTone.Success, ["Error"] = CanopyTone.Danger, ["Paused"] = CanopyTone.Warning, ["Read-only"] = CanopyTone.Neutral
            }).WithPill().WithIcons(new Dictionary<string, string> { ["Read-only"] = "🔒" })
        });
        view.Columns.Add(new CanopyColumn("schedule", "Schedule") { Hidden = true });
        view.Columns.Add(new CanopyColumn("next", "Next run") { Kind = CanopyColumnKind.DateTime, Sortable = true, Presenter = CanopyGridPresenter.RelativeTime("schedule") });
        view.Columns.Add(new CanopyColumn("last", "Last run") { Kind = CanopyColumnKind.DateTime, Sortable = true, Presenter = CanopyGridPresenter.RelativeTime() });
        view.Columns.Add(new CanopyColumn("runs", "Recent runs") {
            Sizing = CanopyColumnSizing.Preferred(150),
            Presenter = CanopyGridPresenter.SparklineBars(minimum: 0, maximum: 60).WithSlots()
        });
        view.Columns.Add(new CanopyColumn("log", "Latest log") { Sizing = CanopyColumnSizing.Flex(1, 220, 640, preferredWidth: 320), Presenter = CanopyGridPresenter.Log(lines: 6) });
        for (var i = 0; i < Names.Length; i++) {
            var row = new CanopyGridRow("job-" + i.ToString("00", CultureInfo.InvariantCulture));
            var hour = (2 + i * 3) % 24;
            row.Cells["name"] = Names[i];
            row.Cells["state"] = States[i];
            row.Cells["schedule"] = i % 4 == 3 ? "Every 15 min" : "At " + hour.ToString("00", CultureInfo.InvariantCulture) + ":00";
            row.Cells["next"] = States[i] == "Paused" ? new CanopyCell() : new CanopyCell(now.AddMinutes(i % 4 == 3 ? 7 + i : 25 + i * 41));
            row.Cells["last"] = now.AddSeconds(-(27 + i * 1650));
            // Fourteen daily slots: a missing run keeps an empty slot, a failed one is red and stands taller; height is the duration.
            var periods = new List<CanopyCellPeriod>();
            for (var day = 13; day >= 0; day--) {
                var period = now.AddDays(-day).ToString("MMM d", CultureInfo.InvariantCulture);
                if ((day + i) % 6 == 5) { periods.Add(new CanopyCellPeriod(period)); continue; }
                var failed = States[i] == "Error" && day % 4 == 0 || (day * 7 + i) % 17 == 0;
                periods.Add(new CanopyCellPeriod(period, 8 + (day * 13 + i * 7) % 40, failed ? "Failed" : "Succeeded", failed ? CanopyTone.Danger : CanopyTone.Success));
            }
            var runs = new CanopyCell(periods.Count(point => point.State == "Succeeded").ToString(CultureInfo.InvariantCulture) + " of " +
                periods.Count(point => point.State != null).ToString(CultureInfo.InvariantCulture) + " runs succeeded");
            foreach (var period in periods) runs.Series.Add(period);
            row.Cells["runs"] = runs;
            row.Cells["log"] = Log(now.AddSeconds(-(27 + i * 1650)), Names[i], States[i] == "Error", i);
            view.Rows.Add(row);
        }
        return view;
    }

    private static CanopyCell Log(DateTime start, string job, bool failed, int seed) {
        var lines = new List<CanopyRecordEvent> {
            new(start, "Started " + job.ToLowerInvariant() + " on worker-" + (seed % 3 + 1).ToString(CultureInfo.InvariantCulture)) { Kind = "INFO" },
            new(start.AddSeconds(2), "Loaded configuration revision " + (412 + seed).ToString(CultureInfo.InvariantCulture)) { Kind = "DEBUG" },
            new(start.AddSeconds(9), "Processed " + (1200 + seed * 37).ToString("N0", CultureInfo.InvariantCulture) + " items in 4 batches") { Kind = "INFO" }
        };
        if (seed % 3 == 1) lines.Add(new(start.AddSeconds(14), "Batch 3 took longer than the 30 s target; continuing with reduced parallelism") { Kind = "WARN" });
        lines.Add(failed
            ? new(start.AddSeconds(21), "Could not write to the destination share: the remote volume reported insufficient free space (needed 4.2 GB, available 1.1 GB)") { Kind = "ERROR" }
            : new(start.AddSeconds(18), "Completed successfully") { Kind = "INFO" });
        if (seed % 2 == 0) {
            lines.Add(new(start.AddSeconds(19), "Released the job lock") { Kind = "DEBUG" });
            lines.Add(new(start.AddSeconds(20), "Next run scheduled") { Kind = "INFO" });
        }
        var cell = new CanopyCell(string.Join("\n", lines.Select(line => line.Kind + " " + line.Summary)));
        foreach (var line in lines) cell.Events.Add(line);
        return cell;
    }
}
