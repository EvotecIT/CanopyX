using System.Globalization;
using System.Reflection;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Generic tree grids for the tree toolbar, column fitting and auto height: an organisation chart with many columns,
/// a file system with deep folders, and nested groups that start collapsed to three rows.
/// </summary>
internal static class TreeParityExample {
    private static readonly string[] Departments = { "Engineering", "Finance", "Operations", "Sales", "Support" };
    private static readonly string[] Locations = { "Warsaw", "Berlin", "Madrid", "London", "Toronto", "Singapore" };
    private static readonly DateTime Epoch = new DateTime(2015, 1, 5, 9, 0, 0, DateTimeKind.Utc);

    internal static void Write(string output) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.tree-parity.html")!;
        using var reader = new StreamReader(stream);
        var template = reader.ReadToEnd();
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var options = new CanopyHtmlOptions { Theme = theme, Height = "420px" };
            var page = template.Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.TreeGrid))
                .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.TreeGrid))
                .Replace("{{theme}}", theme == CanopyTheme.Dark ? "dark" : "light")
                .Replace("{{org}}", OrgChart().ToHtmlFragment(options))
                .Replace("{{files}}", FileSystem().ToHtmlFragment(options))
                .Replace("{{groups}}", Groups().ToHtmlFragment(options));
            File.WriteAllText(Path.Combine(output, "tree-parity" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"), page);
        }
    }

    /// <summary>A chief executive, five vice presidents, twenty directors, sixty managers and 360 staff.</summary>
    internal static CanopyTreeView OrgChart() {
        var view = new CanopyTreeView("org-chart", "Organisation chart") {
            Selection = CanopySelectionMode.Multiple,
            Search = new CanopySearchOptions { Placeholder = "Search people" },
            StateKey = "tree-parity-org"
        };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("title", "Title") { Sortable = true });
        view.Columns.Add(new CanopyColumn("department", "Department") { Sortable = true });
        view.Columns.Add(new CanopyColumn("location", "Location") { ResponsivePriority = 10000 });
        view.Columns.Add(new CanopyColumn("email", "Email") { ResponsivePriority = 10001 });
        view.Columns.Add(new CanopyColumn("reports", "Reports") { Kind = CanopyColumnKind.Number, Sortable = true, ResponsivePriority = 0 });
        view.Columns.Add(new CanopyColumn("started", "Started") { Kind = CanopyColumnKind.DateTime, ResponsivePriority = 10000 });
        view.Filters.Add(new CanopyFilter("managers", "Managers only", "manager"));
        // The page registers an Excel writer; the Export menu offers it after CSV.
        view.ExportFormats.Add("xlsx");
        var ceo = Person("ceo", "Morgan Avery", "Chief Executive Officer", 0, 0);
        ceo.Expanded = true;
        for (var v = 0; v < 5; v++) {
            var vp = Person("vp" + v, "Vice President " + (char)('A' + v), "Vice President, " + Departments[v], v, v + 1);
            vp.Expanded = v < 2;
            for (var d = 0; d < 4; d++) {
                var director = Person(vp.Id + "-d" + d, "Director " + (char)('A' + v) + (d + 1), "Director of " + Departments[v] + " " + (d + 1), v, d + 2);
                for (var m = 0; m < 3; m++) {
                    var manager = Person(director.Id + "-m" + m, "Manager " + (char)('A' + v) + (d + 1) + "." + (m + 1), "Team Manager", v, m + d + 3);
                    for (var s = 0; s < 6; s++) {
                        manager.Children.Add(Person(manager.Id + "-s" + s, "Staff member " + (char)('A' + v) + (d + 1) + "." + (m + 1) + "." + (s + 1),
                            s % 3 == 0 ? "Senior Specialist" : "Specialist", v, s + m + d + 4));
                    }
                    Reports(manager);
                    director.Children.Add(manager);
                }
                Reports(director);
                vp.Children.Add(director);
            }
            Reports(vp);
            ceo.Children.Add(vp);
        }
        Reports(ceo);
        view.Roots.Add(ceo);
        return view;
    }

    private static CanopyNode Person(string id, string name, string title, int department, int seed) {
        var node = new CanopyNode(id, name);
        node.Cells["title"] = title;
        node.Cells["department"] = Departments[department];
        node.Cells["location"] = Locations[(seed + department) % Locations.Length];
        node.Cells["email"] = name.ToLowerInvariant().Replace(' ', '.').Replace(",", string.Empty) + "@example.org";
        node.Cells["started"] = new CanopyCell(Epoch.AddDays(seed * 97 + department * 31));
        return node;
    }

    private static void Reports(CanopyNode manager) {
        var count = manager.Children.Count;
        foreach (var child in manager.Children) {
            count += child.Cells.TryGetValue("reports", out var cell) && cell.Value is long below ? (int)below : 0;
        }

        manager.Cells["reports"] = count;
        manager.Flags.Add("manager");
    }

    /// <summary>A file system whose deepest file sits eleven levels down.</summary>
    internal static CanopyTreeView FileSystem() {
        var view = new CanopyTreeView("file-system", "File system") {
            Search = new CanopySearchOptions { Placeholder = "Search files" }
        };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("modified", "Modified") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("type", "Type") { ResponsivePriority = 10000 });
        var names = new[] { "Volumes", "Data", "Projects", "CanopyX", "CanopyX.Html", "Assets", "canopyx.source", "parts", "toolbar", "drafts" };
        var parent = Folder("fs-root", "Storage", 0);
        view.Roots.Add(parent);
        for (var depth = 0; depth < names.Length; depth++) {
            var folder = Folder("fs-" + depth, names[depth], depth + 1);
            for (var f = 0; f < 3; f++) parent.Children.Add(FileNode(folder.Id + "-f" + f, "notes-" + (f + 1) + ".txt", depth * 3 + f));
            parent.Children.Insert(0, folder);
            parent = folder;
        }
        parent.Children.Add(FileNode("fs-deep", "quarterly-toolbar-layout-review-final-version-2.xlsx", 40));
        parent.Children.Add(FileNode("fs-deep-2", "readme.md", 41));
        return view;
    }

    private static CanopyNode Folder(string id, string name, int seed) {
        var node = new CanopyNode(id, name) { Expanded = true };
        node.Cells["type"] = "Folder";
        node.Cells["modified"] = new CanopyCell(Epoch.AddDays(seed * 11).AddHours(seed));
        return node;
    }

    private static CanopyNode FileNode(string id, string name, int seed) {
        var node = new CanopyNode(id, name);
        var bytes = 1024L * (seed * 37 % 900 + 3);
        node.Cells["size"] = new CanopyCell(bytes) { Text = (bytes / 1024).ToString("N0", CultureInfo.InvariantCulture) + " KiB" };
        node.Cells["modified"] = new CanopyCell(Epoch.AddDays(seed * 13).AddMinutes(seed * 7));
        node.Cells["type"] = Path.GetExtension(name).TrimStart('.').ToUpperInvariant() + " file";
        return node;
    }

    /// <summary>Three groups that start collapsed; the first holds 497 members, so expanding it makes a long tree.</summary>
    internal static CanopyTreeView Groups() {
        // The default toolbar without the more menu: no host actions, and printing is left to the page.
        var view = new CanopyTreeView("groups", "Groups") { PageSize = 1000 };
        view.Toolbar.More = false;
        view.Columns.Add(new CanopyColumn("name", "Group or member"));
        view.Columns.Add(new CanopyColumn("members", "Members") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("scope", "Scope"));
        var everyone = Group("g-everyone", "Everyone", "Universal");
        for (var i = 0; i < 497; i++) everyone.Children.Add(Member("g-everyone-" + i, "Member " + (i + 1).ToString("000", CultureInfo.InvariantCulture)));
        var admins = Group("g-admins", "Administrators", "Domain local");
        var nested = Group("g-admins-ops", "Operations administrators", "Global");
        nested.Children.Add(Member("g-admins-ops-1", "Taylor Reed"));
        nested.Children.Add(Member("g-admins-ops-2", "Jordan Blake"));
        admins.Children.Add(nested);
        admins.Children.Add(Member("g-admins-1", "Morgan Avery"));
        var auditors = Group("g-auditors", "Auditors", "Global");
        auditors.Children.Add(Member("g-auditors-1", "Casey Morgan"));
        foreach (var group in new[] { everyone, admins, auditors }) {
            group.Cells["members"] = group.Children.Count;
            view.Roots.Add(group);
        }

        nested.Cells["members"] = nested.Children.Count;
        return view;
    }

    private static CanopyNode Group(string id, string name, string scope) {
        var node = new CanopyNode(id, name);
        node.Cells["scope"] = scope;
        return node;
    }

    private static CanopyNode Member(string id, string name) {
        var node = new CanopyNode(id, name);
        node.Cells["scope"] = "User";
        return node;
    }
}
