using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Certificate expiries and password expiries on a calendar (docs/calendar.md). calendar-certificates.html (and -dark): 3,000
/// certificates over the next year, with a facet panel (issuer, status, environment, owner) beside the calendar, a month that
/// folds a busy day into "+N more", and a resource timeline per issuer at month zoom. calendar-passwords.html (and -dark): the
/// password expiries of a directory as an all-day agenda per person, grouped by department in the timeline.
/// </summary>
internal static class CalendarCertificatesExample {
    private static readonly string[] Issuers = { "Public CA G2", "Public CA G3", "Internal Issuing CA 1", "Internal Issuing CA 2", "Partner CA" };
    private static readonly string[] Owners = { "Web", "Payments", "Identity", "Messaging", "Platform", "Data" };
    private static readonly string[] Environments = { "Production", "Staging", "Test" };
    private static readonly string[] Domains = { "portal", "api", "mail", "vpn", "sso", "shop", "files", "status", "docs", "intranet", "crm", "pay" };

    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            Certificates().SaveHtmlPage(Path.Combine(output, "calendar-certificates" + suffix + ".html"), new CanopyHtmlOptions { Title = "Certificate expiries", Theme = theme, Height = "760px" });
            Passwords().SaveHtmlPage(Path.Combine(output, "calendar-passwords" + suffix + ".html"), new CanopyHtmlOptions { Title = "Password expiries", Theme = theme, Height = "700px" });
        }
    }

    internal static CanopyDataGridView Certificates(int count = 3000) {
        var view = new CanopyDataGridView("certificate-expiries", "Certificate expiries") { Selection = CanopySelectionMode.Single, PageSize = 200, Noun = "certificates", RowAction = CanopyGridRowAction.Details };
        view.Columns.Add(new CanopyColumn("cn", "Common name") { Sortable = true, RowHeader = true, Presenter = CanopyGridPresenter.Identifier() });
        view.Columns.Add(new CanopyColumn("expires", "Expires") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("status", "Status") {
            Sortable = true, Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> { ["Expired"] = CanopyTone.Danger, ["Expiring"] = CanopyTone.Warning, ["Renewal ordered"] = CanopyTone.Info, ["Valid"] = CanopyTone.Neutral, ["Renewed"] = CanopyTone.Success })
        });
        view.Columns.Add(new CanopyColumn("issuer", "Issuer") { Sortable = true });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Sortable = true });
        view.Columns.Add(new CanopyColumn("environment", "Environment") { Sortable = true });
        view.Columns.Add(new CanopyColumn("days", "Days left") { Kind = CanopyColumnKind.Number, Sortable = true });
        var tree = new CanopyTreeView("issuers", "Issuers") { Selection = CanopySelectionMode.Single };
        tree.Columns.Add(new CanopyColumn("name", "Issuer") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(180) });
        tree.Columns.Add(new CanopyColumn("count", "Expiring") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Preferred(80) });
        foreach (var kind in new[] { "Public", "Internal", "Partner" }) {
            var group = new CanopyNode("kind-" + kind.ToLowerInvariant(), kind) { Expanded = true };
            foreach (var issuer in Issuers.Where(item => item.StartsWith(kind, StringComparison.Ordinal))) group.Children.Add(new CanopyNode(Key(issuer), issuer));
            tree.Roots.Add(group);
        }
        var calendar = view.Calendar = new CanopyCalendar("expires") {
            Title = "cn", Subtitle = "owner", Status = "status", Resource = "issuer", Date = CalendarExample.Today, FirstDay = DayOfWeek.Monday,
            Zoom = CanopyCalendarZoom.Month, Resources = new CanopyCalendarResources(tree) { Label = "Issuers", Width = 280 }
        };
        foreach (var item in new[] { CanopyCalendarView.Month, CanopyCalendarView.Agenda, CanopyCalendarView.Year, CanopyCalendarView.Timeline }) calendar.Views.Add(item);
        calendar.Resources.Aggregates["count"] = CanopyCalendarAggregate.Count;
        calendar.Capacity = new CanopyCalendarCapacity { Label = "Expiring at once" }.Add(40, CanopyTone.Warning).Add(80, CanopyTone.Danger);
        view.FacetPanel = new CanopyFacetPanel().Add("issuer").Add("status").Add("environment").Add("owner");
        var random = new Random(5);
        for (var i = 0; i < count; i++) {
            var days = (int)Math.Round(-20 + Math.Pow(random.NextDouble(), 0.85) * 380);
            // A quarter of the certificates cluster on the end of a month, where batch renewals land.
            if (i % 4 == 0) days = (int)(CalendarExample.Today.AddMonths(1 + i % 11).AddDays(-1 - i % 3) - CalendarExample.Today).TotalDays;
            var expires = CalendarExample.Today.AddDays(days).AddHours(random.Next(24)).AddMinutes(random.Next(4) * 15);
            var issuer = Issuers[(int)(random.NextDouble() * random.NextDouble() * Issuers.Length)];
            var row = new CanopyGridRow("cert-" + i.ToString("0000", CultureInfo.InvariantCulture));
            row.Cells["cn"] = Domains[i % Domains.Length] + (i / Domains.Length).ToString(CultureInfo.InvariantCulture) + ".example.com";
            row.Cells["expires"] = expires;
            // Most certificates past their date were renewed in time; a few were not.
            row.Cells["status"] = days < 0 ? (i % 7 == 0 ? "Expired" : "Renewed") : days < 30 ? (i % 3 == 0 ? "Renewal ordered" : "Expiring") : "Valid";
            row.Cells["issuer"] = new CanopyCell(Key(issuer)) { Text = issuer };
            row.Cells["owner"] = Owners[(i * 7 + i / 13) % Owners.Length];
            row.Cells["environment"] = Environments[i % 7 == 0 ? 2 : i % 3 == 0 ? 1 : 0];
            row.Cells["days"] = days;
            view.Rows.Add(row);
        }
        return view;
    }

    private static string Key(string issuer) => issuer.ToLowerInvariant().Replace(' ', '-');

    internal static CanopyDataGridView Passwords() {
        var view = new CanopyDataGridView("password-expiries", "Password expiries") { Selection = CanopySelectionMode.Single, PageSize = 200, Noun = "accounts" };
        view.Columns.Add(new CanopyColumn("account", "Account") { Sortable = true, RowHeader = true, Presenter = CanopyGridPresenter.Identifier() });
        view.Columns.Add(new CanopyColumn("name", "Person") { Sortable = true });
        view.Columns.Add(new CanopyColumn("expires", "Password expires") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("allDay", "All day") { Hidden = true, ShowInDrawer = false });
        view.Columns.Add(new CanopyColumn("department", "Department") { Sortable = true });
        view.Columns.Add(new CanopyColumn("state", "State") {
            Sortable = true, Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> { ["Expired"] = CanopyTone.Danger, ["Expires soon"] = CanopyTone.Warning, ["Notified"] = CanopyTone.Info })
        });
        var first = new[] { "Anna", "Bruno", "Chiara", "Dawid", "Elena", "Felix", "Greta", "Hugo", "Iga", "Jonas", "Klara", "Luca", "Marta", "Noah", "Olga", "Pablo" };
        var last = new[] { "Nowak", "Weber", "Rossi", "Garcia", "Dubois", "Kowalska", "Meyer", "Costa" };
        var departments = new[] { "Finance", "Sales", "Engineering", "Support" };
        var tree = new CanopyTreeView("people", "People") { Selection = CanopySelectionMode.Single };
        tree.Columns.Add(new CanopyColumn("name", "Person") { Sizing = CanopyColumnSizing.Preferred(200) });
        var groups = departments.ToDictionary(item => item, item => new CanopyNode("dept-" + item.ToLowerInvariant(), item) { Expanded = true });
        var calendar = view.Calendar = new CanopyCalendar("expires") {
            Title = "name", Subtitle = "account", Status = "state", AllDay = "allDay", Resource = "account", View = CanopyCalendarView.Agenda, Date = CalendarExample.Today,
            FirstDay = DayOfWeek.Monday, Zoom = CanopyCalendarZoom.Day, Resources = new CanopyCalendarResources(tree) { Label = "People" }
        };
        foreach (var item in new[] { CanopyCalendarView.Agenda, CanopyCalendarView.Month, CanopyCalendarView.Timeline }) calendar.Views.Add(item);
        var taken = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < 160; i++) {
            var name = first[i % first.Length] + " " + last[(i * 3 + i / 16) % last.Length];
            var stem = (first[i % first.Length].Substring(0, 1) + "." + last[(i * 3 + i / 16) % last.Length]).ToLowerInvariant();
            var account = stem;
            for (var n = 2; !taken.Add(account); n++) account = stem + n.ToString(CultureInfo.InvariantCulture);
            var day = -6 + i * 37 % 70;
            var department = departments[i % departments.Length];
            groups[department].Children.Add(new CanopyNode(account, name));
            var row = new CanopyGridRow(account);
            row.Cells["account"] = account;
            row.Cells["name"] = name;
            row.Cells["expires"] = CalendarExample.Today.AddDays(day);
            row.Cells["allDay"] = true;
            row.Cells["department"] = department;
            row.Cells["state"] = day < 0 ? "Expired" : day < 7 ? "Expires soon" : "Notified";
            view.Rows.Add(row);
        }
        foreach (var department in departments) tree.Roots.Add(groups[department]);
        return view;
    }
}
