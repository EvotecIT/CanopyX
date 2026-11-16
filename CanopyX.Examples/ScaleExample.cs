using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Scale fixtures for the scale benchmark (tests/browser/bench/scale-benchmark.mjs): directory-shaped views at five
/// sizes, written through the regular writers with their default choices. Each tier writes a user inventory (20 columns)
/// as a single page and as a bundle, a computer inventory (14 columns), a group membership tree as a page and as a
/// bundle, a policy by server matrix and a change list. Wide inventories (100 and 150 columns) are written for the
/// 5,000 and 50,000 tiers. The data is synthetic and deterministic.
/// </summary>
internal static class ScaleExample {
    /// <summary>The tiers: rows of the inventories and nodes of the tree.</summary>
    internal static readonly int[] Tiers = { 50, 500, 5_000, 50_000, 500_000 };

    private static readonly string[] Words = { "alpha", "bravo", "cedar", "delta", "ember", "fjord", "garnet", "harbor", "indigo", "juniper", "kestrel", "lumen",
        "meadow", "nectar", "onyx", "prairie", "quartz", "raven", "summit", "tundra", "umber", "violet", "willow", "xenon", "yarrow", "zephyr" };
    private static readonly string[] Departments = { "Finance", "Sales", "Engineering", "Support", "Legal", "Marketing", "Operations", "Research", "Facilities", "Security" };
    private static readonly string[] Titles = { "Analyst", "Engineer", "Manager", "Director", "Specialist", "Consultant", "Administrator", "Coordinator" };
    private static readonly string[] Units = { "Users", "Staff", "Contractors", "Service Accounts", "Admins", "Disabled", "Remote", "Interns" };
    private static readonly string[] Systems = { "Windows 11 Enterprise", "Windows 10 Enterprise", "Windows Server 2022", "Windows Server 2019", "Windows Server 2025", "Ubuntu 24.04" };

    internal static void Write(string output, IReadOnlyList<int>? tiers = null) {
        var folder = Path.Combine(output, "scale");
        Directory.CreateDirectory(folder);
        foreach (var tier in tiers ?? Tiers) {
            var users = Users("users", "Users", tier, 20, 7);
            users.SaveHtmlPage(Path.Combine(folder, "users-" + tier + ".html"), Page("Users"));
            users.SaveHtmlBundle(Path.Combine(folder, "users-" + tier + "-bundle"), Bundle("Users"));
            users = null;
            Computers(tier).SaveHtmlPage(Path.Combine(folder, "computers-" + tier + ".html"), Page("Computers"));
            if (tier is 5_000 or 50_000) {
                foreach (var width in new[] { 100, 150 }) Users("users", "Users", tier, width, 11).SaveHtmlPage(Path.Combine(folder, "users-wide" + width + "-" + tier + ".html"), Page("Users"));
            }

            var tree = Membership(tier);
            tree.SaveHtmlPage(Path.Combine(folder, "groups-" + tier + ".html"), Page("Group membership"));
            tree.SaveHtmlBundle(Path.Combine(folder, "groups-" + tier + "-bundle"), Bundle("Group membership"));
            Matrix(tier).SaveHtmlPage(Path.Combine(folder, "matrix-" + tier + ".html"), Page("Policy by server", CanopyRuntime.DataGrid));
            Changes(tier).SaveHtmlPage(Path.Combine(folder, "changes-" + tier + ".html"), Page("Changes", CanopyRuntime.DataGrid));
            Console.WriteLine("scale/: tier " + tier.ToString(CultureInfo.InvariantCulture) + " written");
        }
    }

    private static CanopyHtmlOptions Bundle(string title) => new CanopyHtmlOptions { Title = title, Height = "640px", AssetMode = CanopyAssetMode.External };

    private static CanopyHtmlOptions Page(string title, CanopyRuntime? runtime = null) {
        var options = new CanopyHtmlOptions { Title = title, Height = "640px" };
        if (runtime is { } value) options.Runtime = value;
        return options;
    }

    private sealed class Random32 {
        private uint _state;
        public Random32(uint seed) => _state = seed;
        public double Next() { _state = unchecked(_state * 1664525u + 1013904223u); return _state / 4294967296.0; }
        public int Pick(int count) => (int)(Next() * count);
        public DateTimeOffset Date(int fromYear, int years) => new DateTimeOffset(fromYear + Pick(years), 1 + Pick(12), 1 + Pick(28), Pick(24), Pick(60), 0, TimeSpan.Zero);
        public string Word() => Words[Pick(Words.Length)];
    }

    /// <summary>A user inventory: 20 columns, or more with extra attribute columns for the wide variants.</summary>
    internal static CanopyDataGridView Users(string id, string label, int rows, int columns, uint seed) {
        var view = new CanopyDataGridView(id, label) {
            PageSize = 200, Selection = CanopySelectionMode.Multiple, Search = true, Noun = "users",
            Reporting = new CanopyGridReporting { Groupable = true, Responsive = true, ColumnReorder = true }
        };
        view.Columns.Add(new CanopyColumn("sam", "Account") { Sortable = true, RowHeader = true });
        view.Columns.Add(new CanopyColumn("display", "Display name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("upn", "User principal name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("enabled", "Enabled") { Sortable = true });
        view.Columns.Add(new CanopyColumn("domain", "Domain") { Sortable = true });
        view.Columns.Add(new CanopyColumn("ou", "Organizational unit") { Sortable = true });
        view.Columns.Add(new CanopyColumn("department", "Department") { Sortable = true });
        view.Columns.Add(new CanopyColumn("title", "Title") { Sortable = true });
        view.Columns.Add(new CanopyColumn("manager", "Manager") { Sortable = true });
        view.Columns.Add(new CanopyColumn("mail", "Mail") { Sortable = true });
        view.Columns.Add(new CanopyColumn("lastLogon", "Last logon") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("pwdLastSet", "Password last set") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("created", "Created") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("groups", "Groups") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("adminCount", "Admin count") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("risk", "Risk") { Sortable = true });
        view.Columns.Add(new CanopyColumn("neverExpires", "Password never expires") { Sortable = true });
        view.Columns.Add(new CanopyColumn("delegation", "Delegation") { Sortable = true });
        view.Columns.Add(new CanopyColumn("sid", "SID") { Sortable = true });
        view.Columns.Add(new CanopyColumn("description", "Description") { Sortable = true });
        for (var extra = view.Columns.Count; extra < columns; extra++) view.Columns.Add(new CanopyColumn("attr" + extra, "Attribute " + extra) { Sortable = true });
        var random = new Random32(seed);
        for (var i = 0; i < rows; i++) {
            var row = new CanopyGridRow("u" + i.ToString("D7", CultureInfo.InvariantCulture));
            var first = random.Word();
            var last = random.Word();
            var sam = first.Substring(0, 1) + last + i.ToString(CultureInfo.InvariantCulture);
            var domain = "ad" + random.Pick(4).ToString(CultureInfo.InvariantCulture) + ".example.test";
            var enabled = random.Next() > 0.12;
            row.Cells["sam"] = sam;
            row.Cells["display"] = Upper(first) + " " + Upper(last);
            row.Cells["upn"] = sam + "@" + domain;
            row.Cells["enabled"] = new CanopyCell(enabled ? "Enabled" : "Disabled") { Tone = enabled ? CanopyTone.Success : CanopyTone.Muted };
            row.Cells["domain"] = domain;
            row.Cells["ou"] = "OU=" + Units[random.Pick(Units.Length)] + ",OU=" + Departments[random.Pick(Departments.Length)] + ",DC=" + domain.Split('.')[0];
            row.Cells["department"] = Departments[random.Pick(Departments.Length)];
            row.Cells["title"] = Titles[random.Pick(Titles.Length)];
            row.Cells["manager"] = "u" + random.Pick(Math.Max(1, rows)).ToString("D7", CultureInfo.InvariantCulture);
            row.Cells["mail"] = sam + "@mail.example.test";
            row.Cells["lastLogon"] = random.Date(2024, 3);
            row.Cells["pwdLastSet"] = random.Date(2021, 5);
            row.Cells["created"] = random.Date(2010, 15);
            row.Cells["groups"] = random.Pick(60);
            row.Cells["adminCount"] = random.Next() > 0.97 ? 1 : 0;
            var risk = random.Next();
            row.Cells["risk"] = risk > 0.95 ? new CanopyCell("High") { Tone = CanopyTone.Danger } : risk > 0.85 ? new CanopyCell("Medium") { Tone = CanopyTone.Warning } : new CanopyCell("None") { Tone = CanopyTone.Muted };
            row.Cells["neverExpires"] = random.Next() > 0.9 ? "Yes" : "No";
            row.Cells["delegation"] = random.Next() > 0.98 ? "Unconstrained" : random.Next() > 0.95 ? "Constrained" : "None";
            row.Cells["sid"] = "S-1-5-21-1000-2000-3000-" + (1100 + i).ToString(CultureInfo.InvariantCulture);
            if (random.Next() > 0.4) row.Cells["description"] = random.Word() + " " + random.Word() + " " + random.Word();
            for (var extra = 20; extra < columns; extra++) row.Cells["attr" + extra] = random.Word() + random.Pick(1000).ToString(CultureInfo.InvariantCulture);
            view.Rows.Add(row);
        }

        return view;
    }

    private static string Upper(string word) => char.ToUpperInvariant(word[0]) + word.Substring(1);

    /// <summary>A computer inventory: 14 columns.</summary>
    internal static CanopyDataGridView Computers(int rows) {
        var view = new CanopyDataGridView("computers", "Computers") {
            PageSize = 200, Selection = CanopySelectionMode.Multiple, Search = true, Noun = "computers",
            Reporting = new CanopyGridReporting { Groupable = true, Responsive = true }
        };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true, RowHeader = true });
        view.Columns.Add(new CanopyColumn("dns", "DNS name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("enabled", "Enabled") { Sortable = true });
        view.Columns.Add(new CanopyColumn("os", "Operating system") { Sortable = true });
        view.Columns.Add(new CanopyColumn("version", "Version") { Sortable = true });
        view.Columns.Add(new CanopyColumn("ou", "Organizational unit") { Sortable = true });
        view.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        view.Columns.Add(new CanopyColumn("lastLogon", "Last logon") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("pwdLastSet", "Password last set") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("created", "Created") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("laps", "LAPS") { Sortable = true });
        view.Columns.Add(new CanopyColumn("bitlocker", "BitLocker") { Sortable = true });
        view.Columns.Add(new CanopyColumn("stale", "Stale") { Sortable = true });
        view.Columns.Add(new CanopyColumn("description", "Description") { Sortable = true });
        var random = new Random32(17);
        for (var i = 0; i < rows; i++) {
            var row = new CanopyGridRow("c" + i.ToString("D7", CultureInfo.InvariantCulture));
            var name = "WS" + i.ToString("D6", CultureInfo.InvariantCulture);
            var enabled = random.Next() > 0.08;
            row.Cells["name"] = name;
            row.Cells["dns"] = name.ToLowerInvariant() + ".ad" + random.Pick(4).ToString(CultureInfo.InvariantCulture) + ".example.test";
            row.Cells["enabled"] = new CanopyCell(enabled ? "Enabled" : "Disabled") { Tone = enabled ? CanopyTone.Success : CanopyTone.Muted };
            row.Cells["os"] = Systems[random.Pick(Systems.Length)];
            row.Cells["version"] = "10.0." + (17763 + random.Pick(9000)).ToString(CultureInfo.InvariantCulture);
            row.Cells["ou"] = "OU=Computers,OU=" + Departments[random.Pick(Departments.Length)];
            row.Cells["site"] = "Site-" + random.Pick(150).ToString("D3", CultureInfo.InvariantCulture);
            row.Cells["lastLogon"] = random.Date(2024, 3);
            row.Cells["pwdLastSet"] = random.Date(2024, 3);
            row.Cells["created"] = random.Date(2012, 13);
            row.Cells["laps"] = random.Next() > 0.3 ? "Yes" : new CanopyCell("No") { Tone = CanopyTone.Warning };
            row.Cells["bitlocker"] = random.Next() > 0.2 ? "On" : "Off";
            var stale = random.Next() > 0.85;
            row.Cells["stale"] = stale ? new CanopyCell("Stale") { Tone = CanopyTone.Danger } : "Active";
            if (random.Next() > 0.5) row.Cells["description"] = random.Word() + " " + random.Word();
            view.Rows.Add(row);
        }

        return view;
    }

    /// <summary>
    /// A membership tree of about <paramref name="nodes"/> nodes: groups of 50 to 500 members, a quarter of the groups
    /// nested one level under a parent group. The largest group at the top tier has 5,000 direct members.
    /// </summary>
    internal static CanopyTreeView Membership(int nodes) {
        var tree = new CanopyTreeView("groups", "Group membership") {
            RowHeight = 30, Selection = CanopySelectionMode.Single,
            Search = new CanopySearchOptions { MaxResults = 30 }
        };
        tree.Columns.Add(new CanopyColumn("name", "Name") { Sizing = CanopyColumnSizing.Preferred(360), Sortable = true });
        tree.Columns.Add(new CanopyColumn("type", "Type") { Sortable = true });
        tree.Columns.Add(new CanopyColumn("domain", "Domain") { Sortable = true });
        tree.Columns.Add(new CanopyColumn("members", "Direct members") { Kind = CanopyColumnKind.Number, Sortable = true });
        tree.Columns.Add(new CanopyColumn("kind", "Membership") { Sortable = true });
        var random = new Random32(23);
        var count = 0;
        var group = 0;
        while (count < nodes) {
            var size = Math.Min(nodes - count - 1, group == 0 ? Math.Min(5_000, nodes / 10) : 50 + random.Pick(450));
            var node = new CanopyNode("g" + group.ToString(CultureInfo.InvariantCulture), "Group " + random.Word() + " " + group.ToString(CultureInfo.InvariantCulture)) { Kind = "group" };
            node.Cells["type"] = "Security group";
            node.Cells["domain"] = "ad" + random.Pick(4).ToString(CultureInfo.InvariantCulture) + ".example.test";
            node.Cells["members"] = Math.Max(0, size);
            node.Cells["kind"] = "Requested";
            count++;
            for (var m = 0; m < size; m++) {
                var nested = m < size / 20;
                var member = new CanopyNode(node.Id + "/" + m.ToString(CultureInfo.InvariantCulture), (nested ? "Group " : "User ") + random.Word() + " " + m.ToString(CultureInfo.InvariantCulture)) { Kind = nested ? "group" : "user" };
                member.Cells["type"] = nested ? "Security group" : "User";
                member.Cells["domain"] = node.Cells["domain"];
                member.Cells["kind"] = nested ? "Nested" : "Direct";
                node.Children.Add(member);
                count++;
            }

            tree.Roots.Add(node);
            group++;
        }

        return tree;
    }

    /// <summary>A policy by server matrix: policies by domain controllers, scaled with the tier up to the matrix's cell limit.</summary>
    internal static CanopyMatrix Matrix(int tier) {
        var (policies, servers) = tier switch { <= 50 => (10, 5), <= 500 => (50, 20), <= 5_000 => (500, 50), <= 50_000 => (2_000, 100), _ => (5_000, 200) };
        var matrix = new CanopyMatrix("policy-servers", "Policy by server") { HideEmpty = false };
        matrix.Rows.Title = "Policy";
        matrix.Rows.Noun = "policies";
        matrix.Columns.Title = "Server";
        matrix.Columns.Noun = "servers";
        matrix.State("ok", "In sync", CanopyTone.Success, CanopyMatrixSymbol.Check)
            .State("drift", "Version drift", CanopyTone.Warning, CanopyMatrixSymbol.Warning, attention: true)
            .State("missing", "Missing", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true);
        for (var p = 0; p < policies; p++) matrix.Rows.Items.Add(new CanopyMatrixItem("p" + p.ToString(CultureInfo.InvariantCulture), "Policy " + Words[p % Words.Length] + " " + p.ToString(CultureInfo.InvariantCulture)));
        for (var s = 0; s < servers; s++) matrix.Columns.Items.Add(new CanopyMatrixItem("s" + s.ToString(CultureInfo.InvariantCulture), "DC" + s.ToString("D3", CultureInfo.InvariantCulture)));
        var random = new Random32(31);
        for (var p = 0; p < policies; p++) {
            for (var s = 0; s < servers; s++) {
                var roll = random.Next();
                matrix.Set("p" + p.ToString(CultureInfo.InvariantCulture), "s" + s.ToString(CultureInfo.InvariantCulture), roll > 0.98 ? "missing" : roll > 0.93 ? "drift" : "ok");
            }
        }

        return matrix;
    }

    /// <summary>A change list of one change per ten objects of the tier, up to the list's item limit.</summary>
    internal static CanopyChangeList Changes(int tier) {
        var items = Math.Min(CanopyChangeList.MaxItems, Math.Max(5, tier / 10));
        var list = new CanopyChangeList("changes", "Changes");
        var random = new Random32(37);
        var kinds = new[] { CanopyChangeKind.Added, CanopyChangeKind.Modified, CanopyChangeKind.Removed };
        for (var i = 0; i < items; i++) {
            var item = list.Add("x" + i.ToString(CultureInfo.InvariantCulture), kinds[random.Pick(kinds.Length)],
                "Policies/" + Departments[random.Pick(Departments.Length)] + "/" + random.Word() + "/" + random.Word() + i.ToString(CultureInfo.InvariantCulture) + ".xml");
            item.After = new CanopyChangeVersion { Size = random.Pick(100_000), Time = random.Date(2026, 1) };
            if (random.Next() > 0.9) item.Flag("risky", "Risky", "The change widens permissions.", CanopyTone.Danger);
        }

        return list;
    }
}
