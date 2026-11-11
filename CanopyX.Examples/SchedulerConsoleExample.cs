using System.Globalization;
using System.Reflection;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using CanopyX.Html;
using CanopyX.Html.Ui;

namespace CanopyX.Examples;

/// <summary>
/// "Scheduler console": an operations screen for scheduled jobs. The page (header, summary cards and the mock scheduler) is
/// host HTML; CanopyX draws the tabs, the jobs grid with run-history slots, relative next runs and row actions, the record
/// drawer, the run history with its summary row, live refresh and log detail rows, and the New job form in a drawer. A card
/// filters the jobs grid through the linked-views API. Every action is a proposal the page's mock scheduler answers.
/// </summary>
internal static class SchedulerConsoleExample {
    private static readonly IReadOnlyDictionary<string, CanopyTone> JobTones = new Dictionary<string, CanopyTone> {
        ["Scheduled"] = CanopyTone.Success, ["Running"] = CanopyTone.Info, ["Paused"] = CanopyTone.Warning,
        ["Error"] = CanopyTone.Danger, ["Read-only"] = CanopyTone.Neutral
    };
    private static readonly IReadOnlyDictionary<string, CanopyTone> RunTones = new Dictionary<string, CanopyTone> {
        ["Succeeded"] = CanopyTone.Success, ["Failed"] = CanopyTone.Danger, ["Running"] = CanopyTone.Info
    };
    private static readonly CanopyGridNumberFormat Seconds = new(1, 1, suffix: " s");

    internal static void Write(string output) {
        var now = DateTime.UtcNow;
        now = new DateTime(now.Year, now.Month, now.Day, now.Hour, now.Minute, 0, DateTimeKind.Utc);
        var data = new SchedulerConsoleData(now);
        var template = Resource("CanopyX.Examples.Templates.scheduler-console.html");
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var document = new CanopyHtmlDocument();
            CanopyHtmlOptions Options(string? height, params string[] parts) {
                var options = new CanopyHtmlOptions { Theme = theme, Height = height, Document = document };
                foreach (var part in parts) options.Parts.Add(part);
                return options;
            }
            var tabs = new CanopyTabs("sc-sections", "Scheduler sections");
            tabs.Tabs.Add(new CanopyTab("jobs", "Jobs") { Badge = data.Jobs.Count.ToString(CultureInfo.InvariantCulture), HasFocusableContent = true,
                ContentHtml = Jobs(data).ToHtmlFragment(Options("640px", "link")) });
            tabs.Tabs.Add(new CanopyTab("running", "Running") { Badge = data.Count("Running").ToString(CultureInfo.InvariantCulture), HasFocusableContent = true,
                ContentHtml = LiveBar("running") + Running(data).ToHtmlFragment(Options("360px")) });
            tabs.Tabs.Add(new CanopyTab("history", "History") { Badge = data.Runs24.ToString("N0", CultureInfo.InvariantCulture), HasFocusableContent = true,
                ContentHtml = LiveBar("history") + History(data).ToHtmlFragment(Options("640px")) });
            var page = template.Replace("</head>", CanopyHtmlAssets.FontHead() + "</head>")
                .Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.ReportingGrid))
                .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.ReportingGrid))
                .Replace("{{ui-parts}}", string.Concat(CanopyHtmlAssets.GetParts(CanopyRuntime.ReportingGrid)
                    .Where(part => part.Name.StartsWith("ui-", StringComparison.Ordinal)).Select(part => part.Markup)))
                .Replace("{{theme}}", theme == CanopyTheme.Dark ? "dark" : "light")
                .Replace("{{cards}}", Cards(data))
                .Replace("{{flow}}", NewJob().ToHtmlFragment(Options(null)))
                .Replace("{{tabs}}", tabs.ToHtmlFragment())
                .Replace("{{host-data}}", HostData(data));
            File.WriteAllText(Path.Combine(output, "scheduler-console" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"), ApplyTokenFallbacks(page));
        }
    }

    internal static CanopyDataGridView Jobs(SchedulerConsoleData data) {
        var view = new CanopyDataGridView("sc-jobs", "Jobs") {
            Noun = "jobs", Density = CanopyGridDensity.Comfortable, RowAction = CanopyGridRowAction.Details, PageSize = 100,
            Live = new CanopyGridLive { Flash = true },
            FacetPanel = new CanopyFacetPanel { Position = CanopyFacetPosition.Toolbar }.Add("type").Add("status").Add("group")
        };
        view.Columns.Add(new CanopyColumn("name", "Job") { Sortable = true, RowHeader = true, Wrap = true, Presenter = CanopyGridPresenter.Identifier(), Sizing = CanopyColumnSizing.Flex(1, 200, 420, preferredWidth: 260) });
        view.Columns.Add(new CanopyColumn("group", "Group") { Sortable = true, Hidden = true });
        view.Query = new CanopyGridQuery("sc-jobs");
        view.Query.Sort.Add(new CanopyGridSort("name"));
        view.Columns.Add(new CanopyColumn("type", "Type") { Sortable = true, Presenter = CanopyGridPresenter.Enum(), Sizing = CanopyColumnSizing.Preferred(132), ResponsivePriority = 4 });
        view.Columns.Add(new CanopyColumn("status", "Status") {
            Sortable = true, Sizing = CanopyColumnSizing.Preferred(136), ResponsivePriority = 1,
            Presenter = CanopyGridPresenter.State(JobTones.ToDictionary(pair => pair.Key, pair => pair.Value)).WithPill().WithIcons(new Dictionary<string, string> { ["Read-only"] = "🔒" })
        });
        view.Columns.Add(new CanopyColumn("runs", "Recent runs") { Sizing = CanopyColumnSizing.Preferred(168), Presenter = CanopyGridPresenter.SparklineBars().WithSlots(), ResponsivePriority = 3 });
        view.Columns.Add(new CanopyColumn("next", "Next run") { Kind = CanopyColumnKind.DateTime, Sortable = true, Wrap = true, ResponsivePriority = 2, Presenter = CanopyGridPresenter.RelativeTime(), Sizing = CanopyColumnSizing.Flex(1, 170, 320, preferredWidth: 230) });
        view.Columns.Add(new CanopyColumn("failed24", "Failed runs (24 h)") { Kind = CanopyColumnKind.Number, Hidden = true, ShowInDrawer = false });

        var running = CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "Running");
        view.RowActions.Inline = 2;
        view.RowActions.LockedWhen = CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "Read-only");
        view.RowActions.LockedLabel = "Managed by the platform: read-only";
        view.RowActions
            .Add(new CanopyRowAction("run", "Run now", CanopyRowActionIcon.Play) { Tone = CanopyRowActionTone.Primary, When = CanopyFormatCondition.Where("status", CanopyFormatOperator.In, "Scheduled", "Error") })
            .Add(new CanopyRowAction("pause", "Pause", CanopyRowActionIcon.Pause) { When = CanopyFormatCondition.Where("status", CanopyFormatOperator.In, "Scheduled", "Running", "Error") })
            .Add(new CanopyRowAction("resume", "Resume", CanopyRowActionIcon.Play) { Tone = CanopyRowActionTone.Primary, When = CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "Paused") })
            .Add(new CanopyRowAction("edit", "Edit", CanopyRowActionIcon.Edit))
            .Add(new CanopyRowAction("rerun", "Run with different data", CanopyRowActionIcon.Retry) { DisabledWhen = running, DisabledReason = "Wait for the current run to finish." })
            .Add(new CanopyRowAction("delete", "Delete", CanopyRowActionIcon.Delete) { Tone = CanopyRowActionTone.Danger, DisabledWhen = running, DisabledReason = "Pause the job before deleting it." });

        var record = view.Record = new CanopyRecordPanel { DeepLink = true, HeaderStatus = "status", Actions = CanopyRecordActions.Copy | CanopyRecordActions.Link };
        record.HeaderFacts.Add("type"); record.HeaderFacts.Add("group"); record.HeaderFacts.Add("next");
        record.Fields.Add(new CanopyColumn("recent", "Last 8 runs"));
        record.Fields.Add(new CanopyColumn("trigger", "Trigger"));
        record.Fields.Add(new CanopyColumn("fires", "Next fire times"));
        record.Fields.Add(new CanopyColumn("about", "Description") { Wrap = true });
        record.Fields.Add(new CanopyColumn("owner", "Owner"));
        record.Fields.Add(new CanopyColumn("data", "Job data"));
        record.Fields.Add(new CanopyColumn("retries", "Retries"));
        record.Sections.Add(Section("runs", "Recent runs", "runs", "recent"));
        record.Sections.Add(Section("triggers", "Triggers", "trigger", "fires"));
        record.Sections.Add(Section("job", "Job data", "about", "owner", "retries", "data"));

        foreach (var job in data.Jobs) {
            var row = new CanopyGridRow(job.Id);
            row.Cells["name"] = new CanopyCell(job.Name) { Secondary = job.Group };
            row.Cells["group"] = job.Group;
            row.Cells["type"] = job.Type;
            row.Cells["status"] = job.Status;
            row.Cells["runs"] = Slots(job);
            row.Cells["next"] = job.Next is DateTime next ? new CanopyCell(next) { Secondary = job.Schedule } : new CanopyCell { Text = job.Status == "Paused" ? "Paused" : null, Secondary = job.Schedule };
            row.Cells["failed24"] = job.Failed24;
            row.Fields["recent"] = CanopyCell.Collection(RecentRuns(job));
            row.Fields["trigger"] = CanopyCell.Object(
                new CanopyCellField("Schedule", job.Schedule), new CanopyCellField("Time zone", "UTC"),
                new CanopyCellField("If a run is missed", "Run once at the next opportunity"), new CanopyCellField("Overlapping runs", "Skip while a run is in progress"));
            if (job.Fires.Count > 0) row.Fields["fires"] = CanopyCell.Collection(Fires(job));
            row.Fields["about"] = job.Description;
            row.Fields["owner"] = job.Owner;
            row.Fields["retries"] = job.Status == "Read-only" ? "Managed by the platform" : "3 attempts, backoff from 30 s, doubling";
            row.Fields["data"] = CanopyCell.Object(job.Data.Select(pair => new CanopyCellField(pair.Key, pair.Value)).ToArray());
            view.Rows.Add(row);
        }
        return view;
    }

    // Fourteen slots of the job's latest runs: height is the duration, a failed run is red and stands taller.
    private static CanopyCell Slots(SchedulerConsoleData.Job job) {
        var latest = job.Runs.Skip(Math.Max(0, job.Runs.Count - 14)).ToList();
        var cell = new CanopyCell(latest.Count(run => run.Outcome == "Succeeded").ToString(CultureInfo.InvariantCulture) + " of " +
            latest.Count.ToString(CultureInfo.InvariantCulture) + " recent runs succeeded");
        for (var empty = latest.Count; empty < 14; empty++) cell.Series.Add(new CanopyCellPeriod("No run"));
        foreach (var run in latest)
            cell.Series.Add(new CanopyCellPeriod(run.Started.ToString("MMM d, HH:mm", CultureInfo.InvariantCulture), run.Seconds, run.Outcome, RunTones[run.Outcome]));
        return cell;
    }

    private static CanopyRecordList RecentRuns(SchedulerConsoleData.Job job) {
        var list = new CanopyRecordList { PageLength = 8 };
        list.Columns.Add(new CanopyColumn("outcome", "Outcome") { Presenter = CanopyGridPresenter.State(RunTones.ToDictionary(pair => pair.Key, pair => pair.Value)).WithPill() });
        list.Columns.Add(new CanopyColumn("started", "Started") { Kind = CanopyColumnKind.DateTime, Presenter = CanopyGridPresenter.RelativeTime() });
        list.Columns.Add(new CanopyColumn("duration", "Duration") { Kind = CanopyColumnKind.Number, Format = Seconds });
        foreach (var run in Enumerable.Reverse(job.Runs).Take(8)) {
            var row = new CanopyGridRow(run.Id);
            row.Cells["outcome"] = run.Outcome; row.Cells["started"] = run.Started; row.Cells["duration"] = run.Seconds;
            list.Rows.Add(row);
        }
        return list;
    }

    private static CanopyRecordList Fires(SchedulerConsoleData.Job job) {
        var list = new CanopyRecordList();
        list.Columns.Add(new CanopyColumn("at", "Fires at") { Kind = CanopyColumnKind.DateTime });
        list.Columns.Add(new CanopyColumn("in", "Starts") { Kind = CanopyColumnKind.DateTime, Presenter = CanopyGridPresenter.RelativeTime() });
        for (var i = 0; i < job.Fires.Count; i++) {
            var row = new CanopyGridRow(job.Id + "-fire-" + i.ToString(CultureInfo.InvariantCulture));
            row.Cells["at"] = job.Fires[i]; row.Cells["in"] = job.Fires[i];
            list.Rows.Add(row);
        }
        return list;
    }

    internal static CanopyDataGridView Running(SchedulerConsoleData data) {
        var view = new CanopyDataGridView("sc-running", "Running jobs") {
            Noun = "running jobs", Density = CanopyGridDensity.Comfortable, Search = false, Live = new CanopyGridLive { StableOrder = false }
        };
        view.Columns.Add(new CanopyColumn("name", "Job") { RowHeader = true, Presenter = CanopyGridPresenter.Identifier(), Sizing = CanopyColumnSizing.Flex(1, 200, 420, preferredWidth: 260) });
        view.Columns.Add(new CanopyColumn("started", "Started") { Kind = CanopyColumnKind.DateTime, Presenter = CanopyGridPresenter.RelativeTime(), Sizing = CanopyColumnSizing.Preferred(150) });
        view.Columns.Add(new CanopyColumn("progress", "Progress") { Kind = CanopyColumnKind.Number, Presenter = CanopyGridPresenter.Progress(), Sizing = CanopyColumnSizing.Preferred(180) });
        view.Columns.Add(new CanopyColumn("step", "Step") { Sizing = CanopyColumnSizing.Flex(1, 160, 360, preferredWidth: 220), ResponsivePriority = 3 });
        view.Columns.Add(new CanopyColumn("worker", "Worker") { Sizing = CanopyColumnSizing.Preferred(110), ResponsivePriority = 2 });
        var index = 0;
        foreach (var job in data.Jobs.Where(job => job.RunningSince != null)) {
            var row = new CanopyGridRow("run-" + job.Id);
            var elapsed = (data.Now - job.RunningSince!.Value).TotalSeconds;
            var progress = Math.Clamp((int)Math.Round(elapsed / Math.Max(job.Seconds * 1.4, 60) * 100), 8, 86);
            row.Cells["name"] = new CanopyCell(job.Name) { Secondary = job.Group };
            row.Cells["started"] = job.RunningSince.Value;
            row.Cells["progress"] = progress;
            row.Cells["step"] = "Batch " + (1 + progress / 13).ToString(CultureInfo.InvariantCulture) + " of 8";
            row.Cells["worker"] = "worker-" + (1 + index++ % 4).ToString(CultureInfo.InvariantCulture);
            view.Rows.Add(row);
        }
        return view;
    }

    internal static CanopyDataGridView History(SchedulerConsoleData data) {
        var view = new CanopyDataGridView("sc-history", "Run history") {
            Noun = "runs", Density = CanopyGridDensity.Comfortable, PageSize = 200,
            Live = new CanopyGridLive { Flash = true, BatchMilliseconds = 200 },
            Query = new CanopyGridQuery("sc-history"),
            FacetPanel = new CanopyFacetPanel { Position = CanopyFacetPosition.Toolbar }.Add("outcome").Add("trigger").Add("group"),
            Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = LogView(), Label = "Run log", Print = false } }
        };
        view.Query.Sort.Add(new CanopyGridSort("started", descending: true));
        view.Columns.Add(new CanopyColumn("id", "Run") { Sortable = true, Presenter = CanopyGridPresenter.Identifier(mono: true), Sizing = CanopyColumnSizing.Preferred(116) });
        view.Columns.Add(new CanopyColumn("job", "Job") { Sortable = true, RowHeader = true, Presenter = CanopyGridPresenter.Identifier(), Sizing = CanopyColumnSizing.Flex(1, 190, 400, preferredWidth: 240) });
        view.Columns.Add(new CanopyColumn("group", "Group") { Sortable = true, Hidden = true });
        view.Columns.Add(new CanopyColumn("outcome", "Outcome") {
            Sortable = true, Sizing = CanopyColumnSizing.Preferred(132),
            Presenter = CanopyGridPresenter.State(RunTones.ToDictionary(pair => pair.Key, pair => pair.Value)).WithPill()
        });
        view.Columns.Add(new CanopyColumn("trigger", "Trigger") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(110), ResponsivePriority = 3 });
        view.Columns.Add(new CanopyColumn("started", "Started") { Kind = CanopyColumnKind.DateTime, Sortable = true, Presenter = CanopyGridPresenter.RelativeTime(), Sizing = CanopyColumnSizing.Preferred(150) });
        view.Columns.Add(new CanopyColumn("duration", "Duration") { Kind = CanopyColumnKind.Number, Sortable = true, Format = Seconds, Sizing = CanopyColumnSizing.Preferred(176) });
        view.Columns.Add(new CanopyColumn("worker", "Worker") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(110), ResponsivePriority = 4 });
        view.Columns.Add(new CanopyColumn("ok", "Success rate") { Kind = CanopyColumnKind.Number, Hidden = true, ShowInDrawer = false, Exportable = false });
        view.Columns.Add(new CanopyColumn("failed", "Failures") { Kind = CanopyColumnKind.Number, Hidden = true, ShowInDrawer = false, Exportable = false });

        var summary = new CanopyGridFooter("all", "All matching runs");
        summary.Aggregates.Add(new CanopyGridAggregate("runs", "id", CanopyGridAggregateOperation.Count, "Runs"));
        summary.Aggregates.Add(new CanopyGridAggregate("rate", "ok", CanopyGridAggregateOperation.Average, "average", new CanopyGridNumberFormat(1, 1, suffix: " %")));
        summary.Aggregates.Add(new CanopyGridAggregate("failures", "failed", CanopyGridAggregateOperation.Sum, "total"));
        summary.Aggregates.Add(new CanopyGridAggregate("average", "duration", CanopyGridAggregateOperation.Average, "Avg", Seconds));
        summary.Aggregates.Add(new CanopyGridAggregate("median", "duration", CanopyGridAggregateOperation.Median, "Median", Seconds));
        summary.Aggregates.Add(CanopyGridAggregate.AtPercentile("p95", "duration", 95, "P95", Seconds));
        view.Footers.Add(summary);

        view.RowActions.Inline = 1;
        view.RowActions.Reveal = CanopyRowActionReveal.Hover;
        view.RowActions.Add(new CanopyRowAction("again", "Run again", CanopyRowActionIcon.Retry) {
            DisabledWhen = CanopyFormatCondition.Where("outcome", CanopyFormatOperator.Equal, "Running"), DisabledReason = "This run has not finished yet."
        });

        foreach (var run in data.History) {
            var row = new CanopyGridRow(run.Id);
            row.Cells["id"] = run.Id; row.Cells["job"] = new CanopyCell(run.Job.Name) { Secondary = run.Job.Group }; row.Cells["group"] = run.Job.Group;
            row.Cells["outcome"] = run.Outcome; row.Cells["trigger"] = run.Trigger; row.Cells["started"] = run.Started;
            row.Cells["duration"] = run.Seconds; row.Cells["worker"] = run.Worker;
            row.Cells["ok"] = run.Outcome == "Succeeded" ? 100 : 0; row.Cells["failed"] = run.Outcome == "Failed" ? 1 : 0;
            view.Rows.Add(row);
        }
        return view;
    }

    // The template of each run's detail row: one log cell, filled by the host when the row expands.
    private static CanopyDataGridView LogView() {
        var view = new CanopyDataGridView("sc-run-log", "Run log") { Search = false };
        view.Columns.Add(new CanopyColumn("log", "Log") { Wrap = true, Sizing = CanopyColumnSizing.Flex(1, 280), Presenter = CanopyGridPresenter.Log(lines: 12) });
        return view;
    }

    internal static CanopyFlow NewJob() {
        var flow = new CanopyFlow("sc-new-job", "New job") {
            Description = "The scheduler checks the job, then runs it on its triggers.",
            Container = CanopyFlowContainer.Drawer, LaunchLabel = "New job", Orientation = CanopyFlowOrientation.Vertical,
            Submit = new CanopyFlowSubmit("Create job")
        };
        flow.Step("what", "What should run?", step => step
            .Choice("type", "Job type", f => f
                .Option(new CanopyFlowOption("http", "HTTP request") { Description = "Calls an endpoint and records the response." })
                .Option(new CanopyFlowOption("script", "Script") { Description = "Runs a script on a worker with the job data as arguments." })
                .Option(new CanopyFlowOption("sync", "Data sync") { Description = "Copies records from a source to a target." })
                .Option(new CanopyFlowOption("export", "Export") { Description = "Writes a file and delivers it." })
                .Required().Default("script"))
            .Text("name", "Name", f => f.Required().Length(3, 80).Placeholder("For example: Nightly price export"))
            .Select("group", "Group", f => f.Option("Billing", "Billing").Option("Catalog", "Catalog").Option("Integrations", "Integrations")
                .Option("Maintenance", "Maintenance").Option("Reporting", "Reporting").Required().Default("Catalog").Half())
            .TextArea("description", "Description", f => f.Rows(2).Length(null, 300)));
        flow.Step("when", "When should it run?", step => step
            .Records("triggers", "Triggers", f => f
                .Column("repeat", "Repeat", CanopyFlowRecordColumnKind.Select, column => column.Option("daily", "Every day").Option("weekdays", "Every weekday")
                    .Option("weekly", "Every week").Option("interval", "Every N minutes").Required())
                .Column("at", "At", CanopyFlowRecordColumnKind.Time)
                .Column("minutes", "Minutes", CanopyFlowRecordColumnKind.Number)
                .Count(1, 8).Default(new[] { new Dictionary<string, object?> { ["repeat"] = "daily", ["at"] = "04:00" } })
                .Help("Times are in UTC. Every N minutes uses Minutes and ignores At.")));
        flow.Step("failure", "If a run fails", step => step
            .Number("retries", "Retries", f => f.Range(0, 10).Default(3).Half())
            .Duration("backoff", "First backoff", f => f.Units(CanopyFlowDurationUnit.Seconds, CanopyFlowDurationUnit.Minutes).Default(TimeSpan.FromSeconds(30))
                .Range(TimeSpan.FromSeconds(5), TimeSpan.FromHours(1)).Half().Help("Each retry waits twice as long as the one before."))
            .Toggle("notify", "Notify the owner when retries run out", f => f.Default(true)));
        flow.Review();
        return flow;
    }

    private static CanopyRecordSection Section(string id, string label, params string[] fields) {
        var section = new CanopyRecordSection(id, label);
        foreach (var field in fields) section.Fields.Add(field);
        return section;
    }

    private static string LiveBar(string id) =>
        "<div class=\"sc-bar\" data-sc-bar=\"" + id + "\">" +
        (id == "history" ? "<button type=\"button\" class=\"sc-chip\" data-sc-window aria-pressed=\"true\">Last 24 h</button>" : string.Empty) +
        "<p class=\"sc-live\" role=\"status\"><span class=\"sc-live-dot\" aria-hidden=\"true\"></span><span data-sc-live-text>Refreshes every 10 seconds</span></p>" +
        "<button type=\"button\" class=\"sc-ghost\" data-sc-pause aria-pressed=\"false\">Pause updates</button></div>";

    private static string Cards(SchedulerConsoleData data) {
        string Card(string id, string label, int value, string note, string? tone) =>
            "<button type=\"button\" class=\"sc-card\" data-sc-card=\"" + id + "\" aria-pressed=\"" + (id == "all" ? "true" : "false") + "\">" +
            "<span class=\"sc-card-label\">" + (tone == null ? string.Empty : "<span class=\"sc-tone sc-tone-" + tone + "\" aria-hidden=\"true\"></span>") + label + "</span>" +
            "<span class=\"sc-card-value\" data-sc-count=\"" + id + "\">" + value.ToString(CultureInfo.InvariantCulture) + "</span>" +
            "<span class=\"sc-card-note\">" + note + "</span></button>";
        return Card("all", "Total jobs", data.Jobs.Count, "in 5 groups", null) +
            Card("running", "Running now", data.Count("Running"), "on 4 workers", "info") +
            Card("paused", "Paused", data.Count("Paused"), "skip their triggers", "warn") +
            Card("failed", "Failed (24 h)", data.FailedJobs24, "jobs with a failed run", "bad") +
            Card("readonly", "Read-only", data.Count("Read-only"), "managed by the platform", "neutral") +
            Card("errors", "Errors", data.Count("Error"), "retries ran out", "bad");
    }

    // What the page's mock scheduler starts from: each job's cadence and typical duration, by id.
    private static string HostData(SchedulerConsoleData data) {
        var jobs = data.Jobs.Select(job => new {
            id = job.Id, name = job.Name, group = job.Group, type = job.Type, status = job.Status, every = job.EveryMinutes,
            target = job.Data.Select(pair => pair.Value).FirstOrDefault(value => value.Contains('/')) ?? job.Data[0].Value,
            seconds = job.Seconds, failRate = job.FailRate, failed24 = job.Failed24,
            next = job.Next?.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture), schedule = job.Schedule
        });
        return JsonSerializer.Serialize(new { generated = data.Now.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture), jobs },
            new JsonSerializerOptions { Encoder = JavaScriptEncoder.Default });
    }

    private static string Resource(string name) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name) ?? throw new InvalidOperationException(name + " must be embedded.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    // The host stylesheet reads the shared --hfx-* roles; standalone, it falls back to the values CanopyX itself uses.
    private static string ApplyTokenFallbacks(string page) {
        var values = JsonSerializer.Deserialize<Dictionary<string, string>>(Resource("CanopyX.Examples.Templates.token-fallbacks.json"))!;
        var start = page.IndexOf("<style id=\"sc-host-style\">", StringComparison.Ordinal);
        var end = page.IndexOf("</style>", start, StringComparison.Ordinal);
        var style = Regex.Replace(page.Substring(start, end - start), @"var\((--hfx-[a-z0-9-]+)\)", match => values.TryGetValue(match.Groups[1].Value, out var value)
            ? "var(" + match.Groups[1].Value + "," + value + ")" : match.Value);
        return page.Substring(0, start) + style + page.Substring(end);
    }
}
