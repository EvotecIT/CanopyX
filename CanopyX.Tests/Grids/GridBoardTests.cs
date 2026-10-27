using System.Text.Json.Nodes;

namespace CanopyX.Tests.Grids;

public sealed class GridBoardTests {
    [Fact]
    public void Board_WritesOptionalTypedSettingsWithoutCellMetadata() {
        var view = Grid();
        Assert.Null(JsonNode.Parse(view.ToJson())!["board"]);
        view.Board = new CanopyBoard("status") { TitleColumn = "title", SwimlaneColumn = "team", Editable = true };
        view.Board.Fields.Add("team");
        view.Board.Lanes.Add(new CanopyBoardLane(new CanopyCell("active") { Text = "Ignored", Title = "Also ignored" }, "In progress") { WipLimit = 3 });
        view.Board.Lanes.Add(new CanopyBoardLane(true, "Boolean"));
        view.Board.Lanes.Add(new CanopyBoardLane(null, "Unassigned"));
        var board = JsonNode.Parse(view.ToJson())!["board"]!;
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""
            {"column":"status","titleColumn":"title","swimlaneColumn":"team","lanes":[
              {"value":"active","label":"In progress","wipLimit":3},
              {"value":true,"label":"Boolean"},{"value":null,"label":"Unassigned"}],"fields":["team"],"editable":true}
            """), board));
        view.Board = new CanopyBoard("status");
        Assert.Equal("{\"column\":\"status\",\"lanes\":[]}", JsonNode.Parse(view.ToJson())!["board"]!.ToJsonString());
    }

    [Theory]
    [InlineData("column")]
    [InlineData("titleColumn")]
    [InlineData("swimlaneColumn")]
    [InlineData("fields")]
    public void Board_RejectsUndeclaredColumnReferences(string setting) {
        var view = Grid();
        view.Board = new CanopyBoard(setting == "column" ? "absent" : "status");
        if (setting == "titleColumn") view.Board.TitleColumn = "absent";
        if (setting == "swimlaneColumn") view.Board.SwimlaneColumn = "absent";
        if (setting == "fields") view.Board.Fields.Add("absent");
        Assert.Throws<InvalidOperationException>(view.Validate);
    }

    [Fact]
    public void Board_ValidatesLaneTypesAndWireIdentityCollisions() {
        var view = Grid();
        view.Columns.Add(new CanopyColumn("number", "Number") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("date", "Date") { Kind = CanopyColumnKind.DateTime });
        view.Board = new CanopyBoard("number");
        view.Board.Lanes.Add(new CanopyBoardLane("1", "Wrong type"));
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Board.Lanes.Clear();
        view.Board.Lanes.Add(new CanopyBoardLane(1L, "One"));
        view.Board.Lanes.Add(new CanopyBoardLane(1m, "Duplicate number"));
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Board.Lanes.Clear();
        view.Board.Lanes.Add(new CanopyBoardLane(double.PositiveInfinity, "Infinity"));
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Board.Lanes.Clear();
        view.Board.Lanes.Add(new CanopyBoardLane(9007199254740992L, "Unsafe number"));
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Board = new CanopyBoard("date");
        view.Board.Lanes.Add(new CanopyBoardLane("2026-10-25T00:00:00Z", "Wrong date type"));
        Assert.Throws<InvalidOperationException>(view.Validate);
        var date = new DateTime(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc).AddMilliseconds(123);
        view.Board.Lanes.Clear();
        view.Board.Lanes.Add(new CanopyBoardLane(date, "Today"));
        Assert.Equal("2026-10-25T12:00:00.123Z", JsonNode.Parse(view.ToJson())!["board"]!["lanes"]![0]!["value"]!.GetValue<string>());
        Assert.True(view.Board.Lanes[0].Matches(new CanopyCell(new DateTimeOffset(date).ToOffset(TimeSpan.FromHours(2)))));
        view.Board.Lanes.Add(new CanopyBoardLane(date.AddTicks(1), "Same wire instant"));
        Assert.Throws<InvalidOperationException>(view.Validate);
    }

    [Fact]
    public void Board_DerivesExactTypedLanesAndRetainsConfiguredEmptyLanes() {
        var view = Grid();
        view.Board = new CanopyBoard("status");
        view.Board.Lanes.Add(new CanopyBoardLane("unused", "Configured empty"));
        var values = new CanopyCell?[] { true, "true", null, "", "Active", "active", new CanopyCell("active") { Text = "Different display" } };
        for (var index = 0; index < values.Length; index++) {
            var row = new CanopyGridRow("r" + index);
            if (values[index] != null) row.Cells["status"] = values[index]!;
            view.Rows.Add(row);
        }
        var lanes = view.Board.GetLanes(view);
        Assert.Equal(7, lanes.Count);
        Assert.Equal("Configured empty", lanes[0].Label);
        Assert.True(lanes[1].Matches(true));
        Assert.False(lanes[1].Matches("true"));
        Assert.True(lanes[3].Matches(null));
        Assert.False(lanes[3].Matches(""));
        Assert.False(lanes[5].Matches("active"));
        Assert.Equal("active", lanes[6].Label);
        Assert.Single(view.Board.Lanes);
    }

    [Fact]
    public void Board_EnforcesConfiguredLimitsAndDistinctFields() {
        var view = Grid();
        view.Board = new CanopyBoard("status");
        for (var index = 0; index < 200; index++) view.Board.Lanes.Add(new CanopyBoardLane("lane" + index, "Lane " + index));
        view.Validate();
        view.Board.Lanes.Add(new CanopyBoardLane("extra", "Extra"));
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Board.Lanes.Clear();
        view.Board.Lanes.Add(null!);
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Board.Lanes.Clear();
        for (var index = 0; index < 9; index++) {
            view.Columns.Add(new CanopyColumn("f" + index, "Field " + index));
            view.Board.Fields.Add("f" + index);
        }
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Board.Fields.RemoveAt(8);
        view.Validate();
        view.Board.Fields.Add("f0");
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Board.Fields.Clear();
        view.Board.Fields.Add("title");
        view.Board.Fields.Add("title");
        Assert.Throws<InvalidOperationException>(view.Validate);
        Assert.Throws<ArgumentException>(() => new CanopyBoardLane("x", " "));
        Assert.Throws<ArgumentException>(() => new CanopyBoard(string.Empty));
        Assert.Throws<ArgumentException>(() => new CanopyBoard(" "));
        Assert.Throws<ArgumentException>(() => view.Board.TitleColumn = " ");
        Assert.Throws<ArgumentException>(() => view.Board.SwimlaneColumn = " ");
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyBoardLane("x", "X") { WipLimit = 0 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyBoardLane("x", "X") { WipLimit = 100001 });
        view.Board.Fields.Clear();
        view.Board.Lanes.Add(new CanopyBoardLane("x", "X") { WipLimit = 100000 });
        view.Validate();
    }

    [Fact]
    public void Board_RejectsPagingCalendarAndUnstableOrUneditableMoves() {
        var view = Grid();
        view.Board = new CanopyBoard("status");
        view.Presentation = CanopyGridPresentation.Paged;
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Presentation = CanopyGridPresentation.Continuous;
        view.Source = CanopyGridSource.HostedCursor();
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Source = CanopyGridSource.Inline();
        view.Presentation = CanopyGridPresentation.Continuous;
        view.Columns.Add(new CanopyColumn("date", "Date") { Kind = CanopyColumnKind.DateTime });
        view.Calendar = new CanopyCalendar("date");
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Calendar = null;
        view.Board.Editable = true;
        view.Columns[1].Editable = false;
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Columns[1].Editable = true;
        view.RowIdentity = CanopyGridRowIdentity.Ordinal;
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Board.Editable = false;
        view.Validate();
        view.RowIdentity = CanopyGridRowIdentity.StableKey;
        view.Board.Editable = true;
        view.Editing.ReadOnly = true;
        view.Validate(); // The host may enable interaction later; the board still loads its editing capability.
    }

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("tasks", "Tasks");
        view.Columns.Add(new CanopyColumn("title", "Title"));
        view.Columns.Add(new CanopyColumn("status", "Status") { Editable = true });
        view.Columns.Add(new CanopyColumn("team", "Team"));
        return view;
    }
}
