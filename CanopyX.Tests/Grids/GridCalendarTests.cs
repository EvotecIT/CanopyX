using System.Text.Json.Nodes;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>The calendar of a flat grid: its settings, the JSON they write, the schema, and the checks the browser makes too.</summary>
public sealed class GridCalendarTests {
    [Fact]
    public void Calendar_WritesOnlyTheStartByDefault_BetweenTheFacetPanelAndReporting() {
        var view = Grid();
        Assert.Null(JsonNode.Parse(view.ToJson())!["calendar"]);
        view.Calendar = new CanopyCalendar("starts");
        Assert.Equal("{\"start\":\"starts\"}", Calendar(view));
        view.FacetPanel = new CanopyFacetPanel().Add("host");
        view.Reporting = new CanopyGridReporting();
        var keys = JsonNode.Parse(view.ToJson())!.AsObject().Select(item => item.Key).ToList();
        Assert.Equal(keys.IndexOf("facets") + 1, keys.IndexOf("calendar"));
        Assert.Equal(keys.IndexOf("calendar") + 1, keys.IndexOf("reporting"));
        ProtocolSchema.AssertValid(view.ToJson(), "a grid with a default calendar");
    }

    [Fact]
    public void Calendar_SettingsEqualToTheirDefaultsAreNotWritten() {
        var view = Grid();
        var calendar = new CanopyCalendar("starts") {
            View = CanopyCalendarView.Month, Days = 3, SlotMinutes = 30, MinTime = TimeSpan.Zero, MaxTime = TimeSpan.FromHours(24), ScrollTime = TimeSpan.FromHours(8),
            NowIndicator = true, EventStyle = CanopyCalendarEventStyle.Quiet, Zoom = CanopyCalendarZoom.Day, PhoneView = CanopyCalendarView.Agenda
        };
        foreach (var item in new[] { CanopyCalendarView.Month, CanopyCalendarView.Week, CanopyCalendarView.Day, CanopyCalendarView.Agenda }) calendar.Views.Add(item);
        foreach (var item in new[] { CanopyCalendarZoom.Hour, CanopyCalendarZoom.Day, CanopyCalendarZoom.Week, CanopyCalendarZoom.Month, CanopyCalendarZoom.Quarter }) calendar.Zooms.Add(item);
        view.Calendar = calendar;
        Assert.Equal("{\"start\":\"starts\"}", Calendar(view));
        // An editing object at its defaults allows everything.
        calendar.Editing = new CanopyCalendarEditing();
        Assert.Equal("{\"start\":\"starts\",\"editable\":true}", Calendar(view));
        // The first view is the first of the views, so naming it writes nothing; another one is written.
        calendar.Views.Clear();
        calendar.Views.Add(CanopyCalendarView.Agenda);
        calendar.Views.Add(CanopyCalendarView.Week);
        calendar.View = CanopyCalendarView.Agenda;
        calendar.PhoneView = null;
        Assert.Equal("{\"start\":\"starts\",\"views\":[\"agenda\",\"week\"],\"editable\":true}", Calendar(view));
        calendar.View = CanopyCalendarView.Week;
        Assert.Contains("\"view\":\"week\"", Calendar(view));
        ProtocolSchema.AssertValid(view.ToJson(), "a grid with calendar defaults");
    }

    [Fact]
    public void Calendar_WritesEverySetting() {
        var view = Grid();
        var tree = Resources();
        var calendar = new CanopyCalendar("starts") {
            End = "ends", Title = "name", Subtitle = "host", AllDay = "allDay", Resource = "host", Status = "status", Recurrence = "rule", Exceptions = "skip",
            Series = "series", RecurrenceId = "originalStart", Display = "display", SeriesEnd = "seriesEnd",
            View = CanopyCalendarView.Week, Date = new DateTime(2026, 10, 16, 15, 30, 0), Days = 5, FirstDay = DayOfWeek.Monday, SlotMinutes = 15,
            MinTime = TimeSpan.FromHours(6), MaxTime = TimeSpan.FromHours(22), ScrollTime = new TimeSpan(7, 30, 0),
            WorkingHours = new CanopyCalendarHours(TimeSpan.FromHours(8), new TimeSpan(17, 30, 0)), NowIndicator = false, EventLimit = 4,
            EventStyle = CanopyCalendarEventStyle.Strong, TimeZone = "Europe/Warsaw",
            Editing = new CanopyCalendarEditing { Resize = false, Overlap = false, WorkingHoursOnly = true, AllowedResources = "allowed", SnapMinutes = 15, Commit = CanopyCalendarCommit.Manual },
            Resources = new CanopyCalendarResources(tree) { Width = 320, Label = "Hosts" }, Zoom = CanopyCalendarZoom.Week,
            Capacity = new CanopyCalendarCapacity { Label = "Concurrent changes" }.Add(3, CanopyTone.Warning).Add(5, CanopyTone.Danger),
            Limit = 5000, PhoneView = CanopyCalendarView.Day
        };
        foreach (var item in new[] { CanopyCalendarView.Month, CanopyCalendarView.Week, CanopyCalendarView.Day, CanopyCalendarView.Days, CanopyCalendarView.Agenda, CanopyCalendarView.Year, CanopyCalendarView.Timeline }) calendar.Views.Add(item);
        calendar.HiddenDays.Add(DayOfWeek.Saturday);
        calendar.HiddenDays.Add(DayOfWeek.Sunday);
        calendar.WorkingHours!.Days.Remove(DayOfWeek.Friday);
        calendar.Resources!.Aggregates["load"] = CanopyCalendarAggregate.Busy;
        foreach (var item in new[] { CanopyCalendarZoom.Day, CanopyCalendarZoom.Week, CanopyCalendarZoom.Month }) calendar.Zooms.Add(item);
        calendar.Ranges.Add(new CanopyCalendarRange(new DateTime(2026, 12, 24), new DateTime(2026, 12, 27), "Holidays") { Tone = CanopyTone.Info });
        calendar.Ranges.Add(new CanopyCalendarRange(new DateTime(2026, 10, 17, 22, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 18, 2, 0, 0, DateTimeKind.Utc), "Maintenance") {
            Resource = "host-1", Kind = CanopyCalendarRangeKind.Unavailable, Recurrence = CanopyRecurrence.Weekly(DayOfWeek.Saturday)
        });
        var hours = new CanopyCalendarAvailability(TimeSpan.FromHours(7), TimeSpan.FromHours(19)) { Resource = "host-1" };
        hours.Days.Add(DayOfWeek.Saturday);
        calendar.Availability.Add(hours);
        calendar.Availability.Add(new CanopyCalendarAvailability(TimeSpan.FromHours(9), TimeSpan.FromHours(17)));
        view.Calendar = calendar;

        var expected = "{\"start\":\"starts\",\"end\":\"ends\",\"title\":\"name\",\"subtitle\":\"host\",\"allDay\":\"allDay\",\"resource\":\"host\",\"status\":\"status\"," +
            "\"recurrence\":\"rule\",\"exceptions\":\"skip\",\"series\":\"series\",\"recurrenceId\":\"originalStart\",\"display\":\"display\",\"seriesEnd\":\"seriesEnd\"," +
            "\"view\":\"week\",\"views\":[\"month\",\"week\",\"day\",\"days\",\"agenda\",\"year\",\"timeline\"],\"date\":\"2026-10-16\",\"days\":5,\"firstDay\":1,\"hiddenDays\":[6,0]," +
            "\"slotMinutes\":15,\"minTime\":\"06:00\",\"maxTime\":\"22:00\",\"scrollTime\":\"07:30\",\"workingHours\":{\"days\":[1,2,3,4],\"start\":\"08:00\",\"end\":\"17:30\"}," +
            "\"nowIndicator\":false,\"eventLimit\":4,\"eventStyle\":\"strong\",\"timeZone\":\"Europe/Warsaw\"," +
            "\"editable\":{\"resize\":false,\"overlap\":false,\"workingHours\":true,\"allowedResources\":\"allowed\",\"snapMinutes\":15,\"commit\":\"manual\"}," +
            "\"resources\":{\"view\":" + tree.ToJson() + ",\"width\":320,\"label\":\"Hosts\",\"aggregates\":{\"load\":\"busy\"}}," +
            "\"zoom\":\"week\",\"zooms\":[\"day\",\"week\",\"month\"],\"capacity\":{\"thresholds\":[{\"at\":3,\"tone\":\"warning\"},{\"at\":5,\"tone\":\"danger\"}],\"label\":\"Concurrent changes\"}," +
            "\"ranges\":[{\"start\":\"2026-12-24T00:00:00Z\",\"end\":\"2026-12-27T00:00:00Z\",\"label\":\"Holidays\",\"tone\":\"info\"}," +
            "{\"start\":\"2026-10-17T22:00:00Z\",\"end\":\"2026-10-18T02:00:00Z\",\"label\":\"Maintenance\",\"resource\":\"host-1\",\"kind\":\"unavailable\",\"recurrence\":\"FREQ=WEEKLY;BYDAY=SA\"}]," +
            "\"availability\":[{\"resource\":\"host-1\",\"days\":[1,2,3,4,5,6],\"start\":\"07:00\",\"end\":\"19:00\"},{\"start\":\"09:00\",\"end\":\"17:00\"}],\"limit\":5000,\"phone\":\"day\"}";
        Assert.Equal(JsonNode.Parse(expected)!.ToJsonString(), Calendar(view));
        ProtocolSchema.AssertValid(view.ToJson(), "a grid with every calendar setting");
        Assert.Equal(new DateTime(2026, 10, 16), calendar.Date);
    }

    [Fact]
    public void Resources_WriteTheTreeAsAViewDocument_InlineOrRemote() {
        var view = Grid();
        var tree = Resources();
        view.Calendar = new CanopyCalendar("starts") { Resource = "host", Resources = new CanopyCalendarResources(tree) };
        var resources = JsonNode.Parse(view.ToJson())!["calendar"]!["resources"]!;
        Assert.Equal("view", resources["view"]!["type"]!.GetValue<string>());
        Assert.Equal("host-1", resources["view"]!["roots"]![0]!["children"]![0]!["id"]!.GetValue<string>());
        ProtocolSchema.AssertValid(view.ToJson(), "a calendar with inline resources");

        tree.Source = CanopySource.Remote("resources?ref={ref}&cursor={cursor}");
        resources = JsonNode.Parse(view.ToJson())!["calendar"]!["resources"]!;
        Assert.Equal("remote", resources["view"]!["source"]!["kind"]!.GetValue<string>());
        Assert.Null(resources["view"]!["roots"]);
        ProtocolSchema.AssertValid(view.ToJson(), "a calendar with remote resources");

        // With resources the default views include the timeline.
        view.Calendar.View = CanopyCalendarView.Timeline;
        Assert.Contains("\"view\":\"timeline\"", view.ToJson());
        tree.Source = CanopySource.Sidecar("data/");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void Calendar_RefusesWhatTheBrowserRefuses() {
        void Refused(Action<CanopyDataGridView, CanopyCalendar> change) {
            var view = Grid();
            var calendar = new CanopyCalendar("starts");
            view.Calendar = calendar;
            change(view, calendar);
            Assert.Throws<InvalidOperationException>(() => view.Validate());
            Assert.Throws<InvalidOperationException>(() => view.ToJson());
        }

        Refused((_, calendar) => calendar.Start = "missing");
        Refused((_, calendar) => calendar.Start = "name");
        Refused((_, calendar) => calendar.End = "host");
        Refused((_, calendar) => calendar.Title = "missing");
        Refused((_, calendar) => calendar.AllDay = "starts");
        Refused((_, calendar) => calendar.Resource = "load");
        Refused((_, calendar) => calendar.Recurrence = "starts");
        Refused((_, calendar) => calendar.Exceptions = "load");
        Refused((_, calendar) => calendar.Display = "starts");
        Refused((_, calendar) => calendar.SeriesEnd = "rule");
        Refused((_, calendar) => calendar.RecurrenceId = "series");
        Refused((_, calendar) => calendar.Series = "series");
        Refused((_, calendar) => calendar.RecurrenceId = "originalStart");
        Refused((_, calendar) => { calendar.Views.Add(CanopyCalendarView.Week); calendar.Views.Add(CanopyCalendarView.Week); });
        Refused((_, calendar) => calendar.Views.Add(CanopyCalendarView.Timeline));
        Refused((_, calendar) => calendar.View = CanopyCalendarView.Timeline);
        Refused((_, calendar) => calendar.View = CanopyCalendarView.Year);
        Refused((_, calendar) => { calendar.Views.Add(CanopyCalendarView.Month); calendar.PhoneView = CanopyCalendarView.Agenda; });
        Refused((_, calendar) => { calendar.HiddenDays.Add(DayOfWeek.Monday); calendar.HiddenDays.Add(DayOfWeek.Monday); });
        Refused((_, calendar) => { foreach (DayOfWeek day in Enum.GetValues(typeof(DayOfWeek))) calendar.HiddenDays.Add(day); });
        Refused((_, calendar) => { calendar.SlotMinutes = 60; calendar.MinTime = new TimeSpan(6, 30, 0); });
        Refused((_, calendar) => { calendar.SlotMinutes = 20; calendar.MaxTime = new TimeSpan(22, 10, 0); });
        Refused((_, calendar) => { calendar.MinTime = TimeSpan.FromHours(10); calendar.MaxTime = TimeSpan.FromHours(9); });
        Refused((_, calendar) => calendar.WorkingHours = new CanopyCalendarHours(TimeSpan.FromHours(17), TimeSpan.FromHours(9)));
        Refused((_, calendar) => { calendar.WorkingHours = new CanopyCalendarHours(TimeSpan.FromHours(8), TimeSpan.FromHours(16)); calendar.WorkingHours.Days.Clear(); });
        Refused((_, calendar) => calendar.Editing = new CanopyCalendarEditing { AllowedResources = "missing" });
        Refused((_, calendar) => calendar.Editing = new CanopyCalendarEditing { AllowedResources = "load" });
        Refused((_, calendar) => { calendar.Zooms.Add(CanopyCalendarZoom.Hour); calendar.Zooms.Add(CanopyCalendarZoom.Hour); });
        Refused((_, calendar) => calendar.Zooms.Add(CanopyCalendarZoom.Month));
        Refused((_, calendar) => calendar.Capacity = new CanopyCalendarCapacity());
        Refused((_, calendar) => calendar.Capacity = new CanopyCalendarCapacity().Add(3, CanopyTone.Warning).Add(3, CanopyTone.Danger));
        Refused((_, calendar) => { calendar.Capacity = new CanopyCalendarCapacity(); for (var at = 1; at <= 9; at++) calendar.Capacity.Add(at, CanopyTone.Warning); });
        Refused((_, calendar) => calendar.Ranges.Add(new CanopyCalendarRange(new DateTime(2026, 1, 2), new DateTime(2026, 1, 1), "Backwards")));
        Refused((_, calendar) => calendar.Ranges.Add(null!));
        Refused((_, calendar) => { for (var index = 0; index <= 1000; index++) calendar.Ranges.Add(new CanopyCalendarRange(new DateTime(2026, 1, 1), new DateTime(2026, 1, 2), "Range")); });
        Refused((_, calendar) => calendar.Availability.Add(new CanopyCalendarAvailability(TimeSpan.FromHours(9), TimeSpan.FromHours(9))));
        Refused((_, calendar) => {
            var tree = Resources();
            calendar.Resources = new CanopyCalendarResources(tree);
            calendar.Resources.Aggregates["missing"] = CanopyCalendarAggregate.Count;
        });
        Refused((_, calendar) => calendar.Resources = new CanopyCalendarResources(new CanopyTreeView("empty", "Empty")));
        // A typed builder's calendar has no start until one is set.
        var typed = new CanopyDataGridView<string>("typed", "Typed", item => item);
        typed.Column(item => item.Length);
        typed.Calendar();
        Assert.Throws<InvalidOperationException>(() => typed.ToJson());
    }

    [Fact]
    public void Calendar_RefusesValuesOutsideTheirBoundsWhenSet() {
        var calendar = new CanopyCalendar("starts");
        Assert.Throws<ArgumentException>(() => new CanopyCalendar(""));
        Assert.Throws<ArgumentException>(() => calendar.Start = "");
        Assert.Throws<ArgumentException>(() => calendar.End = "");
        Assert.Throws<ArgumentException>(() => calendar.Title = "\uD800");
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.Days = 1);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.Days = 15);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.SlotMinutes = 25);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.MinTime = TimeSpan.FromHours(24));
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.MinTime = TimeSpan.FromSeconds(30));
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.MaxTime = TimeSpan.FromHours(25));
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.ScrollTime = TimeSpan.FromHours(-1));
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.EventLimit = 0);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.EventLimit = 21);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.Limit = 0);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.Limit = 100001);
        foreach (var zone in new[] { "", "+0100", "Europe//Warsaw", "/Europe", "Europe/", "Europe/Warsaw Time", "Ł/x" }) Assert.Throws<ArgumentException>(() => calendar.TimeZone = zone);
        foreach (var zone in new[] { "utc", "local", "UTC", "Europe/Warsaw", "America/Argentina/Buenos_Aires", "Etc/GMT+5" }) calendar.TimeZone = zone;
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCalendarEditing { SnapMinutes = 7 });
        Assert.Throws<ArgumentException>(() => new CanopyCalendarEditing { AllowedResources = "" });
        Assert.Throws<ArgumentNullException>(() => new CanopyCalendarResources(null!));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCalendarResources(Resources()) { Width = 119 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCalendarResources(Resources()) { Width = 801 });
        Assert.Throws<ArgumentException>(() => new CanopyCalendarResources(Resources()) { Label = " " });
        Assert.Throws<ArgumentException>(() => new CanopyCalendarCapacity { Label = new string('x', 257) });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCalendarThreshold(0, CanopyTone.Warning));
        Assert.Throws<ArgumentException>(() => new CanopyCalendarThreshold(1, CanopyTone.None));
        Assert.Throws<ArgumentException>(() => new CanopyCalendarRange(DateTime.UtcNow, DateTime.UtcNow.AddHours(1), " "));
        Assert.Throws<ArgumentException>(() => new CanopyCalendarRange(DateTime.UtcNow, DateTime.UtcNow.AddHours(1), null!));
        Assert.Throws<ArgumentException>(() => new CanopyCalendarRange(DateTime.UtcNow, DateTime.UtcNow.AddHours(1), "Range") { Resource = "" });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCalendarHours(TimeSpan.FromHours(24), TimeSpan.FromHours(24)));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCalendarAvailability(TimeSpan.Zero, new TimeSpan(24, 0, 1)));
        // A local range time is converted to UTC.
        var local = new DateTime(2026, 6, 1, 12, 0, 0, DateTimeKind.Local);
        Assert.Equal(local.ToUniversalTime(), new CanopyCalendarRange(local, local.AddHours(1), "Local").Start);
        Assert.Equal(DateTimeKind.Utc, new CanopyCalendarRange(new DateTime(2026, 6, 1), new DateTime(2026, 6, 2), "Unspecified").End.Kind);
    }

    [Fact]
    public void Schema_RefusesCalendarsOutsideTheContract() {
        var view = Grid();
        view.Calendar = new CanopyCalendar("starts") { Series = "series", RecurrenceId = "originalStart" };
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "a calendar with overrides");
        string Mutated(Action<JsonObject> change) => ProtocolSchema.Mutate(json, root => change(root["calendar"]!.AsObject()));
        Assert.False(ProtocolSchema.Evaluate(Mutated(calendar => calendar.Remove("recurrenceId"))).IsValid);
        Assert.False(ProtocolSchema.Evaluate(Mutated(calendar => calendar.Remove("start"))).IsValid);
        Assert.False(ProtocolSchema.Evaluate(Mutated(calendar => calendar["colour"] = "red")).IsValid);
        Assert.False(ProtocolSchema.Evaluate(Mutated(calendar => calendar["view"] = "fortnight")).IsValid);
        Assert.False(ProtocolSchema.Evaluate(Mutated(calendar => calendar["days"] = 15)).IsValid);
        Assert.False(ProtocolSchema.Evaluate(Mutated(calendar => calendar["slotMinutes"] = 25)).IsValid);
        Assert.False(ProtocolSchema.Evaluate(Mutated(calendar => calendar["minTime"] = "24:00")).IsValid);
        Assert.False(ProtocolSchema.Evaluate(Mutated(calendar => calendar["views"] = new JsonArray("week", "week"))).IsValid);
        Assert.False(ProtocolSchema.Evaluate(Mutated(calendar => calendar["editable"] = false)).IsValid);
        Assert.False(ProtocolSchema.Evaluate(Mutated(calendar => calendar["eventLimit"] = "many")).IsValid);
        Assert.True(ProtocolSchema.Evaluate(Mutated(calendar => calendar["eventLimit"] = "auto")).IsValid);
        Assert.True(ProtocolSchema.Evaluate(Mutated(calendar => calendar["maxTime"] = "24:00")).IsValid);
    }

    [Fact]
    public void LabelPacks_TranslateTheCalendarTexts() {
        var english = new CanopyLabels();
        foreach (var labels in new[] { CanopyLabels.Polish(), CanopyLabels.German(), CanopyLabels.Spanish(), CanopyLabels.French(), CanopyLabels.Italian() }) {
            Assert.NotEqual(english.CalendarToday, labels.CalendarToday);
            Assert.NotEqual(english.CalendarMonth, labels.CalendarMonth);
            Assert.NotEqual(english.CalendarNoEvents, labels.CalendarNoEvents);
            Assert.NotEqual(english.CalendarMoveHelp, labels.CalendarMoveHelp);
            Assert.Contains("{count}", labels.CalendarDays);
            foreach (var placeholder in new[] { "{count}", "{date}" }) Assert.Contains(placeholder, labels.CalendarMoreLabel);
            foreach (var placeholder in new[] { "{start}", "{end}" }) Assert.Contains(placeholder, labels.CalendarTimeRange);
            foreach (var placeholder in new[] { "{title}", "{error}" }) Assert.Contains(placeholder, labels.CalendarSaveFailed);
            Assert.StartsWith("[", labels.CalendarEvents);
            Assert.Contains("[other]", labels.CalendarEvents);
        }
        Assert.Contains("[few]", CanopyLabels.Polish().CalendarEvents);
        var view = Grid();
        view.Calendar = new CanopyCalendar("starts");
        view.Labels = CanopyLabels.German();
        var labelsJson = JsonNode.Parse(view.ToJson())!["labels"]!;
        Assert.Equal(CanopyLabels.German().CalendarToday, labelsJson["calendarToday"]!.GetValue<string>());
        // A tree view never carries the calendar's texts.
        var tree = Resources();
        tree.Labels = CanopyLabels.German();
        Assert.Null(JsonNode.Parse(tree.ToJson())!["labels"]!["calendarToday"]);
    }

    private static string Calendar(CanopyDataGridView view) => JsonNode.Parse(view.ToJson())!["calendar"]!.ToJsonString();

    private static CanopyDataGridView Grid() {
        var grid = new CanopyDataGridView("changes", "Changes");
        grid.Columns.Add(new CanopyColumn("name", "Name") { RowHeader = true });
        grid.Columns.Add(new CanopyColumn("starts", "Starts") { Kind = CanopyColumnKind.DateTime });
        grid.Columns.Add(new CanopyColumn("ends", "Ends") { Kind = CanopyColumnKind.DateTime });
        grid.Columns.Add(new CanopyColumn("host", "Host"));
        grid.Columns.Add(new CanopyColumn("load", "Load") { Kind = CanopyColumnKind.Number });
        grid.Columns.Add(new CanopyColumn("status", "Status"));
        grid.Columns.Add(new CanopyColumn("allDay", "All day"));
        grid.Columns.Add(new CanopyColumn("rule", "Rule") { Hidden = true });
        grid.Columns.Add(new CanopyColumn("skip", "Skipped") { Hidden = true });
        grid.Columns.Add(new CanopyColumn("series", "Series") { Hidden = true });
        grid.Columns.Add(new CanopyColumn("originalStart", "Original start") { Kind = CanopyColumnKind.DateTime, Hidden = true });
        grid.Columns.Add(new CanopyColumn("display", "Display") { Hidden = true });
        grid.Columns.Add(new CanopyColumn("seriesEnd", "Series end") { Kind = CanopyColumnKind.DateTime, Hidden = true });
        grid.Columns.Add(new CanopyColumn("allowed", "Allowed hosts") { Hidden = true });
        var row = new CanopyGridRow("c-1");
        row.Cells["name"] = "Patch";
        row.Cells["starts"] = new DateTime(2026, 10, 16, 8, 0, 0, DateTimeKind.Utc);
        row.Cells["host"] = "host-1";
        grid.Rows.Add(row);
        return grid;
    }

    private static CanopyTreeView Resources() {
        var tree = new CanopyTreeView("hosts", "Hosts");
        tree.Columns.Add(new CanopyColumn("name", "Host"));
        tree.Columns.Add(new CanopyColumn("load", "Busy"));
        var site = new CanopyNode("site-a", "Site A");
        site.Children.Add(new CanopyNode("host-1", "Host 1"));
        tree.Roots.Add(site);
        return tree;
    }
}
