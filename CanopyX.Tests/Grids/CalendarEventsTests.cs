using CanopyX.Html;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Basic calendars: events without a grid schema, the grid they write, presets, <c>From</c> and the HTML extensions.</summary>
/// <remarks>This file compiles into CanopyX.Tests (net10.0) and CanopyX.Tests.NetFramework (net472).</remarks>
public sealed class CalendarEventsTests {
    public sealed class Meeting {
        public string Key { get; set; } = "";
        public string Subject { get; set; } = "";
        public DateTime Begins { get; set; }
        public DateTime? Ends { get; set; }
        public DateTimeOffset At { get; set; }
        public bool WholeDay { get; set; }
        public string? Room { get; set; }
    }

    [Fact]
    public void Events_WriteAGridWithTheFixedColumns_OnlyTheOnesSomeEventUses() {
        var calendar = new CanopyCalendar(new[] {
            new CanopyCalendarEvent("Standup", new DateTime(2026, 10, 19, 9, 0, 0, DateTimeKind.Utc)) { End = new DateTime(2026, 10, 19, 9, 15, 0, DateTimeKind.Utc) },
            new CanopyCalendarEvent("Review", new DateTimeOffset(2026, 10, 20, 14, 0, 0, TimeSpan.FromHours(2))) { Id = "review", Description = "Quarterly review" }
        });
        var grid = calendar.Grid!;
        Assert.Same(calendar, grid.Calendar);
        Assert.Equal("calendar", grid.Id);
        Assert.Equal(new[] { "title", "start", "end", "description" }, grid.Columns.Select(column => column.Id));
        Assert.True(grid.GetColumn("title").RowHeader);
        Assert.Equal(CanopyColumnKind.DateTime, grid.GetColumn("start").Kind);
        Assert.Equal(CanopyColumnKind.DateTime, grid.GetColumn("end").Kind);
        Assert.False(grid.GetColumn("description").Hidden);
        Assert.Equal(new[] { "e1", "review" }, grid.Rows.Select(row => row.Id));
        Assert.Equal(new DateTime(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc), grid.Rows[1].Cells["start"].Value);
        Assert.False(grid.Rows[1].Cells.ContainsKey("end"));
        Assert.Equal("start", calendar.Start);
        Assert.Equal("end", calendar.End);
        Assert.Equal("description", calendar.Description);
        Assert.Null(calendar.AllDay);
        var json = grid.ToJson();
        Assert.Contains("\"calendar\":{\"start\":\"start\",\"end\":\"end\",\"description\":\"description\",\"toolbar\":false,\"details\":\"popover\"}", json);
        Assert.Contains("\"id\":\"e1\",\"cells\":{\"title\":\"Standup\",\"start\":\"2026-10-19T09:00:00Z\",\"end\":\"2026-10-19T09:15:00Z\"}", json);
        Assert.DoesNotContain("\"editable\":true", json);
    }

    [Fact]
    public void Events_WriteEveryOptionalColumn_HiddenButTheDescription() {
        var calendar = new CanopyCalendar("team", "Team calendar", new[] {
            new CanopyCalendarEvent("Holiday", new DateTime(2026, 12, 24, 15, 0, 0)) { AllDay = true },
            new CanopyCalendarEvent("Trip", new DateTime(2026, 12, 28)) { AllDay = true, End = new DateTime(2026, 12, 31) },
            new CanopyCalendarEvent("Sync", new DateTime(2026, 10, 19, 9, 0, 0, DateTimeKind.Utc)) {
                Tone = CanopyTone.Warning, Resource = "room-1", Recurrence = CanopyRecurrence.Weekly(DayOfWeek.Monday).Times(4), Exceptions = "2026-10-26", Source = "work", Description = "Weekly"
            }
        });
        var grid = calendar.Grid!;
        Assert.Equal("team", grid.Id);
        Assert.Equal("Team calendar", grid.Label);
        Assert.Equal(new[] { "title", "start", "end", "allDay", "description", "tone", "resource", "recurrence", "exceptions", "series", "recurrenceId", "source" }, grid.Columns.Select(column => column.Id));
        foreach (var id in new[] { "allDay", "tone", "resource", "recurrence", "exceptions", "source" }) {
            Assert.True(grid.GetColumn(id).Hidden, id);
            Assert.Equal(CanopyColumnKind.Text, grid.GetColumn(id).Kind);
        }
        Assert.False(grid.GetColumn("description").Hidden);
        // A date-only all-day event lasts one day; its end is exclusive.
        Assert.Equal(new DateTime(2026, 12, 24, 0, 0, 0, DateTimeKind.Utc), grid.Rows[0].Cells["start"].Value);
        Assert.Equal(new DateTime(2026, 12, 25, 0, 0, 0, DateTimeKind.Utc), grid.Rows[0].Cells["end"].Value);
        Assert.Equal(true, grid.Rows[0].Cells["allDay"].Value);
        Assert.Equal(new DateTime(2026, 12, 31, 0, 0, 0, DateTimeKind.Utc), grid.Rows[1].Cells["end"].Value);
        Assert.False(grid.Rows[2].Cells.ContainsKey("allDay"));
        Assert.Equal("warning", grid.Rows[2].Cells["tone"].Value);
        Assert.Equal("FREQ=WEEKLY;COUNT=4;BYDAY=MO", grid.Rows[2].Cells["recurrence"].Value);
        Assert.Equal("2026-10-26", grid.Rows[2].Cells["exceptions"].Value);
        Assert.Equal("work", grid.Rows[2].Cells["source"].Value);
        Assert.Equal("room-1", grid.Rows[2].Cells["resource"].Value);
        var json = grid.ToJson();
        Assert.Contains("\"allDay\":\"allDay\",\"resource\":\"resource\",\"recurrence\":\"recurrence\",\"exceptions\":\"exceptions\",\"series\":\"series\",\"recurrenceId\":\"recurrenceId\",\"description\":\"description\",\"tone\":\"tone\",\"source\":\"source\"", json);
    }

    [Fact]
    public void AllDayEvents_KeepTheirOwnDate_InEveryOffset() {
        var warsaw = TimeSpan.FromHours(2);
        var events = new[] {
            new CanopyCalendarEvent("Offset", new DateTimeOffset(2026, 10, 16, 0, 0, 0, warsaw), new DateTimeOffset(2026, 10, 18, 0, 0, 0, warsaw)) { AllDay = true },
            new CanopyCalendarEvent("Local", new DateTime(2026, 10, 16, 0, 0, 0, DateTimeKind.Local)) { AllDay = true }
        };
        var grid = new CanopyCalendar(events).Grid!;
        Assert.Equal(new DateTime(2026, 10, 16, 0, 0, 0, DateTimeKind.Utc), grid.Rows[0].Cells["start"].Value);
        Assert.Equal(new DateTime(2026, 10, 18, 0, 0, 0, DateTimeKind.Utc), grid.Rows[0].Cells["end"].Value);
        Assert.Equal(new DateTime(2026, 10, 16, 0, 0, 0, DateTimeKind.Utc), grid.Rows[1].Cells["start"].Value);
        // A timed event from an offset is its UTC moment.
        var timed = new CanopyCalendar(new[] { new CanopyCalendarEvent("Timed", new DateTimeOffset(2026, 10, 16, 0, 0, 0, warsaw)) }).Grid!;
        Assert.Equal(new DateTime(2026, 10, 15, 22, 0, 0, DateTimeKind.Utc), timed.Rows[0].Cells["start"].Value);
        var from = CanopyCalendar.From(new[] { new Meeting { Subject = "Day", At = new DateTimeOffset(2026, 10, 16, 0, 0, 0, warsaw) } }, x => x.Subject, x => x.At, allDay: _ => true).Grid!;
        Assert.Equal(new DateTime(2026, 10, 16, 0, 0, 0, DateTimeKind.Utc), from.Rows[0].Cells["start"].Value);
        Assert.Equal(new DateTime(2026, 10, 17, 0, 0, 0, DateTimeKind.Utc), from.Rows[0].Cells["end"].Value);
    }

    [Fact]
    public void Presets_OfEvents_AreCompletedByResourcesSetLater() {
        var events = new[] { new CanopyCalendarEvent("Sync", new DateTime(2026, 10, 19, 9, 0, 0, DateTimeKind.Utc)) { Resource = "host-1" } };
        var tree = new CanopyTreeView("hosts", "Hosts");
        tree.Columns.Add(new CanopyColumn("name", "Host"));
        tree.Roots.Add(new CanopyNode("host-1", "Host 1"));
        var basic = new CanopyCalendar(events) { Resources = new CanopyCalendarResources(tree) };
        Assert.Equal(new[] { CanopyCalendarView.Month, CanopyCalendarView.Week, CanopyCalendarView.Day, CanopyCalendarView.Agenda }, basic.Views);
        Assert.Contains("\"views\":[\"month\",\"week\",\"day\",\"agenda\"]", basic.Grid!.ToJson());
        var scheduler = new CanopyCalendar(events, CanopyCalendarPreset.Scheduler) { Resources = new CanopyCalendarResources(tree) };
        Assert.Empty(scheduler.Views);
        Assert.Equal(new[] { 3, 5 }, scheduler.Capacity!.Thresholds.Select(threshold => threshold.At));
        Assert.Contains("\"capacity\":{\"thresholds\":[{\"at\":3,\"tone\":\"warning\"},{\"at\":5,\"tone\":\"danger\"}]}", scheduler.Grid!.ToJson());
        // A capacity the host set is kept.
        var custom = new CanopyCalendar(events, CanopyCalendarPreset.Scheduler) { Capacity = new CanopyCalendarCapacity().Add(2, CanopyTone.Danger) };
        custom.Resources = new CanopyCalendarResources(tree);
        Assert.Single(custom.Capacity!.Thresholds);
    }

    [Fact]
    public void Events_RefuseNullsAndDuplicateIds() {
        Assert.Throws<ArgumentNullException>(() => new CanopyCalendar((IEnumerable<CanopyCalendarEvent>)null!));
        Assert.Throws<ArgumentNullException>(() => new CanopyCalendar(new CanopyCalendarEvent[] { null! }));
        Assert.Throws<ArgumentNullException>(() => new CanopyCalendarEvent(null!, DateTime.UtcNow));
        Assert.Throws<ArgumentException>(() => new CanopyCalendarEvent("x", DateTime.UtcNow) { Id = "" });
        Assert.Throws<ArgumentException>(() => new CanopyCalendarEvent("x", DateTime.UtcNow) { Resource = "" });
        Assert.Throws<ArgumentException>(() => new CanopyCalendar(new[] { new CanopyCalendarEvent("a", DateTime.UtcNow) { Id = "e2" }, new CanopyCalendarEvent("b", DateTime.UtcNow) }));
        // An empty calendar still writes a valid grid.
        Assert.Contains("\"rows\":[]", new CanopyCalendar(new CanopyCalendarEvent[0]).Grid!.ToJson());
    }

    [Fact]
    public void Presets_OfEvents_MakeTheEditedColumnsEditableWhileTheCalendarEdits() {
        var events = new[] {
            new CanopyCalendarEvent("Sync", new DateTime(2026, 10, 19, 9, 0, 0, DateTimeKind.Utc)) { Resource = "room-1", AllDay = false, Recurrence = CanopyRecurrence.Daily(), Description = "Notes" }
        };
        var scheduler = new CanopyCalendar(events, CanopyCalendarPreset.Scheduler);
        var json = scheduler.Grid!.ToJson();
        Assert.Contains("\"editable\":true,\"toolbar\":[\"search\",\"filters\",\"views\",\"export\"],\"create\":true,\"print\":true", json);
        foreach (var id in new[] { "title", "start", "end", "resource", "recurrence" }) Assert.True(scheduler.Grid.GetColumn(id).Editable, id);
        Assert.False(scheduler.Grid.GetColumn("description").Editable);
        // Read-only again: the columns follow.
        scheduler.ApplyPreset(CanopyCalendarPreset.Basic);
        scheduler.Grid.Validate();
        Assert.False(scheduler.Grid.GetColumn("start").Editable);
        // Drops alone also need editable columns.
        scheduler.Drop = true;
        scheduler.Grid.Validate();
        Assert.True(scheduler.Grid.GetColumn("title").Editable);

        var standard = new CanopyCalendar(events, CanopyCalendarPreset.Standard);
        Assert.Contains("\"views\":[\"month\",\"week\",\"day\",\"days\",\"agenda\",\"year\"],\"toolbar\":[\"search\",\"filters\",\"export\"],\"details\":\"popover\",\"print\":true", standard.Grid!.ToJson());
        Assert.False(standard.Grid.GetColumn("start").Editable);
    }

    [Fact]
    public void From_BuildsOneEventPerItem() {
        var meetings = new[] {
            new Meeting { Key = "m-1", Subject = "Planning", Begins = new DateTime(2026, 10, 19, 10, 0, 0, DateTimeKind.Utc), Ends = new DateTime(2026, 10, 19, 11, 0, 0, DateTimeKind.Utc), Room = "a" },
            new Meeting { Key = "m-2", Subject = "Offsite", Begins = new DateTime(2026, 10, 21), WholeDay = true }
        };
        var calendar = CanopyCalendar.From(meetings, x => x.Subject, x => x.Begins, x => x.Ends, id: x => x.Key, allDay: x => x.WholeDay,
            configure: (item, created) => created.Resource = item.Room);
        var grid = calendar.Grid!;
        Assert.Equal(new[] { "m-1", "m-2" }, grid.Rows.Select(row => row.Id));
        Assert.Equal("Planning", grid.Rows[0].Cells["title"].Value);
        Assert.Equal(new DateTime(2026, 10, 19, 11, 0, 0, DateTimeKind.Utc), grid.Rows[0].Cells["end"].Value);
        Assert.Equal(true, grid.Rows[1].Cells["allDay"].Value);
        Assert.Equal(new DateTime(2026, 10, 22, 0, 0, 0, DateTimeKind.Utc), grid.Rows[1].Cells["end"].Value);
        Assert.Equal("a", grid.Rows[0].Cells["resource"].Value);

        var offsets = CanopyCalendar.From(new[] { new Meeting { Subject = "Call", At = new DateTimeOffset(2026, 10, 19, 8, 0, 0, TimeSpan.FromHours(-4)) } },
            x => x.Subject, x => x.At, x => x.At.AddMinutes(30), preset: CanopyCalendarPreset.Standard);
        Assert.Equal("e1", offsets.Grid!.Rows[0].Id);
        Assert.Equal(new DateTime(2026, 10, 19, 12, 0, 0, DateTimeKind.Utc), offsets.Grid.Rows[0].Cells["start"].Value);
        Assert.Equal(new DateTime(2026, 10, 19, 12, 30, 0, DateTimeKind.Utc), offsets.Grid.Rows[0].Cells["end"].Value);
        Assert.True(offsets.Print);
        Assert.Throws<ArgumentNullException>(() => CanopyCalendar.From<Meeting>(null!, x => x.Subject, x => x.Begins));
        Assert.Throws<ArgumentNullException>(() => CanopyCalendar.From(meetings, null!, x => x.Begins));
        Assert.Throws<ArgumentNullException>(() => CanopyCalendar.From(meetings, x => x.Subject, (Func<Meeting, DateTime>)null!));
    }

    [Fact]
    public void Html_WritesACalendarOfEvents_AndRefusesADefinitionWithoutEvents() {
        var calendar = new CanopyCalendar(new[] { new CanopyCalendarEvent("<b>Launch</b>", new DateTime(2026, 10, 19, 9, 0, 0, DateTimeKind.Utc)) });
        var page = calendar.ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Title = "Launches" });
        Assert.Contains("<title>Launches</title>", page);
        Assert.Contains("\"calendar\":{\"start\":\"start\"", page);
        Assert.DoesNotContain("<b>Launch</b>", page);
        Assert.StartsWith("<!DOCTYPE html>", page);
        Assert.Contains("<html lang=\"en\">", page);
        var fragment = calendar.ToHtmlFragment(new CanopyHtmlOptions { Height = "600px" });
        Assert.Contains("data-canopyx-host", fragment);
        Assert.Equal(calendar.Grid!.ToHtmlFragment(new CanopyHtmlOptions { Height = "600px" }), fragment);
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-calendar-" + Guid.NewGuid().ToString("N"));
        try {
            var path = Path.Combine(directory, "nested", "calendar.html");
            calendar.SaveHtmlPage(path, new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External });
            Assert.Contains("\"calendar\":{", File.ReadAllText(path));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }

        var definition = new CanopyCalendar("starts");
        Assert.Null(definition.Grid);
        Assert.Throws<InvalidOperationException>(() => definition.ToHtmlPage());
        Assert.Throws<InvalidOperationException>(() => definition.ToHtmlFragment());
        Assert.Throws<InvalidOperationException>(() => definition.SaveHtmlPage(Path.Combine(directory, "x.html")));
        Assert.Throws<ArgumentNullException>(() => ((CanopyCalendar)null!).ToHtmlPage());
    }

    [Fact]
    public void Direction_WritesDirOnThePageAndOnFragmentHosts() {
        var grid = new CanopyCalendar(new[] { new CanopyCalendarEvent("Event", new DateTime(2026, 10, 19, 9, 0, 0, DateTimeKind.Utc)) }).Grid!;
        var page = grid.ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Language = "ar", Direction = CanopyTextDirection.Rtl });
        Assert.Contains("<html lang=\"ar\" dir=\"rtl\">", page);
        Assert.DoesNotContain("{{dir}}", page);
        Assert.Contains("<div class=\"cx-host\" data-canopyx-host dir=\"ltr\"", grid.ToHtmlFragment(new CanopyHtmlOptions { Direction = CanopyTextDirection.Ltr }));
        Assert.DoesNotContain(" dir=", grid.ToHtmlFragment());
        Assert.DoesNotContain(" dir=", grid.ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External }).Substring(0, 200));
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Contains("dir=\"rtl\">", tree.ToHtmlPage(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Direction = CanopyTextDirection.Rtl }));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyHtmlOptions { Direction = (CanopyTextDirection)3 });
    }
}
