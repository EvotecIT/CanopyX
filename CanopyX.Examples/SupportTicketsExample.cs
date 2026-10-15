using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Support tickets: search-hit highlighting with a match count and next/previous navigation, and the Layout menu with the
/// fit, scroll and card layouts and three densities. A knowledge-base tree shows both features on a tree.
/// </summary>
internal static class SupportTicketsExample {
    private static readonly string[] Subjects = {
        "Printer queue stuck after the driver update", "Cannot sign in to the customer portal", "Invoice PDF shows the wrong address",
        "Laptop battery drains overnight", "VPN drops every few minutes on hotel Wi-Fi", "Request a second monitor for the café desk",
        "Shared calendar does not sync on the phone", "Password reset email never arrives", "Scanner saves blank pages to the network folder",
        "Projector in room 4 shows no signal", "Expense report stuck in approval", "New starter needs a printer and badge access"
    };
    private static readonly string[] Customers = { "Zoë Martín", "José Álvarez", "Łukasz Nowak", "Anaïs Dubois", "Sören Lindqvist", "Chloé Bernard", "Ana García", "Piotr Wiśniewski" };
    private static readonly string[] Agents = { "Maya Chen", "Noah Patel", "Lena Schmidt", "Omar Haddad", "Iris Rossi" };
    private static readonly string[] Channels = { "Email", "Portal", "Phone", "Chat" };
    private static readonly (string Name, CanopyTone Tone)[] Statuses = { ("Open", CanopyTone.Info), ("Waiting", CanopyTone.Warning), ("Resolved", CanopyTone.Success), ("Escalated", CanopyTone.Danger) };
    private static readonly string[] Priorities = { "Low", "Normal", "High", "Urgent" };

    internal static void Write(string output) {
        var grid = Tickets(240);
        var tree = KnowledgeBase();
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : "";
            grid.SaveHtmlPage(Path.Combine(output, "support-tickets" + suffix + ".html"), new CanopyHtmlOptions { Title = "Support tickets", Theme = theme });
            tree.SaveHtmlPage(Path.Combine(output, "support-tickets-tree" + suffix + ".html"), new CanopyHtmlOptions { Title = "Support knowledge base", Theme = theme });
        }
    }

    internal static CanopyDataGridView Tickets(int count) {
        var view = new CanopyDataGridView("support-tickets", "Support tickets") {
            Noun = "tickets", Selection = CanopySelectionMode.Multiple, StateKey = "support-tickets", PageSize = 500
        };
        view.SearchHighlight = new CanopySearchHighlight { IgnoreAccents = true };
        view.SearchHighlight.FilterTones["status"] = "info";
        view.Layout = new CanopyLayoutOptions();
        view.Columns.Add(new CanopyColumn("ticket", "Ticket") { Sortable = true, Presenter = CanopyGridPresenter.Identifier(mono: true), RowHeader = true });
        view.Columns.Add(new CanopyColumn("subject", "Subject") { Sortable = true, Sizing = CanopyColumnSizing.Flex(1, 180) });
        view.Columns.Add(new CanopyColumn("customer", "Customer") { Sortable = true });
        view.Columns.Add(new CanopyColumn("status", "Status") { Sortable = true, Presenter = CanopyGridPresenter.Enum() });
        view.Columns.Add(new CanopyColumn("priority", "Priority") { Sortable = true, ResponsivePriority = 20000 });
        view.Columns.Add(new CanopyColumn("agent", "Assignee") { Sortable = true });
        view.Columns.Add(new CanopyColumn("channel", "Channel") { Sortable = true, ResponsivePriority = 20000 });
        view.Columns.Add(new CanopyColumn("replies", "Replies") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("updated", "Updated") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        var start = new DateTimeOffset(2026, 10, 15, 9, 0, 0, TimeSpan.Zero);
        // A seeded generator keeps the page the same on every build.
        var random = new Random(20261015);
        for (var i = 0; i < count; i++) {
            var row = new CanopyGridRow("t" + (1000 + i).ToString(CultureInfo.InvariantCulture));
            var status = Statuses[random.Next(Statuses.Length)];
            row.Cells["ticket"] = "TCK-" + (1000 + i).ToString(CultureInfo.InvariantCulture);
            row.Cells["subject"] = Subjects[random.Next(Subjects.Length)];
            row.Cells["customer"] = Customers[random.Next(Customers.Length)];
            row.Cells["status"] = new CanopyCell(status.Name) { Tone = status.Tone };
            row.Cells["priority"] = Priorities[random.Next(Priorities.Length)];
            row.Cells["agent"] = Agents[random.Next(Agents.Length)];
            row.Cells["channel"] = Channels[random.Next(Channels.Length)];
            row.Cells["replies"] = random.Next(24);
            row.Cells["updated"] = start.AddMinutes(-i * 97 - random.Next(60));
            view.Rows.Add(row);
        }

        view.Query = new CanopyGridQuery(view.Id) { Search = "printer", SearchMode = CanopyGridSearchMode.Words, Limit = view.PageSize };
        return view;
    }

    private static CanopyTreeView KnowledgeBase() {
        var view = new CanopyTreeView("support-knowledge", "Knowledge base") { Search = new CanopySearchOptions { MinLength = 2 } };
        view.SearchHighlight = new CanopySearchHighlight { IgnoreAccents = true };
        view.Layout = new CanopyLayoutOptions();
        view.Columns.Add(new CanopyColumn("name", "Article"));
        view.Columns.Add(new CanopyColumn("owner", "Owner"));
        view.Columns.Add(new CanopyColumn("views", "Views") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("updated", "Updated") { Kind = CanopyColumnKind.DateTime });
        var topics = new[] { ("Printing", new[] { "Clear a stuck printer queue", "Install the printer driver", "Scan to a network folder" }),
            ("Accounts", new[] { "Reset a password", "Sign in to the customer portal", "Set up two-step sign-in" }),
            ("Devices", new[] { "Connect a second monitor", "Extend laptop battery life", "Pair a café desk headset" }) };
        var article = 0;
        foreach (var (topic, articles) in topics) {
            var node = new CanopyNode("kb-" + topic.ToLowerInvariant(), topic) { Expanded = true };
            foreach (var title in articles) {
                var child = new CanopyNode("kb-" + (++article).ToString(CultureInfo.InvariantCulture), title);
                child.Cells["owner"] = Agents[article % Agents.Length];
                child.Cells["views"] = article * 137 % 900;
                child.Cells["updated"] = new DateTimeOffset(2026, 9, 1 + article, 12, 0, 0, TimeSpan.Zero);
                node.Children.Add(child);
            }
            view.Roots.Add(node);
        }
        return view;
    }
}
