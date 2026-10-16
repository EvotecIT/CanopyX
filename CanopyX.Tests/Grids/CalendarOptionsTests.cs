using System.Text.Json.Nodes;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>The calendar's chrome, details, sources, creation and view settings, the new views, presets and their schema.</summary>
public sealed class CalendarOptionsTests {
    [Fact]
    public void Options_EqualToTheirDefaultsAreNotWritten() {
        var view = Grid();
        var calendar = new CanopyCalendar("starts") {
            Toolbar = true, Details = CanopyCalendarDetails.Drawer, Drop = false, WeekNumbers = CanopyCalendarWeekNumbers.None, NavLinks = true,
            FixedWeeks = false, OutsideDays = true, Menu = true, Hover = true, YearEvents = false, AgendaSpan = CanopyCalendarAgendaSpan.Month, Months = 6,
            Print = false, Occurrence = CanopyCalendarOccurrence.All
        };
        view.Calendar = calendar;
        Assert.Equal("{\"start\":\"starts\"}", Calendar(view));
        // With override records the default is to ask, so asking writes nothing and every occurrence is written.
        calendar.Series = "series";
        calendar.RecurrenceId = "originalStart";
        Assert.Contains("\"occurrence\":\"all\"", Calendar(view));
        calendar.Occurrence = CanopyCalendarOccurrence.Ask;
        Assert.DoesNotContain("occurrence", Calendar(view));
        // A creation object at its defaults writes true.
        view.GetColumn("starts").Editable = true;
        view.GetColumn("name").Editable = true;
        calendar.Create = new CanopyCalendarCreate { Minutes = 60, AllDay = true };
        Assert.Contains("\"create\":true", Calendar(view));
        ProtocolSchema.AssertValid(view.ToJson(), "a calendar with default options");
    }

    [Fact]
    public void Options_WriteEverySetting() {
        var view = Grid();
        view.GetColumn("starts").Editable = true;
        view.GetColumn("name").Editable = true;
        var calendar = new CanopyCalendar("starts") {
            Series = "series", RecurrenceId = "originalStart", Description = "notes", Tone = "tone", Source = "calendar",
            Toolbar = true, Details = CanopyCalendarDetails.Popover, Create = new CanopyCalendarCreate { Minutes = 30, AllDay = false }, Drop = true,
            Occurrence = CanopyCalendarOccurrence.Following, WeekNumbers = CanopyCalendarWeekNumbers.Iso, NavLinks = false,
            ValidStart = new DateTime(2026, 1, 1, 13, 0, 0), ValidEnd = new DateTime(2027, 1, 1), FixedWeeks = true, OutsideDays = false,
            Span = new CanopyCalendarSpan(2, CanopyCalendarSpanUnit.Week), Menu = false, Hover = false, YearEvents = true,
            AgendaSpan = CanopyCalendarAgendaSpan.Week, Months = 12, Print = true, View = CanopyCalendarView.WeekList, PhoneView = CanopyCalendarView.DayList
        };
        foreach (var item in new[] { CanopyCalendarView.Mini, CanopyCalendarView.WeekList, CanopyCalendarView.DayList, CanopyCalendarView.Months, CanopyCalendarView.Timeline }) calendar.Views.Add(item);
        calendar.ToolbarItems.Add(CanopyCalendarToolbarItem.Search);
        calendar.ToolbarItems.Add(CanopyCalendarToolbarItem.More);
        calendar.Sources.Add(new CanopyCalendarSource("work", "Work") { Tone = CanopyTone.Info });
        calendar.Sources.Add(new CanopyCalendarSource("holidays", "Holidays") { Ics = "feeds/holidays.ics", Hidden = true });
        calendar.Ranges.Add(new CanopyCalendarRange(new DateTime(2026, 10, 19, 8, 0, 0), new DateTime(2026, 10, 19, 16, 0, 0), "Open") { Inverse = true, Resource = "host-1" });
        view.Calendar = calendar;

        var expected = "{\"start\":\"starts\",\"series\":\"series\",\"recurrenceId\":\"originalStart\",\"description\":\"notes\",\"tone\":\"tone\",\"source\":\"calendar\"," +
            "\"view\":\"weekList\",\"views\":[\"mini\",\"weekList\",\"dayList\",\"months\",\"timeline\"]," +
            "\"ranges\":[{\"start\":\"2026-10-19T08:00:00Z\",\"end\":\"2026-10-19T16:00:00Z\",\"label\":\"Open\",\"resource\":\"host-1\",\"inverse\":true}],\"phone\":\"dayList\"," +
            "\"sources\":[{\"id\":\"work\",\"label\":\"Work\",\"tone\":\"info\"},{\"id\":\"holidays\",\"label\":\"Holidays\",\"ics\":\"feeds/holidays.ics\",\"hidden\":true}]," +
            "\"toolbar\":[\"search\",\"more\"],\"details\":\"popover\",\"create\":{\"minutes\":30,\"allDay\":false},\"drop\":true,\"occurrence\":\"following\"," +
            "\"weekNumbers\":\"iso\",\"navLinks\":false,\"validRange\":{\"start\":\"2026-01-01\",\"end\":\"2027-01-01\"},\"fixedWeeks\":true,\"outsideDays\":false," +
            "\"span\":{\"count\":2,\"unit\":\"week\"},\"menu\":false,\"hover\":false,\"yearEvents\":true,\"agendaSpan\":\"week\",\"months\":12,\"print\":true}";
        Assert.Equal(Normalized(expected), Normalized(Calendar(view)));
        ProtocolSchema.AssertValid(view.ToJson(), "a calendar with every option");

        calendar.Toolbar = false;
        calendar.ToolbarItems.Clear();
        calendar.WeekNumbers = CanopyCalendarWeekNumbers.Locale;
        calendar.ValidStart = null;
        Assert.Contains("\"toolbar\":false", Calendar(view));
        Assert.Contains("\"weekNumbers\":\"locale\"", Calendar(view));
        Assert.Contains("\"validRange\":{\"end\":\"2027-01-01\"}", Calendar(view));
        ProtocolSchema.AssertValid(view.ToJson(), "a calendar without a toolbar");
    }

    [Fact]
    public void Timeline_NoLongerNeedsResources() {
        var view = Grid();
        view.Calendar = new CanopyCalendar("starts") { View = CanopyCalendarView.Timeline };
        view.Calendar.Views.Add(CanopyCalendarView.Month);
        view.Calendar.Views.Add(CanopyCalendarView.Timeline);
        Assert.Contains("\"view\":\"timeline\"", Calendar(view));
        ProtocolSchema.AssertValid(view.ToJson(), "a timeline without resources");
    }

    [Fact]
    public void Options_RefuseWhatTheBrowserRefuses() {
        void Refused(Action<CanopyDataGridView, CanopyCalendar> change) {
            var view = Grid();
            var calendar = new CanopyCalendar("starts");
            view.Calendar = calendar;
            change(view, calendar);
            var error = Record.Exception(() => view.Validate());
            Assert.True(error is InvalidOperationException || error is ArgumentOutOfRangeException, "Expected a refusal, got " + (error?.GetType().Name ?? "none") + ".");
        }

        Refused((_, calendar) => calendar.Description = "missing");
        Refused((_, calendar) => calendar.Description = "load");
        Refused((_, calendar) => calendar.Tone = "starts");
        Refused((_, calendar) => calendar.Source = "load");
        Refused((_, calendar) => calendar.Sources.Add(new CanopyCalendarSource("work", "Work")));
        Refused((_, calendar) => { calendar.Source = "calendar"; calendar.Sources.Add(new CanopyCalendarSource("a", "A")); calendar.Sources.Add(new CanopyCalendarSource("a", "B")); });
        Refused((_, calendar) => { calendar.Source = "calendar"; calendar.Sources.Add(null!); });
        Refused((_, calendar) => { calendar.Source = "calendar"; for (var index = 0; index <= 50; index++) calendar.Sources.Add(new CanopyCalendarSource("s" + index, "Source")); });
        Refused((_, calendar) => { calendar.Toolbar = false; calendar.ToolbarItems.Add(CanopyCalendarToolbarItem.Search); });
        Refused((_, calendar) => { calendar.ToolbarItems.Add(CanopyCalendarToolbarItem.Search); calendar.ToolbarItems.Add(CanopyCalendarToolbarItem.Search); });
        Refused((_, calendar) => calendar.ToolbarItems.Add((CanopyCalendarToolbarItem)42));
        Refused((_, calendar) => calendar.Details = (CanopyCalendarDetails)7);
        Refused((_, calendar) => calendar.Create = new CanopyCalendarCreate());
        Refused((view, calendar) => { view.GetColumn("starts").Editable = true; calendar.Create = new CanopyCalendarCreate(); });
        Refused((view, calendar) => { view.GetColumn("name").Editable = true; calendar.Drop = true; });
        Refused((view, calendar) => { view.GetColumn("starts").Editable = true; view.GetColumn("name").Editable = true; calendar.Title = "host"; calendar.Drop = true; });
        Refused((_, calendar) => calendar.Occurrence = CanopyCalendarOccurrence.This);
        Refused((_, calendar) => calendar.Occurrence = CanopyCalendarOccurrence.Following);
        Refused((_, calendar) => calendar.Occurrence = (CanopyCalendarOccurrence)9);
        Refused((_, calendar) => calendar.WeekNumbers = (CanopyCalendarWeekNumbers)3);
        Refused((_, calendar) => calendar.AgendaSpan = (CanopyCalendarAgendaSpan)4);
        Refused((_, calendar) => { calendar.ValidStart = new DateTime(2026, 2, 1); calendar.ValidEnd = new DateTime(2026, 2, 1); });
        Refused((_, calendar) => calendar.Views.Add((CanopyCalendarView)99));

        // Creation with editable start and title columns (the row header) passes, as does an ics-only source list.
        var allowed = Grid();
        allowed.GetColumn("starts").Editable = true;
        allowed.GetColumn("name").Editable = true;
        allowed.Calendar = new CanopyCalendar("starts") { Create = new CanopyCalendarCreate(), Drop = true };
        allowed.Calendar.Sources.Add(new CanopyCalendarSource("feed", "Feed") { Ics = "https://example.test/feed.ics" });
        allowed.Validate();
        ProtocolSchema.AssertValid(allowed.ToJson(), "an ics-only source");
    }

    [Fact]
    public void Options_RefuseValuesOutsideTheirBoundsWhenSet() {
        var calendar = new CanopyCalendar("starts");
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.Months = 1);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.Months = 25);
        Assert.Throws<ArgumentException>(() => calendar.Description = "");
        Assert.Throws<ArgumentException>(() => calendar.Tone = "");
        Assert.Throws<ArgumentException>(() => calendar.Source = "");
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCalendarCreate { Minutes = 4 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCalendarCreate { Minutes = 1441 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCalendarSpan(0, CanopyCalendarSpanUnit.Day));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCalendarSpan(367, CanopyCalendarSpanUnit.Day));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCalendarSpan(1, (CanopyCalendarSpanUnit)3));
        Assert.Throws<ArgumentException>(() => new CanopyCalendarSource("", "Label"));
        Assert.Throws<ArgumentException>(() => new CanopyCalendarSource("id", " "));
        Assert.Throws<ArgumentException>(() => new CanopyCalendarSource("id", null!));
        Assert.Throws<ArgumentException>(() => new CanopyCalendarSource("id", new string('x', 257)));
        foreach (var url in new[] { "", "javascript:alert(1)", "data:text/calendar,x", "//other.test/a.ics", "file:///c:/a.ics", "feeds/a b.ics", "feeds\\a.ics", "a\u0001.ics", "http://", "HTTP://example.test/a.ics", new string('a', 2049) })
            Assert.Throws<ArgumentException>(() => new CanopyCalendarSource("id", "Label") { Ics = url });
        foreach (var url in new[] { "a.ics", "/feeds/a.ics", "../a.ics", "?feed=1", "feeds/a.ics?x=http:1", "https://example.test/a.ics", "http://example.test/a.ics" })
            Assert.Equal(url, new CanopyCalendarSource("id", "Label") { Ics = url }.Ics);
        // Valid range dates keep their date part only.
        calendar.ValidEnd = new DateTime(2026, 5, 4, 23, 59, 0);
        Assert.Equal(new DateTime(2026, 5, 4), calendar.ValidEnd);
    }

    [Fact]
    public void Schema_RefusesOptionsOutsideTheContract() {
        var view = Grid();
        view.Calendar = new CanopyCalendar("starts");
        var json = view.ToJson();
        string Mutated(Action<JsonObject> change) => ProtocolSchema.Mutate(json, root => change(root["calendar"]!.AsObject()));
        bool Valid(Action<JsonObject> change) => ProtocolSchema.Evaluate(Mutated(change)).IsValid;
        Assert.True(Valid(calendar => calendar["toolbar"] = new JsonArray("search", "views")));
        Assert.False(Valid(calendar => calendar["toolbar"] = new JsonArray("search", "search")));
        Assert.False(Valid(calendar => calendar["toolbar"] = new JsonArray("print")));
        Assert.False(Valid(calendar => calendar["toolbar"] = "search"));
        Assert.False(Valid(calendar => calendar["details"] = "modal"));
        Assert.False(Valid(calendar => calendar["create"] = false));
        Assert.False(Valid(calendar => calendar["create"] = new JsonObject { ["minutes"] = 4 }));
        Assert.False(Valid(calendar => calendar["create"] = new JsonObject { ["minutes"] = 1441 }));
        Assert.True(Valid(calendar => calendar["create"] = new JsonObject { ["minutes"] = 1440, ["allDay"] = false }));
        Assert.False(Valid(calendar => calendar["occurrence"] = "some"));
        Assert.False(Valid(calendar => calendar["weekNumbers"] = true));
        Assert.True(Valid(calendar => calendar["weekNumbers"] = false));
        Assert.False(Valid(calendar => calendar["validRange"] = new JsonObject { ["start"] = "2026-13-01" }));
        Assert.False(Valid(calendar => calendar["validRange"] = new JsonObject { ["from"] = "2026-01-01" }));
        Assert.False(Valid(calendar => calendar["span"] = new JsonObject { ["count"] = 367, ["unit"] = "day" }));
        Assert.False(Valid(calendar => calendar["span"] = new JsonObject { ["count"] = 2, ["unit"] = "year" }));
        Assert.False(Valid(calendar => calendar["span"] = new JsonObject { ["count"] = 2 }));
        Assert.False(Valid(calendar => calendar["agendaSpan"] = "quarter"));
        Assert.False(Valid(calendar => calendar["months"] = 1));
        Assert.False(Valid(calendar => calendar["months"] = 25));
        Assert.False(Valid(calendar => calendar["print"] = "yes"));
        Assert.False(Valid(calendar => calendar["sources"] = new JsonArray()));
        Assert.False(Valid(calendar => calendar["sources"] = new JsonArray(new JsonObject { ["id"] = "a" })));
        Assert.False(Valid(calendar => calendar["sources"] = new JsonArray(new JsonObject { ["id"] = "a", ["label"] = "A", ["ics"] = "javascript:alert(1)" })));
        Assert.False(Valid(calendar => calendar["sources"] = new JsonArray(new JsonObject { ["id"] = "a", ["label"] = "A", ["ics"] = "//other.test/a.ics" })));
        Assert.True(Valid(calendar => calendar["sources"] = new JsonArray(new JsonObject { ["id"] = "a", ["label"] = "A", ["ics"] = "feeds/a.ics", ["hidden"] = true })));
        // Every URL the C# side accepts, the schema accepts, and the reverse for the refused ones.
        foreach (var url in new[] { "a.ics", "/feeds/a.ics", "../a.ics", "?feed=1", "feeds/a.ics?x=http:1", "https://example.test/a.ics", "http://example.test/a.ics" }) {
            Assert.Equal(url, new CanopyCalendarSource("a", "A") { Ics = url }.Ics);
            Assert.True(Valid(calendar => calendar["sources"] = new JsonArray(new JsonObject { ["id"] = "a", ["label"] = "A", ["ics"] = url })), url);
        }
        foreach (var url in new[] { "HTTP://example.test/a.ics", "file:///c:/a.ics", "feeds/a b.ics", "feeds\\a.ics", "mailto:x" })
            Assert.False(Valid(calendar => calendar["sources"] = new JsonArray(new JsonObject { ["id"] = "a", ["label"] = "A", ["ics"] = url })), url);
        Assert.False(Valid(calendar => calendar["toolbar"] = new JsonArray()));
        Assert.False(Valid(calendar => calendar["validRange"] = new JsonObject()));
        Assert.False(Valid(calendar => calendar["view"] = "fortnight"));
        Assert.True(Valid(calendar => calendar["phone"] = "dayList"));
    }

    [Fact]
    public void Presets_SetTheirDefaults_AndLaterSettingsOverrideThem() {
        var view = Grid();
        view.GetColumn("starts").Editable = true;
        view.GetColumn("name").Editable = true;
        var calendar = new CanopyCalendar("starts").ApplyPreset(CanopyCalendarPreset.Basic);
        view.Calendar = calendar;
        Assert.Equal("{\"start\":\"starts\",\"toolbar\":false,\"details\":\"popover\"}", Calendar(view));
        calendar.ApplyPreset(CanopyCalendarPreset.Standard);
        Assert.Equal("{\"start\":\"starts\",\"views\":[\"month\",\"week\",\"day\",\"days\",\"agenda\",\"year\"],\"toolbar\":[\"search\",\"filters\",\"export\"],\"details\":\"popover\",\"print\":true}", Calendar(view));
        calendar.ApplyPreset(CanopyCalendarPreset.Scheduler);
        Assert.Equal("{\"start\":\"starts\",\"editable\":true,\"toolbar\":[\"search\",\"filters\",\"views\",\"export\"],\"create\":true,\"print\":true}", Calendar(view));
        Assert.Null(calendar.Capacity);
        calendar.Print = false;
        Assert.DoesNotContain("print", Calendar(view));
        ProtocolSchema.AssertValid(view.ToJson(), "a scheduler preset");

        // With resources the scheduler offers the timeline with a concurrency lane, and the basic preset keeps it out.
        var resources = new CanopyTreeView("hosts", "Hosts");
        resources.Columns.Add(new CanopyColumn("name", "Host"));
        resources.Roots.Add(new CanopyNode("host-1", "Host 1"));
        calendar.Resources = new CanopyCalendarResources(resources);
        calendar.ApplyPreset(CanopyCalendarPreset.Scheduler);
        var written = JsonNode.Parse(Calendar(view))!;
        Assert.Null(written["views"]);
        Assert.Equal(2, written["capacity"]!["thresholds"]!.AsArray().Count);
        Assert.Equal("danger", written["capacity"]!["thresholds"]![1]!["tone"]!.GetValue<string>());
        calendar.ApplyPreset(CanopyCalendarPreset.Basic);
        written = JsonNode.Parse(Calendar(view))!;
        Assert.Equal("[\"month\",\"week\",\"day\",\"agenda\"]", written["views"]!.ToJsonString());
        Assert.Null(written["editable"]);
        Assert.Null(written["create"]);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.ApplyPreset((CanopyCalendarPreset)5));
    }

    [Fact]
    public void LabelPacks_TranslateTheNewCalendarTexts() {
        var english = new CanopyLabels();
        foreach (var labels in new[] { CanopyLabels.Polish(), CanopyLabels.German(), CanopyLabels.Spanish(), CanopyLabels.French(), CanopyLabels.Italian() }) {
            Assert.NotEqual(english.CalendarWeekList, labels.CalendarWeekList);
            Assert.NotEqual(english.CalendarNewEvent, labels.CalendarNewEvent);
            Assert.NotEqual(english.CalendarThisAndFollowing, labels.CalendarThisAndFollowing);
            Assert.NotEqual(english.CalendarOutsideRange, labels.CalendarOutsideRange);
            Assert.Contains("{number}", labels.CalendarWeekNumber);
            Assert.Contains("{number}", labels.CalendarWeekShort);
            foreach (var placeholder in new[] { "{title}", "{time}" }) { Assert.Contains(placeholder, labels.CalendarCreated); Assert.Contains(placeholder, labels.CalendarReceived); }
            foreach (var placeholder in new[] { "{source}", "{error}" }) Assert.Contains(placeholder, labels.CalendarImportFailed);
            Assert.Contains("{title}", labels.CalendarActions);
            Assert.Contains("{title}", labels.CalendarDetailsOf);
        }
        Assert.Equal("Week {number}", english.CalendarWeekNumber);
        Assert.Equal("{title} scheduled on {time}", english.CalendarReceived);
        var view = Grid();
        view.Calendar = new CanopyCalendar("starts");
        view.Labels = CanopyLabels.Italian();
        var labelsJson = JsonNode.Parse(view.ToJson())!["labels"]!;
        Assert.Equal(CanopyLabels.Italian().CalendarSources, labelsJson["calendarSources"]!.GetValue<string>());
        ProtocolSchema.AssertValid(view.ToJson(), "a calendar with Italian labels");
    }

    [Fact]
    public void DragRows_IsWrittenOnlyWhenOn_WithItsTranslatedAnnouncement() {
        var view = Grid();
        Assert.Null(JsonNode.Parse(view.ToJson())!["dragRows"]);
        view.DragRows = true;
        Assert.True(JsonNode.Parse(view.ToJson())!["dragRows"]!.GetValue<bool>());
        ProtocolSchema.AssertValid(view.ToJson(), "a grid with draggable rows");
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(view.ToJson(), root => root["dragRows"] = "yes")).IsValid);
        var typed = new CanopyDataGridView<string>("typed", "Typed", item => item);
        typed.Column(item => item.Length);
        typed.View.DragRows = true;
        Assert.Contains("\"dragRows\":true", typed.ToJson());

        Assert.Equal("Picked up {title}. Move to a calendar and press Enter to drop it.", new CanopyLabels().GridRowPicked);
        foreach (var labels in new[] { CanopyLabels.Polish(), CanopyLabels.German(), CanopyLabels.Spanish(), CanopyLabels.French(), CanopyLabels.Italian() }) {
            Assert.Contains("{title}", labels.GridRowPicked);
            Assert.NotEqual(new CanopyLabels().GridRowPicked, labels.GridRowPicked);
        }
        view.Labels = CanopyLabels.Polish();
        Assert.Equal(CanopyLabels.Polish().GridRowPicked, JsonNode.Parse(view.ToJson())!["labels"]!["gridRowPicked"]!.GetValue<string>());
    }

    private static string Normalized(string json) => JsonNode.Parse(json)!.ToJsonString();

    private static string Calendar(CanopyDataGridView view) => JsonNode.Parse(view.ToJson())!["calendar"]!.ToJsonString();

    private static CanopyDataGridView Grid() {
        var grid = new CanopyDataGridView("changes", "Changes");
        grid.Columns.Add(new CanopyColumn("name", "Name") { RowHeader = true });
        grid.Columns.Add(new CanopyColumn("starts", "Starts") { Kind = CanopyColumnKind.DateTime });
        grid.Columns.Add(new CanopyColumn("host", "Host"));
        grid.Columns.Add(new CanopyColumn("load", "Load") { Kind = CanopyColumnKind.Number });
        grid.Columns.Add(new CanopyColumn("notes", "Notes"));
        grid.Columns.Add(new CanopyColumn("tone", "Tone") { Hidden = true });
        grid.Columns.Add(new CanopyColumn("calendar", "Calendar") { Hidden = true });
        grid.Columns.Add(new CanopyColumn("series", "Series") { Hidden = true });
        grid.Columns.Add(new CanopyColumn("originalStart", "Original start") { Kind = CanopyColumnKind.DateTime, Hidden = true });
        var row = new CanopyGridRow("c-1");
        row.Cells["name"] = "Patch";
        row.Cells["starts"] = new DateTime(2026, 10, 16, 8, 0, 0, DateTimeKind.Utc);
        grid.Rows.Add(row);
        return grid;
    }
}
