using System.Globalization;

namespace CanopyX.Examples;

/// <summary>
/// The invented operations data behind the scheduler console: 28 jobs in five groups, their triggers, their runs over the last
/// 30 hours and the counts the page's summary cards show. The host computes every status, count and run outcome here; the
/// views only show them.
/// </summary>
internal sealed class SchedulerConsoleData {
    internal const int HistoryHours = 30;
    private static readonly CultureInfo English = CultureInfo.GetCultureInfo("en-US");

    internal sealed class Job {
        internal Job(string id, string name, string group, string type, string status, string owner, string description) {
            Id = id; Name = name; Group = group; Type = type; Status = status; Owner = owner; Description = description;
        }
        internal string Id { get; }
        internal string Name { get; }
        internal string Group { get; }
        internal string Type { get; }
        internal string Status { get; }
        internal string Owner { get; }
        internal string Description { get; }
        internal int? EveryMinutes { get; init; }
        internal CanopyRecurrence? Rule { get; init; }
        internal DateTime RuleStart { get; init; }
        internal double Seconds { get; init; } = 4;
        internal double FailRate { get; init; } = 0.01;
        internal double PausedHoursAgo { get; init; }
        internal IReadOnlyList<(string Key, string Value)> Data { get; init; } = Array.Empty<(string, string)>();
        internal string Schedule { get; set; } = string.Empty;
        internal DateTime? Next { get; set; }
        internal List<Run> Runs { get; } = new();
        internal List<DateTime> Fires { get; } = new();
        internal DateTime? RunningSince { get; set; }
        internal int Failed24 { get; set; }
    }

    internal sealed record Run(string Id, Job Job, DateTime Started, double Seconds, string Outcome, string Trigger, string Worker);

    internal SchedulerConsoleData(DateTime now) {
        Now = now;
        Jobs = CreateJobs();
        var all = new List<Run>();
        for (var index = 0; index < Jobs.Count; index++) Plan(Jobs[index], index, all);
        // Run numbers follow start times across every job, as the scheduler's own counter would.
        var ordered = all.OrderBy(run => run.Started).ThenBy(run => run.Job.Id, StringComparer.Ordinal).ToList();
        var numbered = ordered.Select((run, index) => run with { Id = "R-" + (48100 + index).ToString(CultureInfo.InvariantCulture) }).ToList();
        foreach (var job in Jobs) {
            job.Runs.Clear();
            job.Runs.AddRange(numbered.Where(run => run.Job == job));
            job.Failed24 = job.Runs.Count(run => run.Outcome == "Failed" && run.Started >= now.AddHours(-24));
        }
        History = numbered.Where(run => run.Started >= now.AddHours(-HistoryHours)).ToList();
    }

    internal DateTime Now { get; }
    internal IReadOnlyList<Job> Jobs { get; }
    internal IReadOnlyList<Run> History { get; }
    internal int Count(string status) => Jobs.Count(job => job.Status == status);
    internal int FailedJobs24 => Jobs.Count(job => job.Failed24 > 0);
    internal int Runs24 => History.Count(run => run.Started >= Now.AddHours(-24));

    private IReadOnlyList<Job> CreateJobs() {
        var weekStart = new DateTime(2026, 1, 4, 0, 0, 0, DateTimeKind.Utc); // a Sunday
        CanopyRecurrence Daily() => CanopyRecurrence.Daily();
        DateTime At(int hour, int minute, int days = 0) => weekStart.AddDays(days).AddHours(hour).AddMinutes(minute);
        return new List<Job> {
            new("billing-invoices", "Invoice run", "Billing", "Export", "Scheduled", "Finance systems", "Builds the day's invoices and hands them to the mail queue.") {
                Rule = CanopyRecurrence.Weekly(DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday), RuleStart = At(2, 0, 1), Seconds = 182,
                Data = new[] { ("format", "pdf"), ("destination", "queue://mail/invoices"), ("batchSize", "500") } },
            new("billing-retries", "Payment retries", "Billing", "HTTP request", "Scheduled", "Finance systems", "Retries card payments that the gateway declined softly.") {
                EveryMinutes = 30, Seconds = 11, FailRate = 0.04,
                Data = new[] { ("method", "POST"), ("url", "https://payments.example.com/v2/retries"), ("timeout", "30 s") } },
            new("billing-dunning", "Dunning emails", "Billing", "Script", "Scheduled", "Finance systems", "Sends reminders for invoices that are past due.") {
                Rule = Daily(), RuleStart = At(9, 0), Seconds = 46,
                Data = new[] { ("script", "jobs/billing/send-dunning.ps1"), ("args", "-Stage reminder"), ("dryRun", "false") } },
            new("billing-tax", "Tax rate sync", "Billing", "Data sync", "Scheduled", "Finance systems", "Pulls the current tax rates for every region the shop sells to.") {
                Rule = CanopyRecurrence.Weekly(DayOfWeek.Monday), RuleStart = At(5, 0, 1), Seconds = 38,
                Data = new[] { ("source", "https://rates.example.net/v1/vat"), ("target", "billing.tax_rates"), ("mode", "replace") } },
            new("billing-metering", "Usage metering", "Billing", "Data sync", "Scheduled", "Platform team", "Rolls raw usage events up into billable units.") {
                EveryMinutes = 5, Seconds = 3.2, FailRate = 0.006,
                Data = new[] { ("source", "events.usage_raw"), ("target", "billing.usage_hourly"), ("window", "5 min") } },
            new("billing-ledger", "Revenue ledger close", "Billing", "Export", "Read-only", "Finance systems", "Closes the previous month in the revenue ledger. Managed by the finance platform.") {
                Rule = CanopyRecurrence.Monthly().OnMonthDays(1), RuleStart = At(1, 0, -3), Seconds = 640,
                Data = new[] { ("format", "parquet"), ("destination", "s3://ledger-archive/monthly"), ("approval", "required") } },

            new("catalog-prices", "Price index rebuild", "Catalog", "Script", "Scheduled", "Catalog team", "Recomputes the price index that search and listings sort by.") {
                EveryMinutes = 15, Seconds = 27, FailRate = 0.01,
                Data = new[] { ("script", "jobs/catalog/rebuild-price-index.ps1"), ("args", "-Incremental"), ("parallelism", "4") } },
            new("catalog-thumbnails", "Image thumbnails", "Catalog", "Script", "Running", "Catalog team", "Renders thumbnails for newly uploaded product images.") {
                EveryMinutes = 10, Seconds = 74, FailRate = 0.02,
                Data = new[] { ("script", "jobs/catalog/render-thumbnails.ps1"), ("sizes", "160, 320, 640"), ("format", "webp") } },
            new("catalog-supplier", "Supplier feed import", "Catalog", "Data sync", "Scheduled", "Catalog team", "Imports the hourly product feeds from suppliers.") {
                EveryMinutes = 60, Seconds = 96, FailRate = 0.05,
                Data = new[] { ("source", "sftp://feeds.example.net/suppliers"), ("target", "catalog.staging_products"), ("validate", "true") } },
            new("catalog-stock", "Stock level sync", "Catalog", "Data sync", "Running", "Catalog team", "Keeps stock levels in step with the warehouse system.") {
                EveryMinutes = 5, Seconds = 8.5, FailRate = 0.008,
                Data = new[] { ("source", "https://wms.example.com/api/stock"), ("target", "catalog.stock_levels"), ("mode", "merge") } },
            new("catalog-search", "Search reindex", "Catalog", "Script", "Scheduled", "Search team", "Rebuilds the full search index from the catalog.") {
                Rule = Daily(), RuleStart = At(3, 30), Seconds = 1260,
                Data = new[] { ("script", "jobs/search/reindex.ps1"), ("args", "-Full -Swap"), ("shards", "6") } },
            new("catalog-sweep", "Discontinued items sweep", "Catalog", "Script", "Scheduled", "Catalog team", "Hides products that suppliers have discontinued.") {
                Rule = CanopyRecurrence.Weekly(DayOfWeek.Sunday), RuleStart = At(4, 0), Seconds = 58,
                Data = new[] { ("script", "jobs/catalog/sweep-discontinued.ps1"), ("graceDays", "14") } },

            new("int-crm", "CRM contacts sync", "Integrations", "Data sync", "Error", "Integrations team", "Two-way sync of customer contacts with the CRM.") {
                EveryMinutes = 15, Seconds = 41, FailRate = 0.03,
                Data = new[] { ("source", "https://crm.example.com/api/contacts"), ("target", "customers.contacts"), ("conflicts", "newest wins") } },
            new("int-webhooks", "Webhook redelivery", "Integrations", "HTTP request", "Scheduled", "Integrations team", "Redelivers webhooks that partners failed to acknowledge.") {
                EveryMinutes = 10, Seconds = 6.4, FailRate = 0.03,
                Data = new[] { ("method", "POST"), ("url", "https://hooks.example.com/redeliver"), ("maxAge", "24 h") } },
            new("int-orders", "Warehouse orders push", "Integrations", "HTTP request", "Scheduled", "Integrations team", "Sends paid orders to the warehouse for picking.") {
                EveryMinutes = 15, Seconds = 14, FailRate = 0.015,
                Data = new[] { ("method", "POST"), ("url", "https://wms.example.com/api/orders"), ("timeout", "60 s") } },
            new("int-labels", "Shipping labels fetch", "Integrations", "HTTP request", "Paused", "Integrations team", "Downloads shipping labels for orders the carrier accepted.") {
                EveryMinutes = 30, Seconds = 19, PausedHoursAgo = 7.5,
                Data = new[] { ("method", "GET"), ("url", "https://carrier.example.net/v3/labels"), ("format", "zpl") } },
            new("int-marketplace", "Marketplace listings", "Integrations", "Data sync", "Scheduled", "Integrations team", "Publishes price and stock changes to the marketplaces.") {
                EveryMinutes = 60, Seconds = 132, FailRate = 0.06,
                Data = new[] { ("source", "catalog.listing_changes"), ("target", "https://market.example.com/api"), ("dryRun", "false") } },
            new("int-sftp", "Partner SFTP drop", "Integrations", "Export", "Error", "Integrations team", "Drops the daily order file on the partner's SFTP server.") {
                Rule = Daily(), RuleStart = At(6, 0), Seconds = 22,
                Data = new[] { ("format", "csv"), ("destination", "sftp://partner.example.org/inbound"), ("encoding", "utf-8") } },

            new("ops-vacuum", "Database vacuum", "Maintenance", "Script", "Scheduled", "Platform team", "Reclaims space and refreshes planner statistics.") {
                Rule = CanopyRecurrence.Weekly(DayOfWeek.Sunday), RuleStart = At(4, 0), Seconds = 1840,
                Data = new[] { ("script", "jobs/ops/vacuum.ps1"), ("args", "-Analyze"), ("tables", "all") } },
            new("ops-logs", "Log rotation", "Maintenance", "Script", "Read-only", "Platform team", "Compresses and rotates application logs. Managed by the platform.") {
                Rule = Daily(), RuleStart = At(0, 15), Seconds = 35,
                Data = new[] { ("script", "system/rotate-logs.sh"), ("keepDays", "30") } },
            new("ops-backup", "Backup verification", "Maintenance", "Script", "Read-only", "Platform team", "Restores last night's backup into a scratch database and checks it.") {
                Rule = Daily(), RuleStart = At(5, 0), Seconds = 910,
                Data = new[] { ("script", "system/verify-backup.sh"), ("target", "scratch-db-02") } },
            new("ops-certs", "Certificate check", "Maintenance", "HTTP request", "Read-only", "Security team", "Checks the expiry of every public certificate.") {
                Rule = Daily(), RuleStart = At(7, 0), Seconds = 12,
                Data = new[] { ("method", "GET"), ("url", "https://status.example.com/certs"), ("warnDays", "21") } },
            new("ops-temp", "Temp files cleanup", "Maintenance", "Script", "Scheduled", "Platform team", "Removes temporary upload files older than a day.") {
                EveryMinutes = 60, Seconds = 9,
                Data = new[] { ("script", "jobs/ops/clean-temp.ps1"), ("olderThan", "24 h") } },
            new("ops-sessions", "Session purge", "Maintenance", "Script", "Paused", "Platform team", "Deletes expired sign-in sessions.") {
                EveryMinutes = 30, Seconds = 4.1, PausedHoursAgo = 19,
                Data = new[] { ("script", "jobs/ops/purge-sessions.ps1"), ("batch", "10000") } },
            new("ops-queue", "Queue depth probe", "Maintenance", "HTTP request", "Scheduled", "Platform team", "Samples queue depths for the capacity dashboard.") {
                EveryMinutes = 2, Seconds = 0.8, FailRate = 0.004,
                Data = new[] { ("method", "GET"), ("url", "https://queues.example.com/metrics"), ("timeout", "5 s") } },

            new("rep-sales", "Daily sales digest", "Reporting", "Export", "Scheduled", "Analytics team", "Mails yesterday's sales summary to the leadership list.") {
                Rule = Daily(), RuleStart = At(7, 30), Seconds = 64,
                Data = new[] { ("format", "pdf"), ("recipients", "sales-leads@example.com"), ("timezone", "UTC") } },
            new("rep-kpi", "Weekly KPI pack", "Reporting", "Export", "Scheduled", "Analytics team", "Builds the weekly KPI workbook.") {
                Rule = CanopyRecurrence.Weekly(DayOfWeek.Monday), RuleStart = At(6, 0, 1), Seconds = 214,
                Data = new[] { ("format", "xlsx"), ("destination", "s3://reports/kpi"), ("sheets", "12") } },
            new("rep-churn", "Churn model refresh", "Reporting", "Script", "Paused", "Analytics team", "Retrains the churn model on the last 90 days.") {
                Rule = Daily(), RuleStart = At(1, 0), Seconds = 2760, PausedHoursAgo = 52,
                Data = new[] { ("script", "jobs/analytics/train-churn.ps1"), ("window", "90 days"), ("gpu", "false") } },
            new("rep-dashboard", "Ops dashboard cache", "Reporting", "Script", "Running", "Analytics team", "Precomputes the operations dashboard tiles.") {
                EveryMinutes = 15, Seconds = 52, FailRate = 0.01,
                Data = new[] { ("script", "jobs/analytics/warm-dashboard.ps1"), ("tiles", "38") } },
        };
    }

    // Plans a job's past runs (the last 14 at least, for the run-history slots) and its next five fire times.
    private void Plan(Job job, int index, List<Run> runs) {
        var random = new Random(7919 + index * 31);
        var pausedAt = job.Status == "Paused" ? Now.AddHours(-job.PausedHoursAgo) : (DateTime?)null;
        var until = pausedAt ?? Now;
        var starts = new List<DateTime>();
        if (job.EveryMinutes is int every) {
            job.Schedule = every == 60 ? "Every hour" : "Every " + every.ToString(CultureInfo.InvariantCulture) + " minutes";
            var step = TimeSpan.FromMinutes(every);
            var first = new DateTime(Now.Year, Now.Month, Now.Day, 0, 0, 0, DateTimeKind.Utc).AddDays(-2);
            var span = Math.Max(HistoryHours * 60, every * 16);
            for (var at = first; at <= until; at += step) if (at >= until.AddMinutes(-span)) starts.Add(at);
            var next = starts.Count > 0 ? starts[^1] + step : until;
            while (next <= Now) next += step;
            for (var fire = next; job.Fires.Count < 5; fire += step) job.Fires.Add(fire);
        } else if (job.Rule is CanopyRecurrence rule) {
            job.Schedule = rule.Describe(job.RuleStart, English);
            var past = rule.Occurrences(job.RuleStart, TimeZoneInfo.Utc, Now.AddDays(-400), until).Select(at => at.UtcDateTime).ToList();
            starts.AddRange(past.Skip(Math.Max(0, past.Count - 14)));
            job.Fires.AddRange(rule.Occurrences(job.RuleStart, TimeZoneInfo.Utc, Now.AddSeconds(1)).Take(5).Select(at => at.UtcDateTime));
        }
        if (job.Status != "Paused") job.Next = job.Fires.FirstOrDefault();
        else job.Fires.Clear();
        if (job.Status == "Running" && starts.Count > 0) {
            // The latest start is still running: it shows in the Running tab rather than in the history.
            job.RunningSince = starts[^1].AddSeconds(random.Next(2, 20));
            starts.RemoveAt(starts.Count - 1);
        }
        var errorRuns = job.Status == "Error" ? 3 : 0;
        for (var i = 0; i < starts.Count; i++) {
            var start = starts[i].AddSeconds(random.Next(0, 9));
            var worker = "worker-" + (1 + (index + i) % 4).ToString(CultureInfo.InvariantCulture);
            var failing = i >= starts.Count - errorRuns || random.NextDouble() < job.FailRate;
            var seconds = Math.Round(job.Seconds * (0.7 + random.NextDouble() * 0.6) * (failing ? 1.6 : 1), job.Seconds < 10 ? 2 : 1);
            var manual = !failing && random.NextDouble() < 0.01;
            runs.Add(new Run(string.Empty, job, start, seconds, failing ? "Failed" : "Succeeded", manual ? "Manual" : "Schedule", worker));
            // A failed scheduled run retries once after two minutes, unless the job is in error (its retries ran out).
            if (failing && errorRuns == 0 && (job.EveryMinutes ?? 60) > 4) {
                var retry = start.AddMinutes(2);
                if (retry < until) runs.Add(new Run(string.Empty, job, retry, Math.Round(job.Seconds * 1.1, 1), random.NextDouble() < 0.8 ? "Succeeded" : "Failed", "Retry", worker));
            }
        }
    }
}
