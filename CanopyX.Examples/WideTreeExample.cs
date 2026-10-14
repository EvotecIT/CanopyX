using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// A wide tree of a document library: more columns than a laptop screen holds. The tree column and the owner pin left, the
/// status pins right, the description takes the spare width (flex), the least important columns hide first on narrow
/// screens, and the long path shows in full in a tooltip when it is cut off.
/// </summary>
internal static class WideTreeExample {
    private static readonly string[] Teams = { "Finance", "Legal", "Marketing", "Operations", "Research" };
    private static readonly string[] Types = { "Policy", "Contract", "Report", "Template", "Minutes" };
    private static readonly string[] Folders = { "Policies", "Contracts", "Reports" };
    private static readonly string[] States = { "Published", "Draft", "In review", "Archived" };

    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark })
            Create().SaveHtmlPage(Path.Combine(output, "wide-tree" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"),
                new CanopyHtmlOptions { Title = "Document library", Theme = theme });
    }

    internal static CanopyTreeView Create() {
        var view = new CanopyTreeView("library", "Document library") { Selection = CanopySelectionMode.Single, Search = new CanopySearchOptions(), StateKey = "wide-tree" };
        view.Columns.Add(new CanopyColumn("name", "Name") { Tooltip = CanopyColumn.AutoTooltip });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Pinned = CanopyGridColumnPin.Left });
        view.Columns.Add(new CanopyColumn("type", "Type"));
        view.Columns.Add(new CanopyColumn("version", "Version") { Kind = CanopyColumnKind.Number, ResponsivePriority = 10000 });
        view.Columns.Add(new CanopyColumn("modified", "Modified") { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("reviewer", "Reviewer") { ResponsivePriority = 10000 });
        view.Columns.Add(new CanopyColumn("path", "Path") { Tooltip = CanopyColumn.AutoTooltip, Sizing = CanopyColumnSizing.Content(maximum: 260) });
        view.Columns.Add(new CanopyColumn("description", "Description") { Sizing = CanopyColumnSizing.Flex(1) });
        view.Columns.Add(new CanopyColumn("status", "Status") { Pinned = CanopyGridColumnPin.Right });
        var epoch = new DateTime(2026, 1, 5, 9, 0, 0, DateTimeKind.Utc);
        for (var t = 0; t < Teams.Length; t++) {
            var team = Node("team-" + t, Teams[t] + " documents", t, 0, epoch, "/library/" + Teams[t].ToLowerInvariant());
            team.Expanded = t < 2;
            for (var f = 0; f < 3; f++) {
                var folderPath = "/library/" + Teams[t].ToLowerInvariant() + "/" + Folders[f].ToLowerInvariant();
                var folder = Node("team-" + t + "-" + f, Folders[f] + " " + (2024 + f), t, f, epoch, folderPath);
                folder.Expanded = t == 0 && f == 0;
                for (var d = 0; d < 4; d++)
                    folder.Children.Add(Node("doc-" + t + "-" + f + "-" + d, Types[(f + d) % Types.Length] + " " + (d + 1) + " for the " + Teams[t].ToLowerInvariant() + " programme",
                        t, f + d, epoch, folderPath + "/" + Types[(f + d) % Types.Length].ToLowerInvariant() + "-" + (d + 1) + "-final-reviewed-and-approved.docx"));
                team.Children.Add(folder);
            }
            view.Roots.Add(team);
        }
        return view;
    }

    private static CanopyNode Node(string id, string label, int team, int index, DateTime epoch, string path) {
        var node = new CanopyNode(id, label);
        node.Cells["owner"] = Teams[team] + " team";
        node.Cells["type"] = Types[index % Types.Length];
        node.Cells["version"] = 1 + index % 4;
        node.Cells["modified"] = epoch.AddDays(team * 17 + index * 5);
        node.Cells["reviewer"] = "Reviewer " + (char)('A' + (team + index) % 26);
        node.Cells["path"] = path;
        node.Cells["description"] = "Keeps the " + Types[index % Types.Length].ToLowerInvariant() + " of the " + Teams[team].ToLowerInvariant() + " team with its history and approvals";
        node.Cells["status"] = States[(team + index) % States.Length];
        return node;
    }
}
