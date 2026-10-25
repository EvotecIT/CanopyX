using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>A migration plan with parallel tasks, a baseline, a release milestone and one visible dependency conflict.</summary>
internal static class PlanExample {
    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            Create().SaveHtmlPage(Path.Combine(output, "plan" + suffix + ".html"), new CanopyHtmlOptions { Title = "Migration plan", Theme = theme, Height = "320px" });
        }
        File.WriteAllText(Path.Combine(output, "plan-static.html"), "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Migration plan</title>" +
            CanopyStaticHtml.RenderGrid(Create()) + "</html>");
    }

    internal static CanopyDataGridView Create() {
        var view = new CanopyDataGridView("migration-plan", "Migration plan") { Noun = "tasks", Selection = CanopySelectionMode.Single };
        view.Columns.Add(new CanopyColumn("title", "Task") { RowHeader = true, Sortable = true });
        view.Columns.Add(new CanopyColumn("starts", "Actual start") { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("ends", "Actual finish") { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("owner", "Team"));
        view.Columns.Add(new CanopyColumn("baselineStart", "Baseline start") { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("baselineEnd", "Baseline finish") { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("milestone", "Milestone") { Hidden = true });
        var resources = new CanopyTreeView("migration-teams", "Teams");
        resources.Columns.Add(new CanopyColumn("name", "Team"));
        foreach (var (id, label) in new[] { ("platform", "Platform"), ("validation", "Validation"), ("operations", "Operations") }) resources.Roots.Add(new CanopyNode(id, label));
        view.Calendar = new CanopyCalendar("starts") {
            End = "ends", Title = "title", Resource = "owner", Resources = new CanopyCalendarResources(resources),
            View = CanopyCalendarView.Timeline, PhoneView = CanopyCalendarView.Timeline, Date = new DateTime(2026, 10, 11), TimeZone = "UTC", NowIndicator = false,
            Span = new CanopyCalendarSpan(14, CanopyCalendarSpanUnit.Day)
        };
        view.Calendar.Views.Add(CanopyCalendarView.Timeline);
        view.Plan = new CanopyPlan { BaselineStart = "baselineStart", BaselineEnd = "baselineEnd", Milestone = "milestone", ProposeMoves = true };
        foreach (var (id, title, owner, start, end, milestone) in new[] {
            ("prepare", "Prepare migration", "platform", 12, 14, false),
            ("migrate", "Move workloads", "platform", 14, 18, false),
            ("runbook", "Update runbooks", "operations", 14, 16, false),
            ("verify", "Verify workloads", "validation", 18, 20, false),
            ("release", "Release milestone", "operations", 19, 19, true)
        }) {
            var row = new CanopyGridRow(id);
            row.Cells["title"] = title; row.Cells["owner"] = owner;
            row.Cells["starts"] = new DateTime(2026, 10, start, 0, 0, 0, DateTimeKind.Utc);
            row.Cells["ends"] = new DateTime(2026, 10, end, 0, 0, 0, DateTimeKind.Utc);
            row.Cells["baselineStart"] = new DateTime(2026, 10, start - 1, 0, 0, 0, DateTimeKind.Utc);
            row.Cells["baselineEnd"] = new DateTime(2026, 10, end - 1, 0, 0, 0, DateTimeKind.Utc);
            row.Cells["milestone"] = milestone;
            view.Rows.Add(row);
        }
        foreach (var (from, to) in new[] { ("prepare", "migrate"), ("prepare", "runbook"), ("migrate", "verify"), ("verify", "release"), ("runbook", "release") })
            view.Plan.Dependencies.Add(new CanopyPlanDependency(from, to));
        return view;
    }
}
