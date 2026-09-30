using System.Globalization;
using System.Text;
using CanopyX;

namespace CanopyX.Examples;

/// <summary>
/// Deterministic trees for the search benchmark (<c>tests/browser/bench/search-benchmark.mjs</c>) and the index size
/// contract test in CanopyX.Tests. Each one stresses a bundle's search index the way a real host does.
/// </summary>
internal static class SearchBenchTrees {
    private static readonly string[] Regions = { "EMEA", "AMER", "APAC", "LATAM", "ANZ" };
    private static readonly string[] Sites = {
        "Krakow", "Warsaw", "Berlin", "Munich", "Paris", "Lyon", "Madrid", "Milan", "Vienna", "Prague",
        "Dublin", "London", "Oslo", "Stockholm", "Helsinki", "Zurich", "Lisbon", "Athens", "Brussels", "Amsterdam"
    };
    private static readonly string[] Departments = { "Finance", "HR", "IT", "Sales", "Marketing", "Legal", "Operations", "Research", "Support", "Facilities" };
    private static readonly string[] Leaves = { "Users", "Computers", "Groups", "Servers", "Workstations", "Laptops", "Service Accounts", "Disabled", "Kiosks", "Admins" };
    private static readonly string[] PolicyPrefixes = { "CORP", "EMEA", "APAC", "SRV", "WKS" };
    private static readonly string[] PolicyTopics = {
        "Defender", "BitLocker", "Password", "Audit", "Browser", "Office", "Printers", "Drive Maps", "Screensaver", "Windows Update",
        "Power", "Certificates", "LAPS", "AppLocker", "Kerberos", "Time Sync", "Remote Desktop", "USB Storage", "Proxy", "Logon Scripts",
        "Baseline", "Edge", "Firewall", "OneDrive", "Teams"
    };

    /// <summary>
    /// The adversarial tree: about 121,000 nodes on eight levels, with long path-style ids and labels that share a few
    /// common words. An index that copies each entry into one shard per word grows to many times the pages here.
    /// </summary>
    internal static CanopyView DeepTree() {
        var view = new CanopyView("deep", "Deep tree") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name") { Width = 400 });
        var root = new CanopyNode("projects", "projects");
        var level = new List<CanopyNode> { root };
        for (var depth = 1; depth <= 6; depth++) {
            var next = new List<CanopyNode>();
            foreach (var parent in level.Take(4)) {
                for (var i = 0; i < 12; i++) {
                    var child = new CanopyNode(parent.Id + "/department-" + depth + "-" + i + "-quarterly-report", "Quarterly report folder " + depth + " " + i + " docx archive");
                    parent.Children.Add(child);
                    next.Add(child);
                }
            }

            level = next;
        }

        foreach (var parent in level.Take(30)) {
            for (var i = 0; i < 4020; i++) {
                parent.Children.Add(new CanopyNode(parent.Id + "/file-" + i + "-quarterly-report.docx", "Quarterly report " + i + " archive docx"));
            }
        }

        view.Roots.Add(root);
        return view;
    }

    /// <summary>
    /// A directory-shaped tree: five domains, each with a container of 1,000 policy objects (names such as
    /// "CORP Firewall Policy 0022", GUID ids) and a nested tree of 10,105 organizational units (distinguished-name
    /// ids). 5,000 policies and 50,525 units in all.
    /// </summary>
    internal static CanopyView DirectoryTree() {
        var view = new CanopyView("directory", "Directory") { Search = new CanopySearchOptions { Placeholder = "Search policies and units" } };
        view.Columns.Add(new CanopyColumn("name", "Name") { Width = 400 });
        view.Columns.Add(new CanopyColumn("type", "Type") { Width = 160 });
        var policy = 0;
        for (var d = 1; d <= 5; d++) {
            var dc = "DC=corp" + d + ",DC=example,DC=com";
            var domain = Node(dc, "corp" + d + ".example.com", "domain");
            var policies = Node("CN=Policies,CN=System," + dc, "Group Policy Objects", "container");
            for (var p = 0; p < 1000; p++, policy++) {
                var name = PolicyPrefixes[(policy / PolicyTopics.Length) % PolicyPrefixes.Length] + " " + PolicyTopics[policy % PolicyTopics.Length]
                    + " Policy " + policy.ToString("0000", CultureInfo.InvariantCulture);
                policies.Children.Add(Node("{" + Guid(policy) + "}", name, "policy"));
            }

            domain.Children.Add(policies);
            foreach (var region in Regions) {
                var regionDn = "OU=" + region + "," + dc;
                var regionNode = Node(regionDn, region, "unit");
                foreach (var site in Sites) {
                    var siteDn = "OU=" + site + "," + regionDn;
                    var siteNode = Node(siteDn, site, "unit");
                    foreach (var department in Departments) {
                        var departmentDn = "OU=" + department + "," + siteDn;
                        var departmentNode = Node(departmentDn, department, "unit");
                        for (var leaf = 0; leaf < 9; leaf++) {
                            var name = Leaves[(leaf + department.Length) % Leaves.Length];
                            departmentNode.Children.Add(Node("OU=" + name + "," + departmentDn, name, "unit"));
                        }

                        siteNode.Children.Add(departmentNode);
                    }

                    regionNode.Children.Add(siteNode);
                }

                domain.Children.Add(regionNode);
            }

            view.Roots.Add(domain);
        }

        return view;
    }

    private static CanopyNode Node(string id, string label, string kind) {
        var node = new CanopyNode(id, label) { Kind = kind };
        node.Cells["type"] = kind;
        return node;
    }

    /// <summary>A GUID-shaped id derived from a number, so the tree is the same on every run.</summary>
    private static string Guid(int seed) {
        var state = unchecked((uint)seed * 2654435761u + 12345u);
        var hex = new StringBuilder(32);
        for (var i = 0; i < 4; i++) {
            state = unchecked(state * 1664525u + 1013904223u);
            hex.Append(state.ToString("X8", CultureInfo.InvariantCulture));
        }

        var text = hex.ToString();
        return text.Substring(0, 8) + "-" + text.Substring(8, 4) + "-" + text.Substring(12, 4) + "-" + text.Substring(16, 4) + "-" + text.Substring(20, 12);
    }
}
