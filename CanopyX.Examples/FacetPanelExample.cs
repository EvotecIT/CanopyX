using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// The facet panel (docs/facets.md): a request queue whose category, priority, team and region facets list their values with
/// counts, and whose opened date and age facets draw histograms; the facets filter each other and the grid. facets.html puts
/// the panel beside the grid, facets-top.html above it and facets-toolbar.html in compact toolbar menus.
/// </summary>
internal static class FacetPanelExample {
    private static readonly string[] Categories = { "Access", "Hardware", "Network", "Software", "Billing", "Accounts" };
    private static readonly string[] Priorities = { "Low", "Normal", "High", "Urgent" };
    private static readonly string[] Teams = { "Service desk", "Field support", "Platform", "Identity", "Finance" };
    private static readonly string[] Regions = { "North", "South", "East", "West" };
    private static readonly string[] Subjects = { "Cannot sign in", "Laptop battery swells", "VPN drops every hour", "Licence renewal", "Invoice mismatch",
        "New starter account", "Printer offline", "Mailbox full", "Password reset loop", "Dock not detected", "Slow file share", "Access to reports" };

    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            Create(CanopyFacetPosition.Side).SaveHtmlPage(Path.Combine(output, "facets" + suffix + ".html"),
                new CanopyHtmlOptions { Title = "Requests with a facet panel", Theme = theme, Height = "640px" });
            Create(CanopyFacetPosition.Top).SaveHtmlPage(Path.Combine(output, "facets-top" + suffix + ".html"),
                new CanopyHtmlOptions { Title = "Requests with facets above", Theme = theme, Height = "560px" });
            Create(CanopyFacetPosition.Toolbar).SaveHtmlPage(Path.Combine(output, "facets-toolbar" + suffix + ".html"),
                new CanopyHtmlOptions { Title = "Requests with toolbar facets", Theme = theme, Height = "640px" });
        }
    }

    internal static CanopyDataGridView Create(CanopyFacetPosition position) {
        var view = new CanopyDataGridView(position == CanopyFacetPosition.Top ? "requests-top" : position == CanopyFacetPosition.Toolbar ? "requests-toolbar" : "requests", "Requests") {
            Selection = CanopySelectionMode.Multiple, PageSize = 200, Noun = "requests", RowAction = CanopyGridRowAction.Details, StateKey = "facet-example"
        };
        view.Columns.Add(new CanopyColumn("number", "Request") { Sortable = true, RowHeader = true, Sizing = CanopyColumnSizing.Content() });
        view.Columns.Add(new CanopyColumn("subject", "Subject") { Sortable = true, Sizing = CanopyColumnSizing.Flex(1, 160, 520, preferredWidth: 240) });
        view.Columns.Add(new CanopyColumn("category", "Category") { Sortable = true, ResponsivePriority = 3 });
        view.Columns.Add(new CanopyColumn("priority", "Priority") {
            Sortable = true, ResponsivePriority = 1,
            Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> { ["Urgent"] = CanopyTone.Danger, ["High"] = CanopyTone.Warning, ["Normal"] = CanopyTone.Info })
        });
        view.Columns.Add(new CanopyColumn("team", "Team") { Sortable = true, ResponsivePriority = 4 });
        view.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true, ResponsivePriority = 5 });
        view.Columns.Add(new CanopyColumn("opened", "Opened") { Kind = CanopyColumnKind.DateTime, Sortable = true, ResponsivePriority = 6 });
        view.Columns.Add(new CanopyColumn("age", "Age (days)") { Kind = CanopyColumnKind.Number, Sortable = true, ResponsivePriority = 2 });
        view.FacetPanel = new CanopyFacetPanel { Position = position }
            .Add("category").Add("priority").Add("team").Add("region").Add("opened").Add("age");
        view.FacetPanel.Facets[1].Sort = CanopyFacetSort.Value;
        var start = new DateTime(2026, 7, 1, 8, 0, 0, DateTimeKind.Utc);
        for (var i = 0; i < 240; i++) {
            var row = new CanopyGridRow("req-" + (1000 + i).ToString(CultureInfo.InvariantCulture));
            row.Cells["number"] = "REQ-" + (1000 + i).ToString(CultureInfo.InvariantCulture);
            row.Cells["subject"] = Subjects[i * 7 % Subjects.Length];
            row.Cells["category"] = Categories[(i * 5 + i / 9) % Categories.Length];
            row.Cells["priority"] = Priorities[i % 13 == 0 ? 3 : i % 5 == 0 ? 2 : i % 3 == 0 ? 0 : 1];
            row.Cells["team"] = Teams[(i * 3 + i / 17) % Teams.Length];
            row.Cells["region"] = i % 23 == 0 ? null! : Regions[i % Regions.Length];
            var opened = start.AddHours(i * 9.7 + i % 7 * 13);
            row.Cells["opened"] = opened;
            row.Cells["age"] = (int)Math.Round((new DateTime(2026, 10, 15, 8, 0, 0, DateTimeKind.Utc) - opened).TotalDays);
            view.Rows.Add(row);
        }
        return view;
    }
}
