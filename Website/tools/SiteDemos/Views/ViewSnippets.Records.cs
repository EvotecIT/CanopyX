// The snippets of the views a grid's records drive: board, plan, pivot, dataset comparison, snapshots over time, approval
// paths and configuration layers. The same rules as ViewSnippets.cs apply: markers, run by ViewCode, 84 columns.
using CanopyX;
using CanopyX.Html;

namespace SiteDemos.Views;

internal static partial class ViewSnippets {
    /// <summary>Board: tasks as cards in status lanes, one swimlane per team.</summary>
    internal static void Board() {
        // view:begin board-cs
        var tasks = new CanopyDataGridView("migration", "Migration board") {
            Noun = "tasks",
            Board = new CanopyBoard("status") {
                TitleColumn = "title",
                SwimlaneColumn = "team",
                Editable = true
            }
        };
        tasks.Columns.Add(new CanopyColumn("title", "Task") { RowHeader = true });
        tasks.Columns.Add(new CanopyColumn("status", "Status") { Editable = true });
        tasks.Columns.Add(new CanopyColumn("team", "Team"));
        tasks.Columns.Add(new CanopyColumn("owner", "Assigned to"));
        tasks.Board.Lanes.Add(new CanopyBoardLane("ready", "Ready"));
        tasks.Board.Lanes.Add(new CanopyBoardLane("active", "In progress") {
            WipLimit = 3
        });
        tasks.Board.Lanes.Add(new CanopyBoardLane("done", "Done"));
        tasks.Board.Fields.Add("owner");

        foreach (var (id, title, status, team, owner) in new[] {
            ("staging", "Prepare the staging hosts", "ready", "Platform", "Sam"),
            ("backup", "Verify backup restoration", "active", "Platform", "Jordan"),
            ("tls", "Remediate weak TLS settings", "active", "Security", "Alex"),
            ("dns", "Remove retired DNS records", "done", "Platform", "Taylor")
        }) {
            var row = new CanopyGridRow(id);
            row.Cells["title"] = title;
            row.Cells["status"] = status;
            row.Cells["team"] = team;
            row.Cells["owner"] = owner;
            tasks.Rows.Add(row);
        }
        tasks.SaveHtmlPage("board.html");
        // view:end
    }

    /// <summary>Plan: tasks on a timeline per team, with a baseline and dependencies.</summary>
    internal static void Plan() {
        // view:begin plan-cs
        var start = new DateTime(2026, 11, 2, 0, 0, 0, DateTimeKind.Utc);
        var plan = new CanopyDataGridView("rollout", "Rollout plan") { Noun = "tasks" };
        plan.Columns.Add(new CanopyColumn("title", "Task") { RowHeader = true });
        plan.Columns.Add(new CanopyColumn("starts", "Start") {
            Kind = CanopyColumnKind.DateTime
        });
        plan.Columns.Add(new CanopyColumn("ends", "Finish") {
            Kind = CanopyColumnKind.DateTime
        });
        plan.Columns.Add(new CanopyColumn("team", "Team"));
        plan.Columns.Add(new CanopyColumn("planStart", "Baseline start") {
            Kind = CanopyColumnKind.DateTime
        });
        plan.Columns.Add(new CanopyColumn("planEnd", "Baseline finish") {
            Kind = CanopyColumnKind.DateTime
        });

        var teams = new CanopyTreeView("teams", "Teams");
        teams.Columns.Add(new CanopyColumn("name", "Team"));
        teams.Roots.Add(new CanopyNode("platform", "Platform"));
        teams.Roots.Add(new CanopyNode("validation", "Validation"));
        plan.Calendar = new CanopyCalendar("starts") {
            End = "ends",
            Title = "title",
            Resource = "team",
            Resources = new CanopyCalendarResources(teams),
            View = CanopyCalendarView.Timeline,
            Date = start,
            Span = new CanopyCalendarSpan(10, CanopyCalendarSpanUnit.Day)
        };
        plan.Calendar.Views.Add(CanopyCalendarView.Timeline);
        plan.Plan = new CanopyPlan {
            BaselineStart = "planStart",
            BaselineEnd = "planEnd"
        };

        foreach (var (id, title, team, day, days) in new[] {
            ("prepare", "Prepare the hosts", "platform", 0, 2),
            ("move", "Move the workloads", "platform", 2, 3),
            ("verify", "Verify the workloads", "validation", 5, 2)
        }) {
            var row = new CanopyGridRow(id);
            row.Cells["title"] = title;
            row.Cells["team"] = team;
            row.Cells["starts"] = start.AddDays(day);
            row.Cells["ends"] = start.AddDays(day + days);
            row.Cells["planStart"] = start.AddDays(day - 1);
            row.Cells["planEnd"] = start.AddDays(day + days - 1);
            plan.Rows.Add(row);
        }
        plan.Plan.Dependencies.Add(new CanopyPlanDependency("prepare", "move"));
        plan.Plan.Dependencies.Add(new CanopyPlanDependency("move", "verify"));
        plan.SaveHtmlPage("plan.html");
        // view:end
    }

    /// <summary>Pivot: sales by region down and by quarter across, with totals.</summary>
    internal static void Pivot() {
        // view:begin pivot-cs
        var sales = new CanopyDataGridView("sales", "Sales by region") {
            Reporting = new CanopyGridReporting { Pivotable = true }
        };
        sales.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true });
        sales.Columns.Add(new CanopyColumn("quarter", "Quarter") { Sortable = true });
        sales.Columns.Add(new CanopyColumn("amount", "Amount") {
            Kind = CanopyColumnKind.Number
        });
        sales.Reporting.Aggregates.Add(new CanopyGridAggregate(
            "total", "amount", CanopyGridAggregateOperation.Sum, "Total"));

        var pivot = sales.Reporting.Pivot = new CanopyGridPivot();
        pivot.Rows.Add(new CanopyGridGroupLevel("region"));
        pivot.Columns.Add(new CanopyGridGroupLevel("quarter"));
        pivot.Values.Add("total");

        var id = 0;
        foreach (var region in new[] { "North", "South", "Central" }) {
            foreach (var quarter in new[] { "Q1", "Q2", "Q3", "Q4" }) {
                var row = new CanopyGridRow("sale-" + ++id);
                row.Cells["region"] = region;
                row.Cells["quarter"] = quarter;
                row.Cells["amount"] = id * 137 % 900 + 100;
                sales.Rows.Add(row);
            }
        }
        sales.SaveHtmlPage("pivot.html");
        // view:end
    }

    /// <summary>Dataset comparison: two snapshots matched by key, shown as added, removed and changed.</summary>
    internal static void Compare() {
        // view:begin compare-cs
        var before = new[] {
            Item("atlas", "Atlas", "Active", 24),
            Item("birch", "Birch", "Paused", 8),
            Item("delta", "Delta", "Active", 40)
        };
        var after = new[] {
            Item("atlas", "Atlas", "Active", 32),
            Item("birch", "Birch", "Active", 8),
            Item("elm", "Elm", "Paused", 16)
        };
        var comparison = CanopyDatasetComparer.Compare(
            before, after, new[] { "name", "stage", "units" });
        var view = comparison.ToView("changes", "Inventory changes", new[] {
            new CanopyColumn("name", "Item") { RowHeader = true },
            new CanopyColumn("stage", "Stage"),
            new CanopyColumn("units", "Units") { Kind = CanopyColumnKind.Number }
        });
        view.SaveHtmlPage("compare.html");

        static CanopyGridRow Item(string id, string name, string stage, int units) {
            var row = new CanopyGridRow(id);
            row.Cells["name"] = name;
            row.Cells["stage"] = stage;
            row.Cells["units"] = units;
            return row;
        }
        // view:end
    }

    /// <summary>Snapshots over time: a matrix replayed through three moments of a rollout.</summary>
    internal static void Time() {
        // view:begin time-cs
        var start = new DateTimeOffset(2026, 10, 25, 10, 0, 0, TimeSpan.Zero);
        var rollout = Health(0);
        rollout.TimeSlider = new CanopyTimeSlider<CanopyMatrix> {
            IntervalMilliseconds = 1500
        };
        foreach (var (step, label) in new[] {
            (0, "Rollout started"), (1, "Update spreading"), (2, "All ready")
        }) {
            rollout.TimeSlider.Snapshots.Add(
                new(start.AddMinutes(step), Health(step), label));
        }
        rollout.SaveHtmlPage("time.html");

        static CanopyMatrix Health(int step) {
            var matrix = new CanopyMatrix("rollout", "Service health over time");
            matrix.State("waiting", "Waiting", CanopyTone.Warning,
                    CanopyMatrixSymbol.Clock, attention: true)
                .State("ready", "Ready", CanopyTone.Success, CanopyMatrixSymbol.Check);
            matrix.Columns.Item("east", "East").Item("west", "West");
            var services = new[] { "API", "Search", "Cache" };
            for (var i = 0; i < services.Length; i++) {
                matrix.Rows.Item("s" + i, services[i]);
                matrix.Set("s" + i, "east", i <= step ? "ready" : "waiting");
                matrix.Set("s" + i, "west", i < step ? "ready" : "waiting");
            }
            return matrix;
        }
        // view:end
    }

    /// <summary>Approval path: the route a change request takes, as hops over ordinary records.</summary>
    internal static void Route() {
        // view:begin path-cs
        var steps = new CanopyDataGridView("approval", "Approval route") {
            Path = new CanopyPath()
        };
        steps.Columns.Add(new CanopyColumn("title", "Step") { RowHeader = true });
        steps.Columns.Add(new CanopyColumn("team", "Responsible team"));
        foreach (var (id, title, team) in new[] {
            ("request", "Submit the change request", "Operations"),
            ("review", "Review the change and its rollback", "Review group"),
            ("approve", "Approve the scheduled change", "Change board")
        }) {
            var row = new CanopyGridRow(id);
            row.Cells["title"] = title;
            row.Cells["team"] = team;
            steps.Rows.Add(row);
        }

        var route = new CanopyPathChain("standard", "Standard approval");
        route.Hops.Add(new CanopyPathHop("request", "Request prepared"));
        route.Hops.Add(new CanopyPathHop("review", "Two reviewers") {
            Badges = { new CanopyBadge("Required", CanopyTone.Info) }
        });
        route.Hops.Add(new CanopyPathHop("approve", "Approval recorded"));
        steps.Path.Chains.Add(route);
        steps.SaveHtmlPage("path.html");
        // view:end
    }

    /// <summary>Layer stack: configuration layers in processing order, with the one the host selected.</summary>
    internal static void Stack() {
        // view:begin stack-cs
        var layers = new CanopyDataGridView("settings", "Where the setting comes from") {
            Stack = new CanopyStack()
        };
        layers.Columns.Add(new CanopyColumn("title", "Layer") { RowHeader = true });
        layers.Columns.Add(new CanopyColumn("value", "Value"));
        foreach (var (id, title, value) in new[] {
            ("defaults", "Shared defaults", "Standard"),
            ("site", "Site policy", "Extended"),
            ("user", "User preference", "Compact")
        }) {
            var row = new CanopyGridRow(id);
            row.Cells["title"] = title;
            row.Cells["value"] = value;
            layers.Rows.Add(row);
        }

        layers.Stack.Layers.Add(new CanopyStackLayer(
            "defaults", "defaults", "The starting value."));
        layers.Stack.Layers.Add(new CanopyStackLayer(
            "site", "site", "Enforced by policy, but a user may narrow it.") {
            Enforced = true
        });
        layers.Stack.Layers.Add(new CanopyStackLayer(
            "user", "user", "The value this session uses.") {
            Winner = true
        });
        layers.SaveHtmlPage("stack.html");
        // view:end
    }
}
