using System.Text;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>
/// Row actions (docs/row-actions.md): a job list whose rows offer Run, Pause or Resume by state, with Edit and Delete in the
/// More menu, and a lock on the system's own jobs. The page's mock scheduler answers each proposal after a short delay,
/// accepts most and rejects some with its own message; accepted changes reach the grid through the live data API.
/// </summary>
internal static class RowActionsExample {
    private const string Script = """
<style>
.jobs-log{box-sizing:border-box;margin:0;padding:10px 16px 0;font:13px/1.4 Archivo,'Segoe UI Variable Text','Segoe UI',system-ui,-apple-system,sans-serif;color:CanvasText}
body{background:Canvas;color:CanvasText}
body.cx-page > .cx-main > .cx-host{height:calc(100vh - 40px)}
</style>
<script>
(() => {
  const log = text => { document.getElementById("jobs-log").textContent = text; };
  // The mock scheduler answers after a short delay, as a server would; #instant answers at once for tests.
  const delay = location.hash.includes("instant") ? 0 : 700;
  const wait = signal => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
  const refusals = {
    "run:backup": "The backup target is offline. Try again when it is reachable.",
    "delete:certs": "Another job depends on Certificate renewal."
  };
  const next = { run: "Running", resume: "Running", pause: "Paused" };
  CanopyX.configure("jobs", {
    async onRowAction(proposal, request) {
      const name = proposal.row.cells.name;
      log("Sending " + proposal.action + " for " + name + "…");
      await wait(request.signal);
      const refused = refusals[proposal.action + ":" + proposal.id];
      if (refused) { log(name + ": " + refused); return { accepted: false, message: refused }; }
      const grid = document.querySelector("[data-canopyx-host]").canopyx;
      if (proposal.action === "delete") await grid.removeRows([proposal.id]);
      else if (next[proposal.action]) await grid.updateRows([{ id: proposal.id, cells: { status: next[proposal.action] } }]);
      log(name + ": " + proposal.action + " accepted by the scheduler.");
      return true;
    }
  });
})();
</script>
""";

    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var page = Create().ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX row actions", Theme = theme });
            File.WriteAllText(Path.Combine(output, "row-actions" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"), Inject(page), new UTF8Encoding(false));
        }
        // The static table leaves the actions out: they need the browser and the host.
        File.WriteAllText(Path.Combine(output, "row-actions-static.html"),
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Jobs</title></head><body>" +
            CanopyStaticHtml.RenderGrid(Create()) + "</body></html>", new UTF8Encoding(false));
    }

    // The configuration runs before DOMContentLoaded, when the runtime mounts the page's grid; the log line sits above it.
    private static string Inject(string page) => page.Replace("<main class=\"cx-main\">", "<main class=\"cx-main\">\n<p class=\"jobs-log\" id=\"jobs-log\" role=\"status\">Run, pause or resume a job, or open More for Edit and Delete.</p>")
        .Replace("</body>", Script + "</body>");

    internal static CanopyDataGridView Create() {
        var grid = new CanopyDataGridView("jobs", "Scheduled jobs") {
            PageSize = 50, Noun = "jobs", Live = new CanopyGridLive { Flash = true }
        };
        grid.Columns.Add(new CanopyColumn("name", "Job") { Sortable = true, RowHeader = true, Sizing = CanopyColumnSizing.Flex(1, 160, 420, preferredWidth: 220) });
        grid.Columns.Add(new CanopyColumn("status", "Status") {
            Sortable = true,
            Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> {
                ["Running"] = CanopyTone.Info, ["Paused"] = CanopyTone.Warning, ["Failed"] = CanopyTone.Danger, ["Succeeded"] = CanopyTone.Success, ["Disabled"] = CanopyTone.Neutral
            })
        });
        grid.Columns.Add(new CanopyColumn("schedule", "Schedule") { ResponsivePriority = 3 });
        grid.Columns.Add(new CanopyColumn("lastRun", "Last run") { Kind = CanopyColumnKind.DateTime, Sortable = true, ResponsivePriority = 2 });
        grid.Columns.Add(new CanopyColumn("owner", "Owner") { Sortable = true, ResponsivePriority = 4 });

        var running = CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "Running");
        grid.RowActions.Inline = 1;
        grid.RowActions.LockedWhen = CanopyFormatCondition.Where("owner", CanopyFormatOperator.Equal, "System");
        grid.RowActions.LockedLabel = "System job: read-only";
        grid.RowActions
            .Add(new CanopyRowAction("run", "Run now", CanopyRowActionIcon.Play) {
                Tone = CanopyRowActionTone.Primary,
                When = CanopyFormatCondition.Where("status", CanopyFormatOperator.In, "Succeeded", "Failed", "Disabled"),
                DisabledWhen = CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "Disabled"),
                DisabledReason = "Enable the job before running it."
            })
            .Add(new CanopyRowAction("pause", "Pause", CanopyRowActionIcon.Pause) { When = running })
            .Add(new CanopyRowAction("resume", "Resume", CanopyRowActionIcon.Play) { Tone = CanopyRowActionTone.Primary, When = CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "Paused") })
            .Add(new CanopyRowAction("edit", "Edit", CanopyRowActionIcon.Edit))
            .Add(new CanopyRowAction("delete", "Delete", CanopyRowActionIcon.Delete) {
                Tone = CanopyRowActionTone.Danger, DisabledWhen = running, DisabledReason = "Pause the job before deleting it."
            });

        var start = new DateTime(2026, 11, 10, 22, 0, 0, DateTimeKind.Utc);
        Add(grid, "backup", "Nightly backup", "Failed", "Daily at 02:00", start.AddHours(4), "Operations");
        Add(grid, "certs", "Certificate renewal", "Succeeded", "Weekly on Monday", start.AddHours(-30), "Security");
        Add(grid, "index", "Search index rebuild", "Running", "Every 6 hours", start.AddHours(10), "Platform");
        Add(grid, "digest", "Mail digest", "Paused", "Daily at 07:30", start.AddHours(-14), "Communications");
        Add(grid, "reports", "Monthly report export", "Disabled", "Monthly on the 1st", start.AddDays(-10), "Finance");
        Add(grid, "cleanup", "Temporary file cleanup", "Succeeded", "Hourly", start.AddHours(11), "System");
        Add(grid, "images", "Image resize queue", "Running", "Continuous", start.AddHours(11.5), "Media");
        Add(grid, "audit", "Audit log archive", "Succeeded", "Daily at 03:00", start.AddHours(5), "System");
        Add(grid, "warmup", "Cache warm-up", "Succeeded", "Every 15 minutes", start.AddHours(11.75), "Platform");
        return grid;
    }

    private static void Add(CanopyDataGridView grid, string id, string name, string status, string schedule, DateTime lastRun, string owner) {
        var row = new CanopyGridRow(id);
        row.Cells["name"] = name; row.Cells["status"] = status; row.Cells["schedule"] = schedule;
        row.Cells["lastRun"] = lastRun; row.Cells["owner"] = owner;
        grid.Rows.Add(row);
    }
}
