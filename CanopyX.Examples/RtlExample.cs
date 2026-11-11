using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// A tree and a flat grid laid out right to left, with Hebrew labels: rtl-tree.html and rtl-grid.html. Both are wider than
/// a laptop screen, so they scroll sideways. The tree column (and the first grid column) stays pinned at the right edge, a
/// column pinned "right" (the end edge) stays at the left edge, the expanders point left, and the arrow keys follow the
/// reading direction: Left opens a folder and moves on to the next cell, Right closes it and moves back.
/// </summary>
internal static class RtlExample {
    private static readonly string[] Teams = { "כספים", "משפטית", "שיווק", "תפעול", "מחקר" };
    private static readonly string[] Types = { "מדיניות", "חוזה", "דוח", "תבנית", "פרוטוקול" };
    private static readonly string[] Folders = { "מדיניות", "חוזים", "דוחות" };
    private static readonly string[] States = { "פורסם", "טיוטה", "בבדיקה", "בארכיון" };

    internal static void Write(string output) {
        var options = new CanopyHtmlOptions { Title = "ספריית מסמכים", Language = "he", Direction = CanopyTextDirection.Rtl };
        Tree().SaveHtmlPage(Path.Combine(output, "rtl-tree.html"), options);
        Grid().SaveHtmlPage(Path.Combine(output, "rtl-grid.html"), new CanopyHtmlOptions { Title = "רשימת מסמכים", Language = "he", Direction = CanopyTextDirection.Rtl });
    }

    private static CanopyTreeView Tree() {
        var view = new CanopyTreeView("rtl-library", "ספריית מסמכים") { Selection = CanopySelectionMode.Single, PinTreeColumn = true };
        view.Columns.Add(new CanopyColumn("name", "שם") { Sizing = CanopyColumnSizing.Fixed(280) });
        AddColumns(view.Columns);
        var epoch = new DateTime(2026, 1, 5, 9, 0, 0, DateTimeKind.Utc);
        for (var t = 0; t < Teams.Length; t++) {
            var team = Node("team-" + t, "מסמכי " + Teams[t], t, 0, epoch);
            team.Expanded = t == 0;
            for (var f = 0; f < Folders.Length; f++) {
                var folder = Node("team-" + t + "-" + f, Folders[f] + " " + (2024 + f), t, f, epoch);
                folder.Expanded = t == 0 && f == 0;
                for (var d = 0; d < 4; d++)
                    folder.Children.Add(Node("doc-" + t + "-" + f + "-" + d, Types[(f + d) % Types.Length] + " " + (d + 1), t, f + d, epoch));
                if (t == 0 && f == 0)
                    folder.Children.Add(new CanopyNode("doc-0-0-notes", "הערות גרסה") {
                        Detail = new CanopyPropertiesDetail().Add("מחבר", "צוות " + Teams[0]).Add("גרסה", 3)
                    });
                team.Children.Add(folder);
            }
            view.Roots.Add(team);
        }
        return view;
    }

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("rtl-documents", "רשימת מסמכים") { Selection = CanopySelectionMode.Single };
        view.Columns.Add(new CanopyColumn("name", "שם") { Sizing = CanopyColumnSizing.Fixed(220), Pinned = CanopyGridColumnPin.Left });
        AddColumns(view.Columns);
        var epoch = new DateTime(2026, 1, 5, 9, 0, 0, DateTimeKind.Utc);
        for (var i = 0; i < 60; i++) {
            var row = new CanopyGridRow("doc-" + i);
            row.Cells["name"] = Types[i % Types.Length] + " " + (i + 1);
            Fill(row.Cells, i % Teams.Length, i, epoch);
            view.Rows.Add(row);
        }
        return view;
    }

    private static void AddColumns(IList<CanopyColumn> columns) {
        columns.Add(new CanopyColumn("owner", "בעלים") { Sizing = CanopyColumnSizing.Fixed(160) });
        columns.Add(new CanopyColumn("type", "סוג") { Sizing = CanopyColumnSizing.Fixed(140) });
        columns.Add(new CanopyColumn("version", "גרסה") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Fixed(100) });
        columns.Add(new CanopyColumn("modified", "עודכן") { Kind = CanopyColumnKind.DateTime, Sizing = CanopyColumnSizing.Fixed(180) });
        columns.Add(new CanopyColumn("reviewer", "בודק") { Sizing = CanopyColumnSizing.Fixed(160) });
        columns.Add(new CanopyColumn("description", "תיאור") { Sizing = CanopyColumnSizing.Fixed(360) });
        columns.Add(new CanopyColumn("status", "מצב") { Sizing = CanopyColumnSizing.Fixed(120), Pinned = CanopyGridColumnPin.Right });
    }

    private static CanopyNode Node(string id, string label, int team, int index, DateTime epoch) {
        var node = new CanopyNode(id, label);
        Fill(node.Cells, team, index, epoch);
        return node;
    }

    private static void Fill(IDictionary<string, CanopyCell> cells, int team, int index, DateTime epoch) {
        cells["owner"] = "צוות " + Teams[team];
        cells["type"] = Types[index % Types.Length];
        cells["version"] = 1 + index % 4;
        cells["modified"] = epoch.AddDays(team * 17 + index * 5);
        cells["reviewer"] = "בודק " + (index % 7 + 1);
        cells["description"] = "שומר את ה" + Types[index % Types.Length] + " של צוות " + Teams[team] + " עם ההיסטוריה והאישורים";
        cells["status"] = States[(team + index) % States.Length];
    }
}
