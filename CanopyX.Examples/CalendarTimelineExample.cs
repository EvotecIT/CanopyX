using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// The resource timeline (docs/resource-timeline.md): incidents, outages and maintenance per host, with the hosts grouped as a
/// tree by site and role. Group rows show how many events run at once (warning from three, danger from six), the tree shows
/// each resource's event count, busy hours and overlaps, a change freeze and an unavailable host shade the lanes, and events
/// move across hosts with overlaps refused. Writes calendar-timeline.html (and -dark) and calendar-resources.html (and -dark),
/// a day view with one column per engineer and each engineer's own working hours.
/// </summary>
internal static class CalendarTimelineExample {
    private static readonly string[] Sites = { "Warsaw", "Berlin", "Madrid", "Paris", "Milan" };
    private static readonly string[] Roles = { "Web", "Database", "Storage" };
    private static readonly string[] Kinds = { "Incident", "Outage", "Maintenance", "Change" };

    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            Create().SaveHtmlPage(Path.Combine(output, "calendar-timeline" + suffix + ".html"), new CanopyHtmlOptions { Title = "Incidents by host", Theme = theme, Height = "760px" });
            Resources().SaveHtmlPage(Path.Combine(output, "calendar-resources" + suffix + ".html"), new CanopyHtmlOptions { Title = "Engineers' day", Theme = theme, Height = "760px" });
        }
    }

    private static string HostId(int site, int role, int index) =>
        (Sites[site].Substring(0, 3) + "-" + Roles[role].Substring(0, 2) + "-" + index.ToString("00", CultureInfo.InvariantCulture)).ToLowerInvariant();

    internal static CanopyDataGridView Create(int hostsPerRole = 6, int events = 720) {
        var view = new CanopyDataGridView("host-events", "Incidents and maintenance") { Selection = CanopySelectionMode.Single, PageSize = 200, Noun = "events" };
        view.Columns.Add(new CanopyColumn("title", "Event") { Sortable = true, RowHeader = true });
        view.Columns.Add(new CanopyColumn("kind", "Kind") {
            Sortable = true,
            Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> { ["Outage"] = CanopyTone.Danger, ["Incident"] = CanopyTone.Warning, ["Maintenance"] = CanopyTone.Info, ["Change"] = CanopyTone.Neutral })
        });
        view.Columns.Add(new CanopyColumn("starts", "Starts") { Kind = CanopyColumnKind.DateTime, Sortable = true, Editable = true });
        view.Columns.Add(new CanopyColumn("ends", "Ends") { Kind = CanopyColumnKind.DateTime, Sortable = true, Editable = true });
        view.Columns.Add(new CanopyColumn("host", "Host") { Sortable = true, Editable = true });
        view.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        view.Columns.Add(new CanopyColumn("allowed", "Allowed hosts") { Hidden = true, ShowInDrawer = false });
        view.Columns.Add(new CanopyColumn("rule", "Recurrence") { Hidden = true });

        var tree = new CanopyTreeView("hosts", "Hosts") { Selection = CanopySelectionMode.Single, RowHeight = 34 };
        tree.Columns.Add(new CanopyColumn("name", "Host") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(150) });
        tree.Columns.Add(new CanopyColumn("events", "Events") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Preferred(66) });
        tree.Columns.Add(new CanopyColumn("busy", "Busy") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Preferred(76) });
        tree.Columns.Add(new CanopyColumn("overlap", "Overlaps") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Preferred(84) });
        var hosts = new List<(string Id, int Site, int Role)>();
        for (var site = 0; site < Sites.Length; site++) {
            var siteNode = new CanopyNode("site-" + Sites[site].ToLowerInvariant(), Sites[site]) { Expanded = site < 2 };
            for (var role = 0; role < Roles.Length; role++) {
                var roleNode = new CanopyNode("role-" + Sites[site].ToLowerInvariant() + "-" + Roles[role].ToLowerInvariant(), Roles[role]) { Expanded = true };
                for (var index = 1; index <= hostsPerRole; index++) {
                    var id = HostId(site, role, index);
                    hosts.Add((id, site, role));
                    roleNode.Children.Add(new CanopyNode(id, id));
                }
                siteNode.Children.Add(roleNode);
            }
            tree.Roots.Add(siteNode);
        }

        var calendar = view.Calendar = new CanopyCalendar("starts") {
            End = "ends", Title = "title", Status = "kind", Resource = "host", Recurrence = "rule", View = CanopyCalendarView.Timeline, Zoom = CanopyCalendarZoom.Day,
            Date = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc), FirstDay = DayOfWeek.Monday, Resources = new CanopyCalendarResources(tree) { Label = "Hosts", Width = 392 },
            Capacity = new CanopyCalendarCapacity().Add(4, CanopyTone.Warning).Add(7, CanopyTone.Danger),
            Editing = new CanopyCalendarEditing { Overlap = false, AllowedResources = "allowed", SnapMinutes = 15 }
        };
        foreach (var item in new[] { CanopyCalendarView.Timeline, CanopyCalendarView.Month, CanopyCalendarView.Week, CanopyCalendarView.Agenda }) calendar.Views.Add(item);
        calendar.Resources.Aggregates["events"] = CanopyCalendarAggregate.Count;
        calendar.Resources.Aggregates["busy"] = CanopyCalendarAggregate.Busy;
        calendar.Resources.Aggregates["overlap"] = CanopyCalendarAggregate.Overlap;
        calendar.Ranges.Add(new CanopyCalendarRange(new DateTime(2026, 10, 26, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 31, 0, 0, 0, DateTimeKind.Utc), "Change freeze") { Tone = CanopyTone.Info });
        calendar.Ranges.Add(new CanopyCalendarRange(new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 18, 0, 0, 0, DateTimeKind.Utc), "Hardware swap") { Resource = HostId(0, 0, 2), Kind = CanopyCalendarRangeKind.Unavailable });
        calendar.Availability.Add(new CanopyCalendarAvailability(TimeSpan.FromHours(6), TimeSpan.FromHours(22)));

        var random = new Random(23);
        var start = new DateTime(2026, 9, 26, 0, 0, 0, DateTimeKind.Utc);
        for (var i = 0; i < events; i++) {
            var host = hosts[(int)(Math.Pow(random.NextDouble(), 1.15) * hosts.Count)];
            var kind = Kinds[random.Next(10) switch { 0 => 1, < 5 => 0, < 8 => 2, _ => 3 }];
            var begins = start.AddMinutes(random.Next(0, 40 * 24 * 4) * 15);
            var row = new CanopyGridRow("event-" + i.ToString("0000", CultureInfo.InvariantCulture));
            row.Cells["title"] = kind + " " + (1000 + i).ToString(CultureInfo.InvariantCulture);
            row.Cells["kind"] = kind;
            row.Cells["starts"] = begins;
            if (kind != "Change") row.Cells["ends"] = begins.AddMinutes(30 + random.Next(1, 16) * 30);
            row.Cells["host"] = host.Id;
            row.Cells["site"] = Sites[host.Site];
            row.Cells["allowed"] = string.Join(",", hosts.Where(item => item.Site == host.Site && item.Role == host.Role).Select(item => item.Id));
            view.Rows.Add(row);
        }
        for (var role = 0; role < Roles.Length; role++) {
            var window = new CanopyGridRow("window-" + role.ToString(CultureInfo.InvariantCulture));
            window.Cells["title"] = Roles[role] + " maintenance window";
            window.Cells["kind"] = "Maintenance";
            window.Cells["starts"] = new DateTime(2026, 9, 1 + role, 22, 0, 0, DateTimeKind.Utc);
            window.Cells["ends"] = new DateTime(2026, 9, 2 + role, 1, 0, 0, DateTimeKind.Utc);
            window.Cells["host"] = HostId(0, role, 1);
            window.Cells["site"] = Sites[0];
            window.Cells["rule"] = CanopyRecurrence.Weekly(new[] { DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday }[role]).ToString();
            view.Rows.Add(window);
        }
        return view;
    }

    /// <summary>Six engineers as resource columns of the day and week views, each with working hours of their own.</summary>
    internal static CanopyDataGridView Resources() {
        var view = new CanopyDataGridView("engineer-day", "Engineers' day") { Selection = CanopySelectionMode.Single, PageSize = 200, Noun = "tasks" };
        view.Columns.Add(new CanopyColumn("title", "Task") { Sortable = true, RowHeader = true });
        view.Columns.Add(new CanopyColumn("status", "Status") {
            Sortable = true,
            Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> { ["Urgent"] = CanopyTone.Danger, ["Scheduled"] = CanopyTone.Info, ["Done"] = CanopyTone.Success })
        });
        view.Columns.Add(new CanopyColumn("starts", "Starts") { Kind = CanopyColumnKind.DateTime, Sortable = true, Editable = true });
        view.Columns.Add(new CanopyColumn("ends", "Ends") { Kind = CanopyColumnKind.DateTime, Sortable = true, Editable = true });
        view.Columns.Add(new CanopyColumn("engineer", "Engineer") { Sortable = true, Editable = true });
        var people = new[] { ("ada", "Ada", "Network"), ("ben", "Ben", "Network"), ("cleo", "Cleo", "Storage"), ("dev", "Dev", "Storage"), ("eli", "Eli", "Identity"), ("fay", "Fay", "Identity") };
        var tree = new CanopyTreeView("engineers", "Engineers") { Selection = CanopySelectionMode.Single };
        tree.Columns.Add(new CanopyColumn("name", "Engineer") { Sizing = CanopyColumnSizing.Preferred(160) });
        foreach (var team in people.Select(person => person.Item3).Distinct()) {
            var node = new CanopyNode("team-" + team.ToLowerInvariant(), team) { Expanded = true };
            foreach (var person in people.Where(item => item.Item3 == team)) node.Children.Add(new CanopyNode(person.Item1, person.Item2));
            tree.Roots.Add(node);
        }
        var calendar = view.Calendar = new CanopyCalendar("starts") {
            End = "ends", Title = "title", Status = "status", Resource = "engineer", View = CanopyCalendarView.Day, Date = CalendarExample.Today,
            FirstDay = DayOfWeek.Monday, MinTime = TimeSpan.FromHours(6), MaxTime = TimeSpan.FromHours(21), ScrollTime = TimeSpan.FromHours(7),
            Resources = new CanopyCalendarResources(tree), Editing = new CanopyCalendarEditing { Overlap = false, WorkingHoursOnly = true }
        };
        foreach (var item in new[] { CanopyCalendarView.Day, CanopyCalendarView.Week, CanopyCalendarView.Timeline }) calendar.Views.Add(item);
        calendar.HiddenDays.Add(DayOfWeek.Saturday); calendar.HiddenDays.Add(DayOfWeek.Sunday);
        var shifts = new[] { (7, 15), (9, 17), (8, 16), (10, 18), (12, 20), (6, 14) };
        for (var i = 0; i < people.Length; i++) calendar.Availability.Add(new CanopyCalendarAvailability(TimeSpan.FromHours(shifts[i].Item1), TimeSpan.FromHours(shifts[i].Item2)) { Resource = people[i].Item1 });
        var tasks = new[] { "Replace switch module", "Rack new hosts", "Firmware update", "Review alerts", "Storage expansion", "Rotate keys", "Directory clean-up", "Backup restore test", "Cabling audit", "Patch hosts" };
        var number = 0;
        for (var day = 12; day <= 23; day++) {
            if (new DateTime(2026, 10, day).DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) continue;
            for (var p = 0; p < people.Length; p++) {
                for (var slot = 0; slot < 3; slot++) {
                    var begins = new DateTime(2026, 10, day, shifts[p].Item1 + slot * 3 + (p + day) % 2, (p * 15 + day * 5) % 60 / 15 * 15, 0, DateTimeKind.Utc);
                    var row = new CanopyGridRow("task-" + (++number).ToString("000", CultureInfo.InvariantCulture));
                    row.Cells["title"] = tasks[(p * 3 + slot + day) % tasks.Length];
                    row.Cells["status"] = day < 16 ? "Done" : (p + slot + day) % 7 == 0 ? "Urgent" : "Scheduled";
                    row.Cells["starts"] = begins;
                    row.Cells["ends"] = begins.AddMinutes(60 + (p + slot) % 3 * 30);
                    row.Cells["engineer"] = people[p].Item1;
                    view.Rows.Add(row);
                }
            }
        }
        return view;
    }
}
