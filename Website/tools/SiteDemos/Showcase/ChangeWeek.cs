using System.Globalization;
using System.Text;
using CanopyX;
using CanopyX.Html;
using ChartForgeX;
using ChartForgeX.Core;
using ChartForgeX.Themes;

namespace SiteDemos.Showcase;

/// <summary>
/// One set of change records drawn four ways for the home page (grid, board, calendar and pivot), and a complete report over
/// the same records: a ChartForgeX chart beside a calendar and a grid linked both ways, in a single file a reader can download.
/// </summary>
internal static class ChangeWeek {
    internal sealed class Change {
        public string Id { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Team { get; set; } = string.Empty;
        public string Site { get; set; } = string.Empty;
        public string Risk { get; set; } = string.Empty;
        public string Owner { get; set; } = string.Empty;
        public DateTime Starts { get; set; }
        public DateTime Ends { get; set; }
        public int Hours { get; set; }
    }

    private static readonly (string Value, string Label)[] Lanes = { ("planned", "Planned"), ("approved", "Approved"), ("active", "In progress"), ("done", "Done") };
    private static readonly string[] Teams = { "Platform", "Network", "Security", "Applications" };
    private static readonly DateTime Monday = new(2026, 11, 2, 0, 0, 0, DateTimeKind.Utc);

    private static readonly string[] Titles = {
        "Patch the Warsaw hypervisors", "Renew the gateway certificate", "Replace core switch firmware", "Move mail to the new relay",
        "Rotate service credentials", "Upgrade the database cluster", "Enable TLS 1.3 on the load balancers", "Migrate file shares to the new array",
        "Retire the legacy VPN", "Update the endpoint baseline", "Expand the backup repository", "Roll out the sign-in policy",
        "Reindex the search cluster", "Replace the London firewall pair", "Deploy the new monitoring agents", "Clean up stale DNS records",
        "Restore test from last night's backup", "Upgrade the container hosts", "Review privileged group members", "Patch the Berlin file servers",
        "Move scheduled jobs to the new hosts", "Update the WAF rule set", "Refresh the staging data", "Publish the disaster recovery runbook",
        "Replace the Madrid access switches", "Rebuild the print servers", "Tune the storage replication", "Rotate the API signing keys",
        "Update the reverse proxies", "Validate the failover to Berlin", "Archive last year's log data", "Upgrade the identity connector",
        "Patch the Madrid hypervisors", "Audit the firewall exceptions", "Roll out the new VPN client", "Decommission the old jump hosts"
    };

    /// <summary>The records every view on the home page reads. The values are fixed so the site builds the same pages each time.</summary>
    internal static IReadOnlyList<Change> Records() {
        var sites = new[] { "Warsaw", "London", "Berlin", "Madrid" };
        var owners = new[] { "Alex Morgan", "Sam Rivera", "Jordan Lee", "Taylor Chen", "Robin Novak" };
        var records = new List<Change>();
        for (var index = 0; index < Titles.Length; index++) {
            var day = index * 5 % 12;
            var starts = Monday.AddDays(day).AddHours(8 + index * 3 % 10);
            var hours = 1 + index * 7 % 6;
            var risk = index % 7 == 2 ? "High" : index % 3 == 1 ? "Medium" : "Low";
            // The week runs from finished work on the first days to plans at the end of the second week.
            var lane = day < 3 ? 3 : day < 5 ? 2 : day < 9 ? 1 : 0;
            records.Add(new Change {
                Id = "chg-" + (1400 + index).ToString(CultureInfo.InvariantCulture), Title = Titles[index], Status = Lanes[lane].Value,
                Team = Teams[index % Teams.Length], Site = sites[index * 3 % sites.Length], Risk = risk, Owner = owners[index % owners.Length],
                Starts = starts, Ends = starts.AddHours(hours), Hours = hours
            });
        }
        return records;
    }

    private static CanopyDataGridView<Change> Grid(string id, string label) {
        var grid = new CanopyDataGridView<Change>(id, label, item => item.Id);
        var view = grid.View;
        view.Noun = "changes";
        view.Selection = CanopySelectionMode.Multiple;
        view.PageSize = 100;
        grid.Column(x => x.Title, "Change", column => { column.Sortable = true; column.RowHeader = true; column.Sizing = CanopyColumnSizing.Preferred(280, 180, 420); });
        grid.Column(x => x.Status, configure: column => {
            column.Sortable = true;
            foreach (var (value, text) in Lanes) { column.ValueLabels.Add(value, text); column.ValueOrder.Add(value); }
        });
        grid.Column(x => x.Team, configure: column => column.Sortable = true);
        grid.Column(x => x.Site, configure: column => column.Sortable = true);
        grid.Column(x => x.Risk, configure: column => {
            column.Sortable = true;
            column.Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> { ["High"] = CanopyTone.Danger, ["Medium"] = CanopyTone.Warning, ["Low"] = CanopyTone.Neutral });
        });
        grid.Column(x => x.Owner, configure: column => column.Sortable = true);
        grid.Column(x => x.Starts, configure: column => { column.Sortable = true; column.Sizing = CanopyColumnSizing.Preferred(190); });
        grid.Column(x => x.Ends, configure: column => { column.Sortable = true; column.Hidden = true; });
        grid.Column(x => x.Hours, configure: column => column.Sortable = true);
        return grid.AddRows(Records());
    }

    private static CanopyDataGridView<Change> Calendar(string id, string label) {
        var grid = Grid(id, label);
        var settings = grid.Calendar().Start(x => x.Starts).End(x => x.Ends).Title(x => x.Title).Subtitle(x => x.Owner).Definition;
        settings.Date = Monday;
        settings.FirstDay = DayOfWeek.Monday;
        settings.View = CanopyCalendarView.Week;
        foreach (var item in new[] { CanopyCalendarView.Month, CanopyCalendarView.Week, CanopyCalendarView.Agenda }) settings.Views.Add(item);
        settings.ScrollTime = TimeSpan.FromHours(8);
        return grid;
    }

    private static CanopyDataGridView Board() {
        var view = Grid("one-board", "Changes by status").View;
        view.Selection = CanopySelectionMode.Single;
        view.RowIdentity = CanopyGridRowIdentity.StableKey;
        view.Reporting = new CanopyGridReporting();
        view.Board = new CanopyBoard("status") { TitleColumn = "title" };
        foreach (var (value, text) in Lanes) view.Board.Lanes.Add(new CanopyBoardLane(value, text));
        view.Board.Fields.Add("owner");
        view.Board.Fields.Add("risk");
        view.Board.Fields.Add("starts");
        return view;
    }

    private static CanopyDataGridView Pivot() {
        var view = Grid("one-pivot", "Hours by team and status").View;
        view.Reporting = new CanopyGridReporting { Pivotable = true };
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("hours-total", "hours", CanopyGridAggregateOperation.Sum, "Hours"));
        var pivot = view.Reporting.Pivot = new CanopyGridPivot();
        pivot.Rows.Add(new CanopyGridGroupLevel("team"));
        pivot.Columns.Add(new CanopyGridGroupLevel("status"));
        pivot.Values.Add("hours-total");
        return view;
    }

    private static string ChartSvg(bool dark) {
        var records = Records();
        var chart = Chart.Create()
            .WithTitle("Hours of change per team")
            .WithSubtitle("Each status stacked, across the two weeks")
            .WithSize(880, 300)
            .WithYAxis("Hours")
            .WithXLabels(Teams)
            .WithStackedBars()
            .WithYAxisIntegerTicks();
        foreach (var (value, text) in Lanes) {
            chart.AddBar(text, ChartPoints.FromValues(Teams.Select(team => (double)records.Where(x => x.Team == team && x.Status == value).Sum(x => x.Hours)).ToArray()));
        }
        if (dark) chart.WithThemeMode(VisualThemeMode.Dark);
        return chart.ToSvg(dark ? "change-week-dark" : "change-week");
    }

    /// <summary>Writes the four frames of the home page and the report, and returns a one-line summary for the site's data.</summary>
    internal static string Write(string demos) {
        var folder = Path.Combine(demos, "oneview");
        Directory.CreateDirectory(folder);
        CanopyHtmlOptions Options(string title) => new() { Title = "CanopyX " + title, Theme = CanopyTheme.Auto, Height = "100vh" };
        Grid("one-grid", "Change records").View.SaveHtmlPage(Path.Combine(folder, "grid.html"), Options("change records"));
        Board().SaveHtmlPage(Path.Combine(folder, "board.html"), Options("changes by status"));
        Calendar("one-calendar", "Change calendar").View.SaveHtmlPage(Path.Combine(folder, "calendar.html"), Options("change calendar"));
        Pivot().SaveHtmlPage(Path.Combine(folder, "pivot.html"), Options("hours by team and status"));

        var report = Path.Combine(demos, "showcase");
        Directory.CreateDirectory(report);
        foreach (var dark in new[] { false, true }) {
            File.WriteAllText(Path.Combine(report, "change-week" + (dark ? "-dark" : string.Empty) + ".html"), Report(dark), new UTF8Encoding(false));
        }
        return Records().Count.ToString(CultureInfo.InvariantCulture) + " change records";
    }

    private static string Report(bool dark) {
        var document = new CanopyHtmlDocument();
        CanopyHtmlOptions Options(string height) {
            var options = new CanopyHtmlOptions { Theme = dark ? CanopyTheme.Dark : CanopyTheme.Light, Height = height, Document = document };
            options.Parts.Add("link");
            return options;
        }
        // A click selects a day in the month view, which is what links the calendar to the records.
        var calendar = Calendar("report-calendar", "Change calendar").View;
        calendar.Calendar!.View = CanopyCalendarView.Month;
        var (canvas, ink, muted) = dark ? ("#111118", "#ececf3", "#b0afc2") : ("#ffffff", "#16151f", "#4b4a5e");
        return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Change weeks report</title><style>"
            + CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid)
            + "body{margin:0;padding:20px;background:" + canvas + ";color:" + ink + ";font:14px/1.5 system-ui,sans-serif}"
            + "h1{margin:0;font-size:22px}main{display:grid;gap:18px;max-width:1280px;margin:auto}main>*{min-width:0}"
            + "#status{margin:0;min-height:20px;color:" + muted + ";font-size:13px}.chart svg{display:block;width:100%;height:auto}"
            + "</style><script>" + CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid) + "</script></head><body><main><h1>Change weeks, 2 to 13 November</h1>"
            + "<p id=\"status\" role=\"status\">Click a day in the calendar to filter the records, or select records to mark them in the calendar.</p>"
            + "<div class=\"chart\">" + ChartSvg(dark) + "</div>"
            + calendar.ToHtmlFragment(Options("620px"))
            + Grid("report-records", "Change records").View.ToHtmlFragment(Options("420px"))
            + "</main><script>" + LinkScript + "</script></body></html>";
    }

    // The page links the views: neither knows the other, and the page calls the link methods of each.
    private const string LinkScript = """
        (() => {
          CanopyX.configure("report-calendar", { linkEvents: true });
          CanopyX.configure("report-records", { linkEvents: true });
          const status = document.getElementById("status");
          const hostOf = id => [...document.querySelectorAll("[data-canopyx-host]")].find(element => element.canopyx && element.canopyx.view.id === id);
          addEventListener("load", () => {
            const calendar = hostOf("report-calendar"), grid = hostOf("report-records");
            calendar.addEventListener("canopyx:linkchange", event => {
              const detail = event.detail;
              if (detail.action === "clear" || !detail.range) { grid.canopyx.setExternalFilter("calendar", null); status.textContent = "Nothing selected in the calendar."; return; }
              const to = new Date(Date.parse(detail.range.to) - 1000).toISOString().replace(".000Z", "Z");
              grid.canopyx.setExternalFilter("calendar", { field: detail.range.column, range: [detail.range.from, to], label: detail.label, sourceLabel: "Calendar" });
              status.textContent = "Calendar: " + detail.label + " (" + detail.keys.length + " changes)";
            });
            grid.addEventListener("canopyx:linkchange", event => {
              const detail = event.detail;
              if (detail.scope !== "select") return;
              if (detail.action === "clear") { calendar.canopyx.clearHighlight(); status.textContent = "Nothing selected in the records."; return; }
              calendar.canopyx.setHighlight(detail.keys, { source: "Records" });
              status.textContent = "Records: " + detail.label;
            });
          });
        })();
        """;
}
