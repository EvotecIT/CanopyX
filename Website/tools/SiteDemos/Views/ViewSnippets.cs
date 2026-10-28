// The "build it yourself" code of each view on canopyx.dev. ViewCode runs these methods to write the page behind each Run
// link, and copies the lines between a "view:begin <id>" and its "view:end" marker into the page, so the code and its output
// cannot drift. Regions with the same id are shown one after the other, which lets a snippet end with the record type it uses.
// Shown lines stay within 84 characters after dedent, so the site's code panel never scrolls sideways.
using CanopyX;
using CanopyX.Html;
using CanopyX.Rendering;

namespace SiteDemos.Views;

/// <summary>Snippets shown beside each view, each the exact code that builds the page its Run link opens.</summary>
internal static partial class ViewSnippets {
    /// <summary>File explorer: a small file-share tree.</summary>
    internal static void Files() {
        // view:begin files-cs
        var files = new CanopyTreeView("files", "File shares") {
            Selection = CanopySelectionMode.Single,
            Search = new CanopySearchOptions()
        };
        files.Columns.Add(new CanopyColumn("name", "Name") {
            Sortable = true,
            Sizing = CanopyColumnSizing.Preferred(280)
        });
        files.Columns.Add(new CanopyColumn("size", "Size") {
            Kind = CanopyColumnKind.Number,
            Sortable = true
        });
        files.Columns.Add(new CanopyColumn("owner", "Owner") { Sortable = true });
        files.Columns.Add(new CanopyColumn("modified", "Modified") {
            Kind = CanopyColumnKind.DateTime,
            Sortable = true
        });

        var finance = new CanopyNode("finance", @"\\fs01\finance") {
            Kind = "folder",
            Expanded = true
        };
        finance.Children.Add(
            Document("budget", "Budget 2026.xlsx", 482_304, "anna.kowalska", 14));
        finance.Children.Add(
            Document("invoices", "Invoices Q3.pdf", 2_310_144, "ben.okafor", 9));
        var payroll = Document("payroll", "Payroll export.csv", 96_256, "chen.wei", 2);
        payroll.Badges.Add(new CanopyBadge("Shared externally", CanopyTone.Warning));
        finance.Children.Add(payroll);

        var people = new CanopyNode("people", @"\\fs01\people") {
            Kind = "folder",
            Expanded = true
        };
        people.Children.Add(
            Document("handbook", "Staff handbook.docx", 1_048_576, "dana.levi", 30));
        people.Children.Add(
            Document("rota", "On-call rota.xlsx", 40_960, "erik.lund", 1));

        files.Roots.Add(finance);
        files.Roots.Add(people);
        files.SaveHtmlPage("files.html");

        CanopyNode Document(string id, string name, long bytes, string owner, int age) {
            var node = new CanopyNode(id, name) { Kind = "file" };
            node.Cells["size"] = new CanopyCell(bytes) { Text = $"{bytes / 1024} KB" };
            node.Cells["owner"] = owner;
            var saved = new DateTime(2026, 10, 16, 9, 30, 0, DateTimeKind.Utc);
            node.Cells["modified"] = saved.AddDays(-age);
            return node;
        }
        // view:end
    }

    /// <summary>Device inventory: a grouped reporting grid with facets, an aggregate and presenters.</summary>
    internal static void Inventory() {
        // view:begin inventory-cs
        var devices = new CanopyDataGridView("devices", "Device inventory") {
            Selection = CanopySelectionMode.Multiple,
            StatusBar = true,
            Noun = "devices",
            Reporting = new CanopyGridReporting {
                Grouping = new CanopyGridGrouping("site"),
                HeaderFilters = true
            }
        };
        devices.Columns.Add(new CanopyColumn("device", "Device") {
            Sortable = true,
            Presenter = CanopyGridPresenter.Identifier(mono: true)
        });
        devices.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        devices.Columns.Add(new CanopyColumn("os", "Operating system") { Sortable = true });
        devices.Columns.Add(new CanopyColumn("patch", "Patch level") {
            Kind = CanopyColumnKind.Number,
            Sortable = true,
            Presenter = CanopyGridPresenter.Progress()
        });
        devices.Columns.Add(new CanopyColumn("encrypted", "Encrypted") {
            Sortable = true,
            Presenter = CanopyGridPresenter.Boolean()
        });
        devices.Reporting.FacetColumns.Add("site");
        devices.Reporting.FacetColumns.Add("os");
        devices.Reporting.Aggregates.Add(new CanopyGridAggregate(
            "patch-average", "patch", CanopyGridAggregateOperation.Average,
            "Average patch level"));

        foreach (var (name, site, os, patch, encrypted) in new[] {
            ("WS-WAW-0001", "Warsaw", "Windows 11 24H2", 96, true),
            ("WS-WAW-0002", "Warsaw", "Windows 10 22H2", 61, false),
            ("SRV-WAW-0003", "Warsaw", "Windows Server 2025", 88, true),
            ("WS-LON-0004", "London", "Windows 11 24H2", 100, true),
            ("WS-LON-0005", "London", "Windows 11 23H2", 74, true),
            ("SRV-BER-0006", "Berlin", "Windows Server 2022", 58, true)
        }) {
            var row = new CanopyGridRow(name.ToLowerInvariant());
            row.Cells["device"] = name;
            row.Cells["site"] = site;
            row.Cells["os"] = os;
            row.Cells["patch"] = new CanopyCell(patch) {
                Text = $"{patch}%",
                Tone = patch < 70 ? CanopyTone.Danger : CanopyTone.None
            };
            row.Cells["encrypted"] = encrypted;
            devices.Rows.Add(row);
        }
        devices.SaveHtmlPage("inventory.html");
        // view:end
    }

    /// <summary>Device inventory from typed records.</summary>
    internal static void InventoryFluent() {
        // view:begin inventory-fluent
        var grid = new CanopyDataGridView<Device>(
            "devices", "Device inventory", x => x.Name);
        grid.Column(x => x.Name, "Device", c => {
            c.Sortable = true;
            c.Presenter = CanopyGridPresenter.Identifier(mono: true);
        });
        grid.Column(x => x.Site, configure: c => c.Sortable = true);
        grid.Column(x => x.Os, "Operating system", c => c.Sortable = true);
        grid.Column(x => x.Patch, "Patch level",
            c => {
                c.Sortable = true;
                c.Presenter = CanopyGridPresenter.Progress();
            },
            cell: patch => new CanopyCell(patch) {
                Text = $"{patch}%",
                Tone = patch < 70 ? CanopyTone.Danger : CanopyTone.None
            });
        grid.Column(x => x.Encrypted,
            configure: c => c.Presenter = CanopyGridPresenter.Boolean());
        grid.Field(x => x.Owner);

        grid.View.StatusBar = true;
        grid.View.Reporting = new CanopyGridReporting {
            Grouping = new CanopyGridGrouping(grid.ColumnId(x => x.Site))
        };
        grid.View.Reporting.FacetColumns.Add(grid.ColumnId(x => x.Os));

        grid.AddRows(new Device[] {
            new("WS-WAW-0001", "Warsaw", "Windows 11 24H2", 96, true, "anna.kowalska"),
            new("WS-WAW-0002", "Warsaw", "Windows 10 22H2", 61, false, "ben.okafor"),
            new("SRV-WAW-0003", "Warsaw", "Windows Server 2025", 88, true, "service"),
            new("WS-LON-0004", "London", "Windows 11 24H2", 100, true, "chen.wei"),
            new("SRV-BER-0005", "Berlin", "Windows Server 2022", 58, true, "service")
        }).View.SaveHtmlPage("inventory.html");
        // view:end
    }

    // view:begin inventory-fluent
    internal sealed record Device(
        string Name, string Site, string Os, int Patch, bool Encrypted, string Owner);
    // view:end

    /// <summary>Operations calendar: a list of events, no grid schema to write.</summary>
    internal static void Calendar() {
        // view:begin calendar-cs
        static DateTime At(int day, int hour, int minute = 0) =>
            new(2026, 10, day, hour, minute, 0, DateTimeKind.Utc);

        var calendar = new CanopyCalendar("operations", "Operations calendar", new[] {
            new CanopyCalendarEvent("Core switch firmware upgrade", At(14, 22)) {
                End = At(15, 3),
                Tone = CanopyTone.Info
            },
            new CanopyCalendarEvent("Database failover test", At(16, 9)) {
                End = At(16, 11),
                Description = "DBA team, db-02"
            },
            new CanopyCalendarEvent("Disk latency on fs-01", At(16, 10, 15)) {
                End = At(16, 12),
                Tone = CanopyTone.Danger
            },
            new CanopyCalendarEvent(
                "Certificate expires: portal.example.com", At(21, 13, 45)) {
                Tone = CanopyTone.Warning
            },
            new CanopyCalendarEvent("Data centre power test", At(24, 6)) {
                End = At(24, 18)
            },
            new CanopyCalendarEvent("Weekly maintenance window", At(6, 20)) {
                End = At(6, 23),
                Recurrence = CanopyRecurrence.Weekly(DayOfWeek.Tuesday)
            },
            new CanopyCalendarEvent("Change freeze", new DateTime(2026, 10, 26)) {
                AllDay = true,
                End = new DateTime(2026, 10, 31)
            }
        }, CanopyCalendarPreset.Standard);
        calendar.Date = new DateTime(2026, 10, 16);
        calendar.FirstDay = DayOfWeek.Monday;
        calendar.SaveHtmlPage("calendar.html");
        // view:end
    }

    /// <summary>Operations calendar from typed records.</summary>
    internal static void CalendarFluent() {
        // view:begin calendar-fluent
        var grid = new CanopyDataGridView<Operation>(
            "operations", "Operations calendar", x => x.Id);
        grid.Column(x => x.Title, configure: c => c.RowHeader = true);
        grid.Column(x => x.Status, configure: c => c.Presenter = CanopyGridPresenter.State(
            new Dictionary<string, CanopyTone> {
                ["Incident"] = CanopyTone.Danger,
                ["Running"] = CanopyTone.Info,
                ["Planned"] = CanopyTone.Neutral,
                ["Done"] = CanopyTone.Success
            }));
        grid.Column(x => x.Owner);

        var calendar = grid.Calendar()
            .Start(x => x.Starts)
            .End(x => x.Ends)
            .Title(x => x.Title)
            .Subtitle(x => x.Owner)
            .Status(x => x.Status)
            .Preset(CanopyCalendarPreset.Standard);
        calendar.Definition.Date = new DateTime(2026, 10, 16);
        calendar.Definition.FirstDay = DayOfWeek.Monday;

        static DateTime At(int day, int hour, int minute = 0) =>
            new(2026, 10, day, hour, minute, 0, DateTimeKind.Utc);
        grid.AddRows(new Operation[] {
            new("op-1", "Core switch firmware upgrade", "Planned",
                At(14, 22), At(15, 3), "Network"),
            new("op-2", "Database failover test", "Running",
                At(16, 9), At(16, 11), "DBA"),
            new("op-3", "Disk latency on fs-01", "Incident",
                At(16, 10, 15), At(16, 12), "Storage"),
            new("op-4", "Directory schema update", "Done",
                At(7, 18), At(7, 19), "Identity"),
            new("op-5", "Data centre power test", "Planned",
                At(24, 6), At(24, 18), "Facilities")
        }).View.SaveHtmlPage("calendar.html");
        // view:end
    }

    // view:begin calendar-fluent
    internal sealed record Operation(
        string Id, string Title, string Status,
        DateTime Starts, DateTime? Ends, string Owner);
    // view:end

    /// <summary>Resource timeline: events on a tree of hosts.</summary>
    internal static void Timeline() {
        // view:begin timeline-cs
        var hosts = new CanopyTreeView("hosts", "Hosts");
        hosts.Columns.Add(new CanopyColumn("name", "Host"));
        hosts.Columns.Add(new CanopyColumn("events", "Events") {
            Kind = CanopyColumnKind.Number
        });
        foreach (var (site, names) in new[] {
            ("Warsaw", new[] { "waw-web-01", "waw-db-01" }),
            ("Berlin", new[] { "ber-web-01", "ber-db-01" })
        }) {
            var node = new CanopyNode("site-" + site.ToLowerInvariant(), site) {
                Expanded = true
            };
            foreach (var name in names) node.Children.Add(new CanopyNode(name, name));
            hosts.Roots.Add(node);
        }

        var events = new CanopyDataGridView("host-events", "Incidents by host") {
            Noun = "events"
        };
        events.Columns.Add(new CanopyColumn("title", "Event") { RowHeader = true });
        events.Columns.Add(new CanopyColumn("kind", "Kind") {
            Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> {
                ["Outage"] = CanopyTone.Danger,
                ["Incident"] = CanopyTone.Warning,
                ["Maintenance"] = CanopyTone.Info
            })
        });
        events.Columns.Add(new CanopyColumn("starts", "Starts") {
            Kind = CanopyColumnKind.DateTime
        });
        events.Columns.Add(new CanopyColumn("ends", "Ends") {
            Kind = CanopyColumnKind.DateTime
        });
        events.Columns.Add(new CanopyColumn("host", "Host"));
        foreach (var (id, title, kind, host, hour, hours) in new[] {
            ("e1", "Patch window", "Maintenance", "waw-web-01", 6, 3),
            ("e2", "Replication lag", "Incident", "waw-db-01", 9, 2),
            ("e3", "Power feed lost", "Outage", "ber-web-01", 11, 1),
            ("e4", "Index rebuild", "Maintenance", "ber-db-01", 14, 4),
            ("e5", "Disk alerts", "Incident", "waw-db-01", 16, 2)
        }) {
            var starts = new DateTime(2026, 10, 16, hour, 0, 0, DateTimeKind.Utc);
            var row = new CanopyGridRow(id);
            row.Cells["title"] = title;
            row.Cells["kind"] = kind;
            row.Cells["starts"] = starts;
            row.Cells["ends"] = starts.AddHours(hours);
            row.Cells["host"] = host;
            events.Rows.Add(row);
        }

        events.Calendar = new CanopyCalendar("starts") {
            End = "ends",
            Title = "title",
            Status = "kind",
            Resource = "host",
            View = CanopyCalendarView.Timeline,
            Zoom = CanopyCalendarZoom.Hour,
            Date = new DateTime(2026, 10, 16),
            Resources = new CanopyCalendarResources(hosts) { Label = "Hosts" }
        };
        events.Calendar.Resources.Aggregates["events"] = CanopyCalendarAggregate.Count;
        events.SaveHtmlPage("timeline.html");
        // view:end
    }

    /// <summary>Resource timeline from typed records.</summary>
    internal static void TimelineFluent() {
        // view:begin timeline-fluent
        var hosts = new CanopyTreeView("hosts", "Hosts");
        hosts.Columns.Add(new CanopyColumn("name", "Host"));
        var warsaw = new CanopyNode("site-warsaw", "Warsaw") { Expanded = true };
        warsaw.Children.Add(new CanopyNode("waw-web-01", "waw-web-01"));
        warsaw.Children.Add(new CanopyNode("waw-db-01", "waw-db-01"));
        hosts.Roots.Add(warsaw);

        var grid = new CanopyDataGridView<HostEvent>(
            "host-events", "Incidents by host", x => x.Id);
        grid.Column(x => x.Title, "Event", c => c.RowHeader = true);
        grid.Column(x => x.Kind, configure: c => c.Presenter = CanopyGridPresenter.State(
            new Dictionary<string, CanopyTone> {
                ["Incident"] = CanopyTone.Warning,
                ["Maintenance"] = CanopyTone.Info
            }));

        var timeline = grid.Calendar()
            .Start(x => x.Starts)
            .End(x => x.Ends)
            .Title(x => x.Title)
            .Status(x => x.Kind)
            .Resource(x => x.Host)
            .Definition;
        timeline.View = CanopyCalendarView.Timeline;
        timeline.Zoom = CanopyCalendarZoom.Hour;
        timeline.Date = new DateTime(2026, 10, 16);
        timeline.Resources = new CanopyCalendarResources(hosts) { Label = "Hosts" };

        static DateTime At(int hour) => new(2026, 10, 16, hour, 0, 0, DateTimeKind.Utc);
        grid.AddRows(new HostEvent[] {
            new("e1", "Patch window", "Maintenance", "waw-web-01", At(6), At(9)),
            new("e2", "Replication lag", "Incident", "waw-db-01", At(9), At(11)),
            new("e3", "Index rebuild", "Maintenance", "waw-db-01", At(14), At(18))
        }).View.SaveHtmlPage("timeline.html");
        // view:end
    }

    // view:begin timeline-fluent
    internal sealed record HostEvent(
        string Id, string Title, string Kind, string Host,
        DateTime Starts, DateTime Ends);
    // view:end

    /// <summary>Services by server: a probe state per pair, servers grouped by site.</summary>
    internal static void Matrix() {
        // view:begin matrix-cs
        var matrix = new CanopyMatrix("services", "Services by server");
        matrix
            .State("critical", "Critical", CanopyTone.Danger, CanopyMatrixSymbol.Cross,
                attention: true)
            .State("warning", "Warning", CanopyTone.Warning, CanopyMatrixSymbol.Warning,
                attention: true)
            .State("ok", "Running", CanopyTone.Success, CanopyMatrixSymbol.Check)
            .State("absent", "Not installed", CanopyTone.Muted, CanopyMatrixSymbol.Dash);
        matrix.Rows.Title = "Server";
        matrix.Rows.Attribute("site", "Site", facet: true);
        matrix.Rows.GroupBy = "site";
        matrix.Columns.Title = "Service";
        foreach (var (id, label) in new[] {
            ("dns", "DNS"), ("ldap", "LDAP"),
            ("smb", "File sharing"), ("backup", "Backup agent")
        }) {
            matrix.Columns.Item(id, label);
        }

        var services = new[] { "dns", "ldap", "smb", "backup" };
        foreach (var (server, site, states) in new[] {
            ("SRV-OSL-01", "Oslo", "ok ok ok ok"),
            ("SRV-OSL-02", "Oslo", "ok warning ok critical"),
            ("SRV-LYO-01", "Lyon", "ok ok warning ok"),
            ("SRV-LYO-02", "Lyon", "absent absent ok ok")
        }) {
            var row = server.ToLowerInvariant();
            matrix.Rows.Item(row, server, item => item.Value("site", site));
            var cells = states.Split(' ');
            for (var i = 0; i < services.Length; i++) {
                var cell = matrix.Set(row, services[i], cells[i]);
                if (cells[i] == "critical") cell.Title = "Probes failing: 3/3.";
            }
        }
        matrix.SaveHtmlPage("matrix.html");
        // view:end
    }

    /// <summary>Change review: a change set on a replicated share, with a diff that opens in place.</summary>
    internal static void Changes() {
        // view:begin changes-cs
        var seen = new DateTimeOffset(2026, 10, 21, 10, 42, 0, TimeSpan.Zero);
        var list = new CanopyChangeList("share-changes", "Changes on the deployment share");
        list.Action("copy-path", "Copy the path", CanopyChangeActionIcon.Copy, copy: "unc")
            .Action("acknowledge", "Acknowledge", CanopyChangeActionIcon.Check);

        var payload = list.Add(
            "payload", CanopyChangeKind.Added, "Scripts/Logon/agent.exe");
        payload.After = new CanopyChangeVersion {
            Size = 1_248_256,
            Hash = "9f2c41d07be35a18c6e0d4f9a2b7c3e15d8f60a4b9c2e7d1f3a5b8c0d2e4f6a8",
            Time = seen
        };
        payload.Flag("unsigned", "Unsigned", "The file has no embedded signature.",
            CanopyTone.Danger);
        payload.Values["unc"] = @"\\fs01\deploy\Scripts\Logon\agent.exe";

        var settings = list.Add(
            "settings", CanopyChangeKind.Modified, "Config/settings.ini");
        settings.Before = new CanopyChangeVersion { Size = 612, Time = seen.AddDays(-40) };
        settings.After = new CanopyChangeVersion { Size = 618, Time = seen };
        settings.Values["unc"] = @"\\fs01\deploy\Config\settings.ini";
        settings.Diff = CanopyTextDiff.FromTexts("settings-diff", "settings.ini",
            "[agent]\nchannel=stable\ninterval=60\n",
            "[agent]\nchannel=preview\ninterval=60\n",
            compare: true);

        var removed = list.Add(
            "legacy", CanopyChangeKind.Removed, "Tools/legacy-inventory.vbs");
        removed.Before = new CanopyChangeVersion {
            Size = 3_904,
            Time = seen.AddDays(-400)
        };
        removed.Values["unc"] = @"\\fs01\deploy\Tools\legacy-inventory.vbs";
        list.SaveHtmlPage("changes.html");
        // view:end
    }

    /// <summary>Guided flow: a service setup task list.</summary>
    internal static void Flow() {
        // view:begin flow-cs
        var flow = new CanopyFlow("service-setup", "Set up the reporting service") {
            Description = "Finish the tasks in any order. "
                + "The service starts once every required task is complete.",
            Mode = CanopyFlowMode.Tasks,
            Submit = new CanopyFlowSubmit("Start the service")
        };
        flow.Step("database", "Connect the database", step => step
            .Group("Connect")
            .Choice("engine", "Database engine", f => f
                .Option("sql", "SQL Server")
                .Option("pg", "PostgreSQL")
                .Required()
                .Default("sql"))
            .Text("server", "Server", f => f
                .Required()
                .Help("A host name, with a port when it is not the default."))
            .Text("name", "Database name", f => f.Required().Default("reports").Half()));
        flow.Step("mail", "Choose who gets notified", step => step
            .Group("Connect")
            .List("admins", "Administrators", f => f
                .Required()
                .Items(CanopyFlowItemRule.Email)
                .Count(1, 10))
            .Toggle("digest", "Send a daily digest", f => f.Default(true)));
        flow.Step("branding", "Add your branding", step => step
            .Group("Content")
            .Optional()
            .Text("company", "Company name")
            .Choice("accent", "Accent colour", f => f
                .Option("teal", "Teal")
                .Option("blue", "Blue")
                .Default("teal")));
        flow.Review(review => review
            .Declaration("Starting the service runs the first schedules today."));
        flow.SaveHtmlPage("flow.html");
        // view:end
    }

    /// <summary>Email and print: a script-free outline of the shares, cut to fit a message.</summary>
    internal static string Email() {
        // view:begin email-cs
        var shares = new CanopyTreeView("shares", "File shares over quota");
        shares.Columns.Add(new CanopyColumn("name", "Share"));
        shares.Columns.Add(new CanopyColumn("used", "Used") {
            Kind = CanopyColumnKind.Number
        });
        shares.Columns.Add(new CanopyColumn("owner", "Owner"));
        foreach (var (server, items) in new[] {
            ("fs01", new[] {
                ("finance", 412, "anna.kowalska"),
                ("people", 388, "dana.levi")
            }),
            ("fs02", new[] {
                ("projects", 951, "ben.okafor"),
                ("archive", 1_204, "chen.wei")
            })
        }) {
            var node = new CanopyNode(server, @"\\" + server) { Expanded = true };
            foreach (var (name, gb, owner) in items) {
                var share = new CanopyNode(server + "-" + name, name);
                share.Cells["used"] = new CanopyCell(gb) {
                    Text = $"{gb} GB",
                    Tone = gb > 1_000 ? CanopyTone.Danger : CanopyTone.Warning
                };
                share.Cells["owner"] = owner;
                node.Children.Add(share);
            }
            shares.Roots.Add(node);
        }

        string html = CanopyStaticHtml.Render(shares, new CanopyStaticHtmlOptions {
            MaxRows = 20,
            FullReportUrl = "https://canopyx.dev/live/files/index.html"
        });
        // view:end
        return html;
    }
}
