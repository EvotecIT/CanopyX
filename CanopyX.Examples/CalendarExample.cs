using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// An operations calendar written from typed records (docs/calendar.md): maintenance windows that repeat (one with an
/// exception and one moved occurrence), patch rings, changes, incidents, certificate and password expiries, a change freeze
/// drawn as a background range and a holiday. It opens in the month view and offers week, day, three days, agenda and year;
/// events move and resize through the editing contract, and each opens its record in the record panel. Writes calendar.html
/// (and -dark), and calendar-pl.html and calendar-de.html with the Polish and German label packs.
/// </summary>
internal static class CalendarExample {
    internal sealed class Operation {
        public string Id { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime Starts { get; set; }
        public DateTime? Ends { get; set; }
        public bool AllDay { get; set; }
        public string? Host { get; set; }
        public string Owner { get; set; } = string.Empty;
        public string Team { get; set; } = string.Empty;
        public string? Rule { get; set; }
        public string? Skipped { get; set; }
        public string? Display { get; set; }
        public string? SeriesId { get; set; }
        public DateTime? Replaces { get; set; }
        public string Ticket { get; set; } = string.Empty;
        public string Notes { get; set; } = string.Empty;
    }

    internal static readonly DateTime Today = new(2026, 10, 16, 0, 0, 0, DateTimeKind.Utc);

    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            Create().View.SaveHtmlPage(Path.Combine(output, "calendar" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"),
                new CanopyHtmlOptions { Title = "Operations calendar", Theme = theme, Height = "760px" });
        }
        foreach (var (suffix, labels, language) in new[] { ("pl", CanopyLabels.Polish(), "pl"), ("de", CanopyLabels.German(), "de") }) {
            var grid = Create().View;
            grid.Labels = labels;
            Translate(grid, suffix);
            grid.SaveHtmlPage(Path.Combine(output, "calendar-" + suffix + ".html"), new CanopyHtmlOptions { Title = "Operations calendar", Height = "760px", Language = language });
        }
    }

    /// <summary>The example's own words in the page language: the noun and the status texts (the values stay, so tones and filters keep working).</summary>
    private static void Translate(CanopyDataGridView grid, string language) {
        var polish = language == "pl";
        grid.Noun = polish ? "zdarzenia" : "Ereignisse";
        var statuses = polish
            ? new Dictionary<string, string> { ["Incident"] = "Incydent", ["Expired"] = "Wygasło", ["Warning"] = "Ostrzeżenie", ["Running"] = "W toku", ["Planned"] = "Zaplanowane", ["Done"] = "Zakończone" }
            : new Dictionary<string, string> { ["Incident"] = "Störung", ["Expired"] = "Abgelaufen", ["Warning"] = "Warnung", ["Running"] = "Läuft", ["Planned"] = "Geplant", ["Done"] = "Erledigt" };
        foreach (var row in grid.Rows) {
            if (row.Cells.TryGetValue("status", out var cell) && cell?.Value is string value && statuses.TryGetValue(value, out var text)) row.Cells["status"] = new CanopyCell(value) { Text = text };
        }
    }

    internal static CanopyDataGridView<Operation> Create(string id = "operations", string label = "Operations calendar") {
        var grid = new CanopyDataGridView<Operation>(id, label, item => item.Id);
        var view = grid.View;
        view.Selection = CanopySelectionMode.Single;
        view.PageSize = 200;
        view.Noun = "events";
        if (id == "operations") view.StateKey = "calendar-example";
        // Rows change in place through the live data API (docs/live-data.md); the calendar follows them.
        view.Live = new CanopyGridLive();
        grid.Column(x => x.Title, configure: column => { column.Sortable = true; column.RowHeader = true; column.Section = "Event"; });
        grid.Column(x => x.Kind, configure: column => column.Sortable = true);
        grid.Column(x => x.Status, configure: column => {
            column.Sortable = true;
            column.Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> {
                ["Incident"] = CanopyTone.Danger, ["Expired"] = CanopyTone.Danger, ["Warning"] = CanopyTone.Warning, ["Running"] = CanopyTone.Info,
                ["Planned"] = CanopyTone.Neutral, ["Done"] = CanopyTone.Success
            });
        });
        grid.Column(x => x.Starts, "Starts", column => { column.Sortable = true; column.Editable = true; column.Section = "Schedule"; });
        grid.Column(x => x.Ends, "Ends", column => { column.Sortable = true; column.Editable = true; column.Section = "Schedule"; });
        grid.Column(x => x.Host, "Host", column => { column.Sortable = true; column.Section = "Ownership"; });
        grid.Column(x => x.Owner, configure: column => { column.Sortable = true; column.Section = "Ownership"; });
        grid.Column(x => x.Team, configure: column => { column.Sortable = true; column.Hidden = true; column.Section = "Ownership"; });
        grid.Column(x => x.Display, configure: column => { column.Hidden = true; column.ShowInDrawer = false; });
        grid.Column(x => x.SeriesId, "Series", column => { column.Hidden = true; column.ShowInDrawer = false; });
        grid.Column(x => x.Replaces, "Replaces occurrence", column => { column.Hidden = true; column.Section = "Schedule"; });
        grid.Field(x => x.Ticket, "Ticket");
        grid.Field(x => x.Notes, "Notes");

        var calendar = grid.Calendar().Start(x => x.Starts).End(x => x.Ends).Title(x => x.Title).Subtitle(x => x.Owner).Status(x => x.Status)
            .AllDay(x => x.AllDay).Recurrence(x => x.Rule).Exceptions(x => x.Skipped);
        var settings = calendar.Definition;
        settings.Display = grid.ColumnId(x => x.Display);
        settings.Series = grid.ColumnId(x => x.SeriesId);
        settings.RecurrenceId = grid.ColumnId(x => x.Replaces);
        settings.Date = Today;
        foreach (var item in new[] { CanopyCalendarView.Month, CanopyCalendarView.Week, CanopyCalendarView.Day, CanopyCalendarView.Days, CanopyCalendarView.Agenda, CanopyCalendarView.Year })
            settings.Views.Add(item);
        settings.FirstDay = DayOfWeek.Monday;
        settings.WorkingHours = new CanopyCalendarHours(TimeSpan.FromHours(8), TimeSpan.FromHours(18));
        settings.ScrollTime = TimeSpan.FromHours(7);
        settings.Editing = new CanopyCalendarEditing { SnapMinutes = 15 };
        settings.Ranges.Add(new CanopyCalendarRange(new DateTime(2026, 10, 30, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 31, 0, 0, 0, DateTimeKind.Utc), "Company holiday") { Tone = CanopyTone.Success });

        var record = view.Record ??= new CanopyRecordPanel();
        record.DeepLink = true; record.HeaderStatus = grid.ColumnId(x => x.Status);
        record.HeaderFacts.Add(grid.ColumnId(x => x.Starts));
        record.HeaderFacts.Add(grid.ColumnId(x => x.Owner));
        return grid.AddRows(Operations());
    }

    private static DateTime At(int day, int hour = 0, int minute = 0, int month = 10) => new(2026, month, day, hour, minute, 0, DateTimeKind.Utc);

    internal static IEnumerable<Operation> Operations() {
        var items = new List<Operation>();
        var number = 0;
        Operation Add(string title, string kind, string status, DateTime starts, DateTime? ends, string owner, string team, string? host = null) {
            var item = new Operation {
                Id = "op-" + (++number).ToString("000", CultureInfo.InvariantCulture), Title = title, Kind = kind, Status = status, Starts = starts, Ends = ends,
                Owner = owner, Team = team, Host = host, Ticket = "CHG-" + (4100 + number * 7).ToString(CultureInfo.InvariantCulture),
                Notes = kind + " handled by " + team + "."
            };
            items.Add(item);
            return item;
        }
        // Recurring windows and rings.
        var weekly = Add("Weekly maintenance window", "Maintenance", "Planned", At(1, 20, 0, 9), At(1, 23, 0, 9), "Operations", "Platform", "app-cluster");
        weekly.Rule = "FREQ=WEEKLY;BYDAY=TU"; weekly.Skipped = "2026-10-27";
        var moved = Add("Weekly maintenance window (moved)", "Maintenance", "Planned", At(15, 21), At(15, 23, 30), "Operations", "Platform", "app-cluster");
        moved.SeriesId = weekly.Id; moved.Replaces = At(13, 20);
        Add("Daily stand-up", "Meeting", "Planned", At(1, 7, 30), At(1, 7, 45), "Operations", "Platform").Rule = "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=45";
        Add("Patch Tuesday: ring 0 (pilot)", "Patch", "Planned", At(13, 18, 0, 1), At(13, 22, 0, 1), "Windows team", "Endpoint").Rule = "FREQ=MONTHLY;BYDAY=2TU";
        Add("Patch ring 1 deployment", "Patch", "Planned", At(15, 18, 0, 1), At(15, 23, 0, 1), "Windows team", "Endpoint").Rule = "FREQ=MONTHLY;BYDAY=2TH";
        Add("Patch ring 2 deployment", "Patch", "Planned", At(20, 18, 0, 1), At(20, 23, 0, 1), "Windows team", "Endpoint").Rule = "FREQ=MONTHLY;BYDAY=3TU";
        Add("Backup verification", "Maintenance", "Planned", At(2, 9, 0, 1), At(2, 10, 0, 1), "Storage", "Infrastructure").Rule = "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR";
        // The busy Friday and its neighbours.
        Add("Quarterly certificate renewal window", "Certificate", "Planned", At(12), At(17), "PKI team", "Security").AllDay = true;
        Add("Core switch firmware upgrade", "Change", "Planned", At(14, 22), At(15, 3), "Network", "Infrastructure", "sw-core-1");
        Add("Database failover test", "Change", "Running", At(16, 9), At(16, 11), "DBA", "Data", "db-02");
        Add("Disk latency on the file server cluster: storage controller reports retries on two shelves", "Incident", "Incident", At(16, 10, 15), At(16, 12), "Storage", "Infrastructure", "fs-01");
        Add("Patch ring 1 pilot sign-off", "Patch", "Planned", At(16, 13), At(16, 14), "Windows team", "Endpoint");
        Add("Firewall rule 4471 changed", "Change", "Done", At(16, 14, 20), null, "Security", "Security", "fw-01");
        Add("Load balancer pool drained", "Change", "Done", At(16, 15, 5), null, "Network", "Infrastructure", "lb-02");
        Add("Monitoring agent rollout", "Change", "Running", At(16, 15, 30), At(16, 17), "Platform", "Platform");
        Add("Mail relay certificate replaced", "Certificate", "Done", At(16, 8, 10), null, "PKI team", "Security", "mail-01");
        Add("Data centre power test", "Maintenance", "Planned", At(24, 6), At(24, 18), "Facilities", "Infrastructure", "dc-1");
        Add("Change freeze", "Freeze", "Planned", At(26), At(31), "Change board", "Governance").Display = "background";
        Add("Certificate expires: portal.example.com", "Certificate", "Warning", At(21, 13, 45), null, "Web", "Digital", "web-01");
        Add("Certificate expires: api.example.com", "Certificate", "Expired", At(9, 0, 0), null, "Web", "Digital", "web-02");
        Add("Storage array migration", "Change", "Planned", At(19, 20), At(22, 6), "Storage", "Infrastructure", "san-02");
        Add("Hypervisor host evacuation", "Maintenance", "Done", At(8, 19), At(8, 23), "Platform", "Platform", "hv-07");
        Add("VPN gateway outage", "Incident", "Incident", At(5, 6, 40), At(5, 8, 10), "Network", "Infrastructure", "vpn-01");
        Add("Directory schema update", "Change", "Done", At(7, 18), At(7, 19), "Identity", "Identity", "dc-01");
        foreach (var (person, day) in new[] { ("j.smith", 19), ("a.nowak", 19), ("m.garcia", 19), ("l.rossi", 19), ("p.dubois", 19), ("k.meyer", 22), ("s.costa", 28) })
            Add("Password expires: " + person, "Password", "Warning", At(day), null, person, "Accounts").AllDay = true;
        // Dense change history on the 20th.
        for (var i = 0; i < 14; i++) Add("Configuration change " + (i + 1).ToString(CultureInfo.InvariantCulture), "Change", "Done", At(20, 8 + i / 2, i % 2 * 30 + 5), null, "Automation", "Platform", "cfg-" + (i % 4 + 1).ToString(CultureInfo.InvariantCulture));
        return items;
    }
}
