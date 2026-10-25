using System.Text.Json.Nodes;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>Plan definitions and the script-free task snapshot hosts consume.</summary>
public sealed class PlanTests {
    [Fact]
    public void Plan_WritesMappingsAndFinishToStartEdges_AndMatchesTheSchema() {
        var view = Grid();
        view.Plan!.Dependencies.Add(new CanopyPlanDependency("prepare", "migrate") { Lag = TimeSpan.FromMinutes(15.5) });
        view.Plan.CriticalPath = false; view.Plan.ProposeMoves = true; view.Plan.AvoidOverlap = false;
        var json = view.ToJson();
        var plan = JsonNode.Parse(json)!["plan"]!;
        Assert.Equal("baselineStart", plan["baselineStart"]!.GetValue<string>());
        Assert.Equal("baselineEnd", plan["baselineEnd"]!.GetValue<string>());
        Assert.Equal("milestone", plan["milestone"]!.GetValue<string>());
        Assert.False(plan["criticalPath"]!.GetValue<bool>());
        Assert.True(plan["proposeMoves"]!.GetValue<bool>());
        Assert.False(plan["avoidOverlap"]!.GetValue<bool>());
        Assert.Equal("prepare", plan["dependencies"]![0]!["predecessor"]!.GetValue<string>());
        Assert.Equal("migrate", plan["dependencies"]![0]!["successor"]!.GetValue<string>());
        Assert.Equal(15.5, plan["dependencies"]![0]!["lagMinutes"]!.GetValue<double>());
        ProtocolSchema.AssertValid(json, "a task plan with a fractional dependency lag");
        view.Plan = new CanopyPlan();
        Assert.Equal("{}", JsonNode.Parse(view.ToJson())!["plan"]!.ToJsonString());
    }

    [Fact]
    public void Plan_RejectsCyclesDuplicateEdgesMissingTasksAndNegativeLag() {
        var view = Grid();
        var edges = view.Plan!.Dependencies;
        edges.Add(new CanopyPlanDependency("prepare", "migrate"));
        edges.Add(new CanopyPlanDependency("migrate", "prepare"));
        Assert.Contains("cycle", Assert.Throws<InvalidOperationException>(view.Validate).Message);
        edges.RemoveAt(1); edges.Add(new CanopyPlanDependency("prepare", "migrate"));
        Assert.Contains("repeat", Assert.Throws<InvalidOperationException>(view.Validate).Message);
        edges.Clear(); edges.Add(new CanopyPlanDependency("missing", "migrate"));
        Assert.Contains("existing task", Assert.Throws<InvalidOperationException>(view.Validate).Message);
        edges.Clear(); edges.Add(new CanopyPlanDependency("prepare", "migrate") { Lag = TimeSpan.FromMinutes(-1) });
        Assert.Contains("nonnegative", Assert.Throws<InvalidOperationException>(view.Validate).Message);
        Assert.Throws<ArgumentException>(() => new CanopyPlanDependency("prepare", "prepare"));
    }

    [Theory]
    [InlineData("baseline-pair")]
    [InlineData("unknown-column")]
    [InlineData("wrong-kind")]
    [InlineData("no-resources")]
    [InlineData("no-timeline")]
    [InlineData("recurrence")]
    public void Plan_RequiresCoherentCalendarAndColumnMappings(string problem) {
        var view = Grid();
        switch (problem) {
            case "baseline-pair": view.Plan!.BaselineEnd = null; break;
            case "unknown-column": view.Plan!.Milestone = "unknown"; break;
            case "wrong-kind": view.Plan!.BaselineStart = "title"; break;
            case "no-resources": view.Calendar!.Resources = null; break;
            case "no-timeline": view.Calendar!.Views.Clear(); view.Calendar.Views.Add(CanopyCalendarView.Month); view.Calendar.View = CanopyCalendarView.Month; break;
            case "recurrence": view.Calendar!.Recurrence = "milestone"; break;
        }
        Assert.Throws<InvalidOperationException>(view.Validate);
    }

    [Fact]
    public void StaticPlan_ShowsMilestoneBaselineCriticalPathAndDependencyConflictsWithoutScripts() {
        var view = Grid();
        view.Plan!.Dependencies.Add(new CanopyPlanDependency("prepare", "migrate"));
        view.Plan.Dependencies.Add(new CanopyPlanDependency("migrate", "release"));
        view.Plan.Dependencies.Add(new CanopyPlanDependency("prepare", "notes"));
        view.Rows[1].Cells["starts"] = At(2); // Starts before prepare finishes on day 3.
        view.Rows[0].Cells["title"] = "Prepare <work>";
        view.Labels.PlanMilestone = "Kamień milowy";
        view.Labels.PlanCritical = "Ścieżka krytyczna";
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Equal(4, result.Rows.Count);
        Assert.Equal("Ścieżka krytyczna", result.Rows[0][4]);
        Assert.Equal("Ścieżka krytyczna", result.Rows[1][4]);
        Assert.Equal(string.Empty, result.Rows[2][4]);
        Assert.Contains("Kamień milowy", result.Rows[3][0]);
        Assert.Contains("2026-10-01", result.Rows[0][3]);
        Assert.Contains("Dependency conflict with Prepare <work>", result.Rows[1][5]);
        Assert.Contains("Prepare &lt;work&gt;", result.Html);
        Assert.DoesNotContain("<script", result.Html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("onclick", result.Html, StringComparison.OrdinalIgnoreCase);
        Assert.True(result.IsComplete);
    }

    [Fact]
    public void StaticPlan_CriticalPathUsesAllInlineTasksBeforeTheRenderLimit_AndIncludesLag() {
        var view = Grid();
        view.Plan!.Dependencies.Add(new CanopyPlanDependency("prepare", "notes") { Lag = TimeSpan.FromDays(10) });
        var result = CanopyStaticHtml.RenderGridWithResult(view, options: new CanopyStaticHtmlOptions { MaxRows = 1, FullReportUrl = "https://example.test/plan" });
        Assert.Single(result.Rows);
        Assert.Equal("Critical path", result.Rows[0][4]);
        Assert.False(result.IsComplete);
        Assert.Equal(4, result.TotalRows);
        Assert.Contains("https://example.test/plan", result.Html);
    }

    [Fact]
    public void StaticPlan_HostedWindowDoesNotClaimAnAuthoritativeCriticalPath() {
        var view = Grid();
        var rows = view.Rows.ToArray(); view.Rows.Clear(); view.Source = CanopyGridSource.HostedOffset();
        var page = new CanopyGridPage(view.Id, "snapshot-1", 0, 20, 20);
        page.Rows.Add(rows[0]);
        var result = CanopyStaticHtml.RenderGridWithResult(view, page);
        Assert.Equal(view.Labels.PlanIncomplete, result.Rows[0][4]);
        Assert.False(result.IsComplete);
        Assert.Equal(20, result.TotalRows);
    }

    [Fact]
    public void StaticPlan_OffsetDatesAndDeclaredMilestonesUseElapsedDurations() {
        var view = Grid();
        view.Rows[0].Cells["starts"] = new DateTimeOffset(2026, 10, 2, 9, 0, 0, TimeSpan.FromHours(2));
        view.Rows[0].Cells["ends"] = new DateTimeOffset(2026, 10, 2, 10, 0, 0, TimeSpan.FromHours(2));
        view.Rows[3].Cells["ends"] = At(20); // The milestone field wins over an incidental end cell.
        view.Plan!.Dependencies.Add(new CanopyPlanDependency("migrate", "release"));
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Contains("07:00 UTC", result.Rows[0][2]);
        Assert.Equal("2026-10-06 00:00 UTC – 2026-10-06 00:00 UTC", result.Rows[3][2]);
    }

    [Fact]
    public void StaticPlan_AllDayTasksKeepTheCalendarsExclusiveDateBoundary() {
        var view = Grid();
        view.Columns.Add(new CanopyColumn("allDay", "All day"));
        view.Calendar!.AllDay = "allDay";
        view.Rows[0].Cells["allDay"] = true;
        view.Rows[0].Cells["starts"] = At(2).AddHours(18);
        view.Rows[0].Cells["ends"] = At(2).AddHours(19);
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Equal("2026-10-02 00:00 UTC – 2026-10-03 00:00 UTC", result.Rows[0][2]);
        Assert.DoesNotContain("Milestone", result.Rows[0][0]);
    }

    private static DateTime At(int day) => new DateTime(2026, 10, day, 0, 0, 0, DateTimeKind.Utc);

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("plan-test", "Migration tasks");
        view.Columns.Add(new CanopyColumn("title", "Task") { RowHeader = true });
        foreach (var column in new[] { "starts", "ends", "baselineStart", "baselineEnd" }) view.Columns.Add(new CanopyColumn(column, column) { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("owner", "Owner")); view.Columns.Add(new CanopyColumn("milestone", "Milestone"));
        var resources = new CanopyTreeView("teams", "Teams");
        resources.Columns.Add(new CanopyColumn("name", "Team"));
        resources.Roots.Add(new CanopyNode("one", "Team one")); resources.Roots.Add(new CanopyNode("two", "Team two"));
        view.Calendar = new CanopyCalendar("starts") { End = "ends", Title = "title", Resource = "owner", Resources = new CanopyCalendarResources(resources), View = CanopyCalendarView.Timeline, TimeZone = "UTC" };
        view.Calendar.Views.Add(CanopyCalendarView.Timeline);
        view.Plan = new CanopyPlan { BaselineStart = "baselineStart", BaselineEnd = "baselineEnd", Milestone = "milestone" };
        foreach (var (id, name, from, to, owner) in new[] { ("prepare", "Prepare", 2, 3, "one"), ("migrate", "Migrate", 3, 6, "one"), ("notes", "Notes", 3, 4, "two"), ("release", "Release", 6, 6, "two") }) {
            var row = new CanopyGridRow(id);
            row.Cells["title"] = name; row.Cells["starts"] = At(from); row.Cells["ends"] = At(to); row.Cells["owner"] = owner;
            row.Cells["baselineStart"] = At(from - 1); row.Cells["baselineEnd"] = At(Math.Max(1, to - 1)); row.Cells["milestone"] = id == "release";
            view.Rows.Add(row);
        }
        return view;
    }
}
