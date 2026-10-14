// The code the documentation shows. SiteDocs runs these methods to render the output under each snippet, and copies
// the lines between a "docs:begin <id>" and its "docs:end" marker into the page, so the code and its output cannot drift.
using CanopyX;
using CanopyX.Html;
using CanopyX.Rendering;

namespace SiteDemos.Docs;

/// <summary>Snippets shown in the documentation, each the exact code that builds the output next to it.</summary>
internal static class DocsSnippets {
    /// <summary>Getting started: a small file explorer.</summary>
    internal static CanopyTreeView ProjectFiles() {
        // docs:begin tree
        var files = new CanopyTreeView("files", "Project files");
        files.Search = new CanopySearchOptions();
        files.Columns.Add(new CanopyColumn("name", "Name") {
            Sortable = true, Sizing = CanopyColumnSizing.Preferred(250)
        });
        files.Columns.Add(new CanopyColumn("size", "Size") {
            Kind = CanopyColumnKind.Number, Sortable = true
        });
        files.Columns.Add(new CanopyColumn("owner", "Owner") { Sortable = true });

        var projects = new CanopyNode("projects", "Projects") { Expanded = true };
        projects.Children.Add(File("plan", "Project plan.docx", 48_128, "anna.kowalska"));
        projects.Children.Add(File("budget", "Budget 2026.xlsx", 22_016, "ben.okafor"));
        var report = File("report", "Quarterly report.pdf", 2_048, "chen.wei");
        report.Badges.Add(new CanopyBadge("new", CanopyTone.Info));
        projects.Children.Add(report);

        var archive = new CanopyNode("archive", "Archive");
        archive.Children.Add(File("plan-2025", "Plan 2025.docx", 40_960, "anna.kowalska"));
        archive.Children.Add(File("budget-2025", "Budget 2025.xlsx", 19_456, "ben.okafor"));

        files.Roots.Add(projects);
        files.Roots.Add(archive);

        CanopyNode File(string id, string name, long bytes, string owner) {
            var node = new CanopyNode(id, name);
            node.Cells["size"] = new CanopyCell(bytes) { Text = $"{bytes / 1024} KiB" };
            node.Cells["owner"] = owner;
            return node;
        }
        // docs:end
        return files;
    }

    /// <summary>Getting started: a flat inventory table.</summary>
    internal static CanopyDataGridView Inventory() {
        // docs:begin grid
        var inventory = new CanopyDataGridView("inventory", "Inventory");
        inventory.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        inventory.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        inventory.Columns.Add(new CanopyColumn("size", "Size") {
            Kind = CanopyColumnKind.Number, Sortable = true
        });

        var records = new[] {
            ("Archive", "Warsaw", 2048L), ("Documents", "London", 512L),
            ("Invoices", "Warsaw", 9216L), ("Photos", "Berlin", 40960L),
            ("Reports", "London", 3072L)
        };
        foreach (var (name, site, bytes) in records) {
            var row = new CanopyGridRow(name.ToLowerInvariant());
            row.Cells["name"] = name;
            row.Cells["site"] = site;
            row.Cells["size"] = new CanopyCell(bytes) { Text = $"{bytes} bytes" };
            inventory.Rows.Add(row);
        }
        // docs:end
        return inventory;
    }

    /// <summary>Getting started: both views as script-free tables.</summary>
    internal static (string Tree, string Grid) StaticTables(CanopyTreeView files, CanopyDataGridView inventory) {
        // docs:begin static
        string treeTable = CanopyStaticHtml.Render(files);
        string inventoryTable = CanopyStaticHtml.RenderGrid(inventory);
        // docs:end
        return (treeTable, inventoryTable);
    }

    /// <summary>JavaScript page: the same tree with the Polish labels.</summary>
    internal static CanopyTreeView Polish(CanopyTreeView files) {
        // docs:begin labels
        files.Labels = CanopyLabels.Polish();
        // docs:end
        return files;
    }

    /// <summary>Reporting page: a grouped device grid with facets, aggregates and presenters.</summary>
    internal static CanopyDataGridView Devices() {
        var records = new[] {
            ("WS-WAW-0001", "Warsaw", 96, true), ("WS-WAW-0002", "Warsaw", 71, true), ("SRV-WAW-0003", "Warsaw", 58, false),
            ("WS-WAW-0004", "Warsaw", 88, true), ("WS-LON-0005", "London", 100, true), ("WS-LON-0006", "London", 64, true),
            ("SRV-LON-0007", "London", 92, true), ("WS-LON-0008", "London", 79, false), ("WS-BER-0009", "Berlin", 85, true),
            ("WS-BER-0010", "Berlin", 61, true), ("WS-BER-0011", "Berlin", 97, true), ("SRV-BER-0012", "Berlin", 73, true)
        };
        // docs:begin reporting
        var devices = new CanopyDataGridView("devices", "Devices") {
            Selection = CanopySelectionMode.Multiple,
            StatusBar = true,
            Noun = "devices",
            Reporting = new CanopyGridReporting {
                Grouping = new CanopyGridGrouping("site"),
                HeaderFilters = true,
                SelectionControls = true
            }
        };
        devices.Columns.Add(new CanopyColumn("device", "Device") {
            Sortable = true, Presenter = CanopyGridPresenter.Identifier(mono: true)
        });
        devices.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        devices.Columns.Add(new CanopyColumn("patch", "Patch level") {
            Kind = CanopyColumnKind.Number,
            Sortable = true,
            Presenter = CanopyGridPresenter.Progress()
        });
        devices.Columns.Add(new CanopyColumn("encrypted", "Encrypted") {
            Sortable = true, Presenter = CanopyGridPresenter.Boolean()
        });
        devices.Reporting.FacetColumns.Add("site");
        devices.Reporting.Aggregates.Add(new CanopyGridAggregate(
            "patch-average", "patch", CanopyGridAggregateOperation.Average,
            "Average patch level"));

        foreach (var (name, site, patch, encrypted) in records) {
            var row = new CanopyGridRow(name.ToLowerInvariant());
            row.Cells["device"] = name;
            row.Cells["site"] = site;
            row.Cells["patch"] = new CanopyCell(patch) {
                Text = $"{patch}%",
                Tone = patch < 70 ? CanopyTone.Danger : CanopyTone.None
            };
            row.Cells["encrypted"] = encrypted;
            devices.Rows.Add(row);
        }
        // docs:end
        return devices;
    }

    /// <summary>Email and print: an outline cut to fit a message, with a link to the full report.</summary>
    internal static string Outline(CanopyTreeView shares) {
        // docs:begin static-outline
        var options = new CanopyStaticHtmlOptions {
            MaxRows = 12,
            MaxDepth = 3,
            FullReportUrl = "https://canopyx.dev/live/files/index.html"
        };
        string html = CanopyStaticHtml.Render(shares, options);
        // docs:end
        return html;
    }

    /// <summary>Email and print: the dark palette as literal colours.</summary>
    internal static string DarkOutline(CanopyTreeView shares) {
        // docs:begin static-dark
        var options = new CanopyStaticHtmlOptions {
            MaxRows = 8,
            MaxDepth = 2,
            Theme = CanopyStaticTheme.Dark()
        };
        string html = CanopyStaticHtml.Render(shares, options);
        // docs:end
        return html;
    }

    /// <summary>Email and print: a table that follows the theme of the page it sits in.</summary>
    internal static string ThemedGrid(CanopyDataGridView devices) {
        // docs:begin static-themed
        var options = new CanopyStaticHtmlOptions { MaxRows = 6, UseThemeVariables = true };
        string html = CanopyStaticHtml.RenderGrid(devices, options: options);
        // docs:end
        return html;
    }

    /// <summary>Delivery: one self-contained file.</summary>
    internal static void Single(CanopyTreeView files) {
        // docs:begin deliver-single
        files.SaveHtmlPage("files.html");
        // docs:end
    }

    /// <summary>Delivery: a page with sidecar data files.</summary>
    internal static void Bundle(CanopyTreeView files) {
        // docs:begin deliver-bundle
        files.SaveHtmlBundle("file-report");
        // docs:end
    }

    /// <summary>Delivery: a page whose rows come from the host's endpoints.</summary>
    internal static CanopyTreeView Hosted() {
        // docs:begin deliver-hosted
        var files = new CanopyTreeView("files", "Project files");
        files.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        files.Search = new CanopySearchOptions();
        files.Source = CanopySource.Remote(
            "api/files/children?ref={ref}&cursor={cursor}",
            "api/files/search?q={query}&limit={limit}",
            "api/files/counts?ids={ids}");

        files.SaveHtmlPage("files.html", new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External });
        CanopyHtmlAssets.WriteTo("assets");
        // docs:end
        return files;
    }

    /// <summary>Data protocol: the children page a lazy branch asks for.</summary>
    internal static CanopyPage ChildrenPage() {
        // docs:begin protocol-page
        var page = new CanopyPage("projects") { Offset = 0, Total = 3 };
        page.Items.Add(new CanopyNode("plans", "Plans") { HasChildren = true, ChildCount = 12 });
        page.Items.Add(new CanopyNode("budget", "Budget 2026.xlsx"));
        page.Items.Add(new CanopyNode("report", "Quarterly report.pdf"));
        string json = page.ToJson();
        // docs:end
        return page;
    }
}
