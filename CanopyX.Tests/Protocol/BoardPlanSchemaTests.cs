using System.Text.Json.Nodes;

namespace CanopyX.Tests.Protocol;

public sealed class BoardPlanSchemaTests {
    [Fact]
    public void Board_WireContractIncludesTypedLanesAndLocalizedLabels() {
        var view = new CanopyDataGridView("tasks", "Tasks") { Labels = CanopyLabels.Polish(), Board = new CanopyBoard("status") { Editable = true } };
        view.Columns.Add(new CanopyColumn("title", "Task"));
        view.Columns.Add(new CanopyColumn("status", "Status") { Editable = true });
        view.Board.Lanes.Add(new CanopyBoardLane(true, "Accepted") { WipLimit = 3 });
        view.Board.Lanes.Add(new CanopyBoardLane(null, "Unassigned"));
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "board with typed lanes and Polish labels");
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, root => root["board"]!["lanes"]![0]!["wipLimit"] = 0)).IsValid);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, root => root["board"]!["unknown"] = true)).IsValid);
    }

    [Fact]
    public void Plan_WireContractIncludesBaselineAndFinishToStartDependencies() {
        var view = new CanopyDataGridView("tasks", "Tasks") { Labels = CanopyLabels.French() };
        view.Columns.Add(new CanopyColumn("title", "Task"));
        foreach (var id in new[] { "start", "end", "baselineStart", "baselineEnd" }) view.Columns.Add(new CanopyColumn(id, id) { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("resource", "Team"));
        var resources = new CanopyTreeView("teams", "Teams");
        resources.Columns.Add(new CanopyColumn("name", "Name")); resources.Roots.Add(new CanopyNode("ops", "Operations"));
        view.Calendar = new CanopyCalendar("start") { End = "end", Title = "title", Resource = "resource", Resources = new CanopyCalendarResources(resources), View = CanopyCalendarView.Timeline };
        view.Plan = new CanopyPlan { BaselineStart = "baselineStart", BaselineEnd = "baselineEnd", ProposeMoves = true };
        foreach (var id in new[] { "first", "second" }) view.Rows.Add(new CanopyGridRow(id));
        view.Plan.Dependencies.Add(new CanopyPlanDependency("first", "second") { Lag = TimeSpan.FromMinutes(90) });
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "plan with French labels");
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, root => root["plan"]!["dependencies"]![0]!["lagMinutes"] = -1)).IsValid);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, root => root["plan"]!.AsObject().Remove("baselineEnd"))).IsValid);
        foreach (var action in new[] { "create", "drop" })
            Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, root => root["calendar"]![action] = true)).IsValid);
        ProtocolSchema.AssertValid(ProtocolSchema.Mutate(json, root => root["calendar"]!["drop"] = false), "plan with external drops disabled");
    }
}
