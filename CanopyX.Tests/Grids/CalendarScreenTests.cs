using System.Text.Json.Nodes;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>The shared-screen settings of a calendar (docs/calendar.md#shared-screens): what C# writes, what it and the schema refuse, and which part they bring.</summary>
public sealed class CalendarScreenTests {
    [Fact]
    public void SharedScreenSettings_AreWrittenValidAndBringTheirPart() {
        var events = new[] {
            new CanopyCalendarEvent("Swimming", new DateTime(2026, 10, 16, 16, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 16, 17, 0, 0, DateTimeKind.Utc)) { Source = "anna", Location = "Pool" },
            new CanopyCalendarEvent("Swimming", new DateTime(2026, 10, 16, 16, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 16, 17, 0, 0, DateTimeKind.Utc)) { Source = "tom", Location = "Pool" }
        };
        var calendar = new CanopyCalendar(events) {
            Merge = new CanopyCalendarMerge { Tone = CanopyTone.Info }, FadePast = 0.4, ListDays = 3, DayWidth = 140, ListBelow = 3, Reset = true
        };
        calendar.Sources.Add(new CanopyCalendarSource("anna", "Anna") { Color = "#2563eb", Initials = "AN", Avatar = "data:image/png;base64,iVBORw0KGgo=" });
        calendar.Sources.Add(new CanopyCalendarSource("tom", "Tom") { Icon = "⚽" });
        calendar.DayNotes.Add(new CanopyCalendarDayNote(new DateTime(2026, 10, 16, 15, 0, 0), " 18° sunny ") { Tone = CanopyTone.Warning });
        calendar.Faces.Add(new CanopyCalendarFace("kitchen") { Initials = "K" });

        var written = JsonNode.Parse(calendar.Grid!.ToJson())!["calendar"]!.AsObject();
        Assert.Equal("location", written["location"]!.GetValue<string>());
        Assert.Equal("{\"tone\":\"info\"}", written["merge"]!.ToJsonString());
        Assert.Equal(0.4, written["fadePast"]!.GetValue<double>());
        Assert.Equal("[{\"date\":\"2026-10-16\",\"text\":\"18° sunny\",\"tone\":\"warning\"}]", written["dayNotes"]!.ToJsonString(new System.Text.Json.JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
        Assert.Equal("[{\"resource\":\"kitchen\",\"initials\":\"K\"}]", written["faces"]!.ToJsonString());
        Assert.Equal(3, written["listDays"]!.GetValue<int>());
        Assert.Equal(140, written["dayWidth"]!.GetValue<int>());
        Assert.Equal(3, written["listBelow"]!.GetValue<int>());
        Assert.True(written["reset"]!.GetValue<bool>());
        var anna = written["sources"]![0]!.AsObject();
        Assert.Equal("AN", anna["initials"]!.GetValue<string>());
        Assert.StartsWith("data:image/png;base64,", anna["avatar"]!.GetValue<string>());
        Assert.Contains("\"location\":\"Pool\"", calendar.Grid.ToJson());
        ProtocolSchema.AssertValid(calendar.Grid.ToJson(), "a shared-screen calendar");
        Assert.Contains("calendar-screen", CanopyHtmlAssets.GetRequiredParts(calendar.Grid).Select(part => part.Name));

        // A plain merge writes true; a calendar without any of these settings neither writes them nor loads the part.
        calendar.Merge = new CanopyCalendarMerge();
        Assert.Equal("true", JsonNode.Parse(calendar.Grid.ToJson())!["calendar"]!["merge"]!.ToJsonString());
        var plain = new CanopyCalendar(new[] { new CanopyCalendarEvent("Planning", new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc)) });
        var json = JsonNode.Parse(plain.Grid!.ToJson())!["calendar"]!.AsObject();
        foreach (var key in new[] { "location", "merge", "fadePast", "dayNotes", "faces", "listDays", "dayWidth", "listBelow", "reset" }) Assert.False(json.ContainsKey(key), key);
        Assert.DoesNotContain("calendar-screen", CanopyHtmlAssets.GetRequiredParts(plain.Grid).Select(part => part.Name));
        // A source face alone brings the part.
        var withFace = new CanopyCalendar(new[] { new CanopyCalendarEvent("Planning", new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc)) { Source = "work" } });
        withFace.Sources.Add(new CanopyCalendarSource("work", "Work") { Initials = "W" });
        Assert.Contains("calendar-screen", CanopyHtmlAssets.GetRequiredParts(withFace.Grid!).Select(part => part.Name));
    }

    [Fact]
    public void SharedScreenSettings_RefuseWhatTheBrowserRefuses() {
        var calendar = new CanopyCalendar("starts");
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.FadePast = 0.95);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.FadePast = 0.05);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.ListDays = 1);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.ListDays = 15);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.DayWidth = 59);
        Assert.Throws<ArgumentOutOfRangeException>(() => calendar.ListBelow = 8);
        Assert.Throws<ArgumentException>(() => new CanopyCalendarDayNote(DateTime.Today, " "));
        Assert.Throws<ArgumentException>(() => new CanopyCalendarDayNote(DateTime.Today, new string('x', 65)));
        var source = new CanopyCalendarSource("a", "A");
        Assert.Throws<ArgumentException>(() => source.Initials = "ABCD");
        Assert.Throws<ArgumentException>(() => source.Icon = " ");
        foreach (var avatar in new[] { "javascript:alert(1)", "//other.test/a.png", "data:text/html;base64,PGI+", "data:image/png,raw", "a b.png" })
            Assert.Throws<ArgumentException>(() => source.Avatar = avatar);
        source.Avatar = "/faces/a.png";
        source.Initials = "👩🏽‍🦰";
        Assert.Equal("👩🏽‍🦰", source.Initials);

        var view = new CanopyDataGridView("plan", "Plan");
        view.Columns.Add(new CanopyColumn("title", "Title") { RowHeader = true });
        view.Columns.Add(new CanopyColumn("starts", "Starts") { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("load", "Load") { Kind = CanopyColumnKind.Number });
        view.Calendar = new CanopyCalendar("starts") { Location = "load" };
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Calendar = new CanopyCalendar("starts");
        view.Calendar.Faces.Add(new CanopyCalendarFace("kitchen"));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Calendar.Faces[0].Icon = "🍳";
        view.Calendar.Faces.Add(new CanopyCalendarFace("kitchen") { Initials = "K" });
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Calendar.Faces.RemoveAt(1);

        var json = view.ToJson();
        string Mutated(Action<JsonObject> change) => ProtocolSchema.Mutate(json, root => change(root["calendar"]!.AsObject()));
        bool Valid(Action<JsonObject> change) => ProtocolSchema.Evaluate(Mutated(change)).IsValid;
        Assert.True(Valid(calendar => calendar["merge"] = true));
        Assert.False(Valid(calendar => calendar["merge"] = new JsonObject { ["by"] = "title" }));
        Assert.False(Valid(calendar => calendar["fadePast"] = 1));
        Assert.False(Valid(calendar => calendar["dayWidth"] = 401));
        Assert.False(Valid(calendar => calendar["listBelow"] = 1));
        Assert.False(Valid(calendar => calendar["dayNotes"] = new JsonArray(new JsonObject { ["date"] = "2026-10-16" })));
        Assert.False(Valid(calendar => calendar["dayNotes"] = new JsonArray(new JsonObject { ["date"] = "16.10.2026", ["text"] = "x" })));
        Assert.False(Valid(calendar => calendar["faces"] = new JsonArray(new JsonObject { ["resource"] = "kitchen" })));
        Assert.False(Valid(calendar => calendar["faces"] = new JsonArray(new JsonObject { ["resource"] = "kitchen", ["avatar"] = "javascript:alert(1)" })));
        Assert.False(Valid(calendar => calendar["faces"] = new JsonArray(new JsonObject { ["resource"] = "kitchen", ["avatar"] = "data:text/html;base64,PGI+" })));
        Assert.True(Valid(calendar => calendar["faces"] = new JsonArray(new JsonObject { ["resource"] = "kitchen", ["avatar"] = "/faces/k.png" })));
        Assert.False(Valid(calendar => calendar["reset"] = "yes"));
    }
}
