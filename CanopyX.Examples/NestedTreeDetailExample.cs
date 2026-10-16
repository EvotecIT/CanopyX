using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A regional inventory whose detail is a tree, with its own labels and time zone.</summary>
internal static class NestedTreeDetailExample {
    internal static void Write(string output) {
        foreach (var local in new[] { false, true }) {
            var view = Create(local);
            var name = "nested-tree-detail" + (local ? "-local" : "");
            File.WriteAllText(Path.Combine(output, name + ".json"), view.ToJson());
            foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark })
                view.SaveHtmlPage(Path.Combine(output, name + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"),
                    new CanopyHtmlOptions { Title = view.Label, Language = "pl", Theme = theme });
        }
    }

    private static CanopyDataGridView Create(bool local) {
        var tree = new CanopyTreeView("nested-services", "Service inventory") {
            TimeZone = local ? CanopyTimeZone.Local : CanopyTimeZone.Utc,
            Labels = new CanopyLabels { Yes = "Available", No = "Unavailable", UtcTime = "{time} service UTC" }
        };
        tree.Columns.Add(new CanopyColumn("name", "Service / capacity") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Preferred(240) });
        tree.Columns.Add(new CanopyColumn("available", "Availability") { Sizing = CanopyColumnSizing.Preferred(140) });
        tree.Columns.Add(new CanopyColumn("checked", "Checked") { Kind = CanopyColumnKind.DateTime, Sizing = CanopyColumnSizing.Preferred(210) });
        var root = new CanopyNode("services", "Services");
        root.Cells["name"] = new CanopyCell(1000L) { Text = "Operations & Support" };
        root.Cells["available"] = true;
        root.Cells["checked"] = new DateTime(2026, 10, 15, 12, 30, 0, DateTimeKind.Utc);
        var absent = new CanopyNode("shared", "Shared services");
        var empty = new CanopyNode("restricted", "Restricted service");
        empty.Cells["name"] = new CanopyCell();
        var typed = new CanopyNode("compute", "Compute pool");
        typed.Cells["name"] = 2000L;
        foreach (var child in new[] { absent, empty, typed }) {
            child.Cells["available"] = false;
            child.Cells["checked"] = new DateTime(2026, 10, 15, 12, 30, 0, DateTimeKind.Utc);
            root.Children.Add(child);
        }
        var payload = new CanopyTreeDetail(); payload.Roots.Add(root);
        var view = new CanopyDataGridView("service-regions", "Regional service inventory") {
            TimeZone = local ? CanopyTimeZone.Utc : CanopyTimeZone.Local,
            Labels = new CanopyLabels { Yes = "Active region", No = "Inactive region", UtcTime = "{time} region UTC" },
            Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { TreeView = tree, Label = "Services" } }
        };
        view.Columns.Add(new CanopyColumn("region", "Region"));
        var row = new CanopyGridRow("north"); row.Cells["region"] = "North"; row.Detail = payload;
        view.Rows.Add(row);
        return view;
    }
}
