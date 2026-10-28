using System.Text.Json.Nodes;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>Calendar resource assignments, override records and JSON feed declarations survive the public writers.</summary>
public sealed class CalendarResourceFeedTests {
    [Fact]
    public void MultiResourceOverrides_SerializeWithoutLosingIdentity_AndEnableOccurrenceEditing() {
        var start = new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc);
        var master = new CanopyCalendarEvent("Planning", start) { Id = "series", End = start.AddHours(1), Recurrence = CanopyRecurrence.Daily().Times(3) };
        master.ResourceIds.Add("room-1"); master.ResourceIds.Add("room-48"); master.ResourceIds.Add("room-1");
        var changed = new CanopyCalendarEvent("Review", start.AddDays(1).AddHours(1)) {
            Id = "override", End = start.AddDays(1).AddHours(2), Series = "series", RecurrenceId = start.AddDays(1), Resource = "room-2"
        };
        var calendar = new CanopyCalendar(new[] { master, changed }, CanopyCalendarPreset.Scheduler);
        var json = calendar.Grid!.ToJson();
        ProtocolSchema.AssertValid(json, "multi-resource series and override");
        var document = JsonNode.Parse(json)!;
        Assert.Equal("resourceIds", document["calendar"]!["resourceIds"]!.GetValue<string>());
        Assert.Equal("[\"room-1\",\"room-48\"]", document["rows"]![0]!["cells"]!["resourceIds"]!.GetValue<string>());
        Assert.Equal("series", document["rows"]![1]!["cells"]!["series"]!.GetValue<string>());
        Assert.Equal("2026-10-17T09:00:00Z", document["rows"]![1]!["cells"]!["recurrenceId"]!.GetValue<string>());
        foreach (var id in new[] { "resourceIds", "series", "recurrenceId", "exceptions" }) Assert.True(calendar.Grid.GetColumn(id).Editable);
        var html = calendar.ToHtmlPage();
        Assert.Contains("calOccurrenceForm", html);
        Assert.Contains("resourceIds", html);
    }

    [Fact]
    public void JsonSource_WritesFetchParametersColourAndVisibility_AndIncludesRecurrenceRuntime() {
        var calendar = new CanopyCalendar(Array.Empty<CanopyCalendarEvent>());
        var source = new CanopyCalendarSource("team", "Team") { Url = "feeds/team.json", Color = "#2563eb", Hidden = true };
        source.FetchParams.Add("team", "design & research"); calendar.Sources.Add(source);
        var json = calendar.Grid!.ToJson();
        ProtocolSchema.AssertValid(json, "JSON-only calendar source");
        var feed = JsonNode.Parse(json)!["calendar"]!["sources"]![0]!;
        Assert.Equal("feeds/team.json", feed["url"]!.GetValue<string>());
        Assert.Equal("#2563eb", feed["color"]!.GetValue<string>());
        Assert.True(feed["hidden"]!.GetValue<bool>());
        Assert.Equal("design & research", feed["fetchParams"]!["team"]!.GetValue<string>());
        var html = calendar.ToHtmlPage();
        Assert.Contains("calLoadJson", html);
        Assert.Contains("calExpand", html);
        Assert.DoesNotContain("calOccurrenceForm", html);
    }

    [Theory]
    [InlineData("start")]
    [InlineData("end")]
    [InlineData("timeZone")]
    public void JsonSource_RefusesReservedFetchParameters(string key) {
        var calendar = new CanopyCalendar(Array.Empty<CanopyCalendarEvent>());
        var source = new CanopyCalendarSource("team", "Team") { Url = "/feed" };
        source.FetchParams[key] = "override"; calendar.Sources.Add(source);
        Assert.Throws<InvalidOperationException>(() => calendar.Grid!.ToJson());
    }

    [Fact]
    public void Sources_RefuseAmbiguousFeedsAndUnsafeColours() {
        var calendar = new CanopyCalendar(Array.Empty<CanopyCalendarEvent>());
        calendar.Sources.Add(new CanopyCalendarSource("team", "Team") { Url = "/feed", Ics = "/feed.ics" });
        Assert.Throws<InvalidOperationException>(() => calendar.Grid!.ToJson());
        Assert.Throws<ArgumentException>(() => new CanopyCalendarSource("team", "Team") { Color = "red;display:none" });
        Assert.Throws<ArgumentException>(() => new CanopyCalendarSource("team", "Team") { Url = "javascript:alert(1)" });
    }

    [Fact]
    public void Events_RefuseIncompleteOverridesAndInvalidResourceIdentifiers() {
        var start = new DateTime(2026, 10, 16);
        Assert.Throws<ArgumentException>(() => new CanopyCalendar(new[] { new CanopyCalendarEvent("Override", start) { Series = "master" } }));
        var item = new CanopyCalendarEvent("Meeting", start); item.ResourceIds.Add("");
        Assert.Throws<ArgumentException>(() => new CanopyCalendar(new[] { item }));
    }
}
