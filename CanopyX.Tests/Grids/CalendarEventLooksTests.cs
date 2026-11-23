using System.Text.Json;
using CanopyX.Tests.Protocol;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Per-event addresses: basic events, the typed builder and the wire contract. Events take their colours from tones.</summary>
public sealed class CalendarEventLooksTests {
    public sealed class Change {
        public string Id { get; set; } = "";
        public string Title { get; set; } = "";
        public DateTime Starts { get; set; }
        public string? Link { get; set; }
    }

    private static readonly DateTime Start = new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Events_WriteAHiddenAddressColumnOnlyWhenUsed() {
        var calendar = new CanopyCalendar(new[] {
            new CanopyCalendarEvent("Change", Start) { Id = "a", Tone = Tone.Success, Url = "/changes/a" },
            new CanopyCalendarEvent("Plain", Start) { Id = "b" }
        }) { OpenUrlInNewWindow = true };
        var grid = calendar.Grid!;
        Assert.True(grid.GetColumn("url").Hidden);
        Assert.False(grid.Rows[1].Cells.ContainsKey("url"));
        var json = grid.ToJson();
        ProtocolSchema.AssertValid(json, "calendar with event addresses");
        using var document = JsonDocument.Parse(json);
        var settings = document.RootElement.GetProperty("calendar");
        Assert.Equal("url", settings.GetProperty("url").GetString());
        Assert.Equal("blank", settings.GetProperty("urlTarget").GetString());
        foreach (var name in new[] { "color", "backgroundColor", "textColor" }) Assert.False(settings.TryGetProperty(name, out _), name);

        var plain = new CanopyCalendar(new[] { new CanopyCalendarEvent("Plain", Start) });
        using var plainDocument = JsonDocument.Parse(plain.Grid!.ToJson());
        foreach (var name in new[] { "url", "urlTarget" })
            Assert.False(plainDocument.RootElement.GetProperty("calendar").TryGetProperty(name, out _), name);
    }

    [Theory]
    [InlineData("https://tickets.example.test/1", true)]
    [InlineData("mailto:ops@example.test", true)]
    [InlineData("changes/a.html", true)]
    [InlineData("/changes/a?x=1#y", true)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("data:text/html,x", false)]
    [InlineData("file:///c:/x", false)]
    [InlineData("a\\b", false)]
    [InlineData("//evil.test/x", false)]
    [InlineData("a\nb", false)]
    public void Addresses_AcceptHttpMailtoAndRelativeOnly(string value, bool accepted) {
        if (accepted) Assert.Equal(value, new CanopyCalendarEvent("x", Start) { Url = value }.Url);
        else Assert.Throws<ArgumentException>(() => new CanopyCalendarEvent("x", Start) { Url = value });
    }

    [Fact]
    public void TypedBuilder_BindsTheAddressMember() {
        var grid = new CanopyDataGridView<Change>("changes", "Changes", change => change.Id);
        grid.Column(x => x.Title, configure: column => column.RowHeader = true);
        grid.Calendar().Start(x => x.Starts).Url(x => x.Link, newWindow: true);
        var calendar = grid.View.Calendar!;
        Assert.Equal("link", calendar.Url);
        Assert.True(calendar.OpenUrlInNewWindow);
        Assert.True(grid.View.GetColumn("link").Hidden);
        ProtocolSchema.AssertValid(grid.View.ToJson(), "typed calendar with an address member");
    }

    [Fact]
    public void Definition_RejectsAnAddressColumnThatIsNotText() {
        var calendar = new CanopyCalendar(new[] { new CanopyCalendarEvent("x", Start) });
        calendar.Url = "start";
        Assert.Throws<InvalidOperationException>(() => calendar.Grid!.ToJson());
    }
}
