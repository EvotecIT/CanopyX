using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>A typed grid's calendar: roles from member expressions, with columns added for members the grid has none for.</summary>
/// <remarks>This file compiles into CanopyX.Tests (net10.0) and CanopyX.Tests.NetFramework (net472).</remarks>
public sealed class TypedCalendarTests {
    public sealed class Change {
        public string Id { get; set; } = "";
        public string Title { get; set; } = "";
        public DateTime Starts { get; set; }
        public DateTimeOffset? Ends { get; set; }
        public string Host { get; set; } = "";
        public bool AllDay { get; set; }
        public string State { get; set; } = "";
        public CanopyRecurrence? Rule { get; set; }
        public string? Skipped { get; set; }
        public DateTime? LastEnds { get; set; }
        public string Notes { get; set; } = "";
    }

    [Fact]
    public void Calendar_BindsMembersToColumns_AddingTheMissingOnes() {
        var grid = new CanopyDataGridView<Change>("changes", "Changes", change => change.Id);
        grid.Column(x => x.Title, configure: column => column.RowHeader = true);
        grid.Column(x => x.Starts, "Begins");

        var calendar = grid.Calendar().Start(x => x.Starts).End(x => x.Ends).Title(x => x.Title).Subtitle(x => x.Notes).Resource(x => x.Host)
            .AllDay(x => x.AllDay).Status(x => x.State).Recurrence(x => x.Rule).Exceptions(x => x.Skipped).SeriesEnd(x => x.LastEnds);

        Assert.Same(grid.View.Calendar, calendar.Definition);
        Assert.Same(grid.View.Calendar, grid.Calendar().Definition);
        Assert.Equal("starts", calendar.Definition.Start);
        Assert.Equal("ends", calendar.Definition.End);
        Assert.Equal("title", calendar.Definition.Title);
        Assert.Equal("notes", calendar.Definition.Subtitle);
        Assert.Equal("host", calendar.Definition.Resource);
        Assert.Equal("allDay", calendar.Definition.AllDay);
        Assert.Equal("state", calendar.Definition.Status);
        Assert.Equal("rule", calendar.Definition.Recurrence);
        Assert.Equal("skipped", calendar.Definition.Exceptions);
        Assert.Equal("lastEnds", calendar.Definition.SeriesEnd);
        // Declared columns are reused; the others are added, the technical ones hidden.
        Assert.Equal("Begins", grid.View.GetColumn("starts").Title);
        Assert.Equal(new[] { "title", "starts", "ends", "notes", "host", "allDay", "state", "rule", "skipped", "lastEnds" }, grid.View.Columns.Select(column => column.Id));
        Assert.Equal(CanopyColumnKind.DateTime, grid.View.GetColumn("ends").Kind);
        Assert.Equal(CanopyColumnKind.Text, grid.View.GetColumn("allDay").Kind);
        Assert.Equal(CanopyColumnKind.DateTime, grid.View.GetColumn("lastEnds").Kind);
        Assert.False(grid.View.GetColumn("ends").Hidden);
        Assert.True(grid.View.GetColumn("rule").Hidden);
        Assert.True(grid.View.GetColumn("skipped").Hidden);
        Assert.True(grid.View.GetColumn("lastEnds").Hidden);

        var start = new DateTime(2026, 10, 19, 7, 0, 0, DateTimeKind.Utc);
        var rule = CanopyRecurrence.Weekly(DayOfWeek.Monday).Times(4);
        grid.AddRows(new[] {
            new Change { Id = "c-1", Title = "Patch", Starts = start, Ends = new DateTimeOffset(start.AddHours(2)), Host = "host-1", State = "planned", Rule = rule,
                Skipped = "2026-10-26", LastEnds = rule.SeriesEnd(start, TimeSpan.FromHours(2), TimeZoneInfo.Utc)!.Value.UtcDateTime }
        });
        var json = grid.ToJson();
        Assert.Contains("\"calendar\":{\"start\":\"starts\",\"end\":\"ends\",\"title\":\"title\",\"subtitle\":\"notes\",\"allDay\":\"allDay\",\"resource\":\"host\",\"status\":\"state\"," +
            "\"recurrence\":\"rule\",\"exceptions\":\"skipped\",\"seriesEnd\":\"lastEnds\"}", json);
        // A rule member is written as its rule text.
        Assert.Contains("\"rule\":\"FREQ=WEEKLY;COUNT=4;BYDAY=MO\"", json);
        Assert.Contains("\"lastEnds\":\"2026-11-09T09:00:00Z\"", json);
    }

    [Fact]
    public void Calendar_TakesEveryDateTypeForTheStart_AndOtherSettingsOnTheDefinition() {
        var offsets = new CanopyDataGridView<Change>("offsets", "Offsets", change => change.Id);
        offsets.Calendar().Start(x => x.Ends);
        Assert.Equal("ends", offsets.View.Calendar!.Start);
        var nullable = new CanopyDataGridView<Change>("nullable", "Nullable", change => change.Id);
        nullable.Calendar().Start(x => x.LastEnds).End(x => x.Starts);
        Assert.Equal("lastEnds", nullable.View.Calendar!.Start);
        Assert.False(nullable.View.GetColumn("lastEnds").Hidden);

        var grid = new CanopyDataGridView<Change>("changes", "Changes", change => change.Id);
        grid.Calendar().Start(x => x.Starts).Definition.Views.Add(CanopyCalendarView.Week);
        grid.Calendar().Definition.SlotMinutes = 15;
        Assert.Contains("\"calendar\":{\"start\":\"starts\",\"views\":[\"week\"],\"slotMinutes\":15}", grid.ToJson());
        Assert.Throws<ArgumentException>(() => grid.Calendar().Start(x => DateTime.UtcNow));
        Assert.Throws<ArgumentNullException>(() => grid.Calendar().Title<string>(null!));
    }
}
