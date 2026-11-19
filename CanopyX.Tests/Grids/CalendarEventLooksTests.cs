using System.Text.Json;
using CanopyX.Tests.Protocol;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Per-event colours and addresses: basic events, the typed builder and the wire contract.</summary>
public sealed class CalendarEventLooksTests {
    public sealed class Change {
        public string Id { get; set; } = "";
        public string Title { get; set; } = "";
        public DateTime Starts { get; set; }
        public string? Team { get; set; }
        public string? Fill { get; set; }
        public string? Ink { get; set; }
        public string? Link { get; set; }
    }

    private static readonly DateTime Start = new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Events_WriteHiddenColourAndAddressColumnsOnlyWhenUsed() {
        var calendar = new CanopyCalendar(new[] {
            new CanopyCalendarEvent("Change", Start) { Id = "a", Color = " #0f766e ", BackgroundColor = "rgb(204, 251, 241)", TextColor = "navy", Url = "/changes/a" },
            new CanopyCalendarEvent("Plain", Start) { Id = "b" }
        }) { OpenUrlInNewWindow = true };
        var grid = calendar.Grid!;
        foreach (var id in new[] { "color", "backgroundColor", "textColor", "url" }) Assert.True(grid.GetColumn(id).Hidden, id);
        Assert.Equal("#0f766e", grid.Rows[0].Cells["color"].Value);
        Assert.False(grid.Rows[1].Cells.ContainsKey("url"));
        var json = grid.ToJson();
        ProtocolSchema.AssertValid(json, "calendar with event colours and addresses");
        using var document = JsonDocument.Parse(json);
        var settings = document.RootElement.GetProperty("calendar");
        Assert.Equal("color", settings.GetProperty("color").GetString());
        Assert.Equal("backgroundColor", settings.GetProperty("backgroundColor").GetString());
        Assert.Equal("textColor", settings.GetProperty("textColor").GetString());
        Assert.Equal("url", settings.GetProperty("url").GetString());
        Assert.Equal("blank", settings.GetProperty("urlTarget").GetString());

        var plain = new CanopyCalendar(new[] { new CanopyCalendarEvent("Plain", Start) });
        using var plainDocument = JsonDocument.Parse(plain.Grid!.ToJson());
        foreach (var name in new[] { "color", "backgroundColor", "textColor", "url", "urlTarget" })
            Assert.False(plainDocument.RootElement.GetProperty("calendar").TryGetProperty(name, out _), name);
    }

    [Theory]
    [InlineData("#abc")]
    [InlineData("#AABBCCDD")]
    [InlineData("rgb(1, 2, 3)")]
    [InlineData("hsl(120deg 50% 40% / 0.5)")]
    [InlineData("rebeccapurple")]
    public void Colours_AcceptHexFunctionalAndNamedColours(string value) {
        Assert.Equal(value, new CanopyCalendarEvent("x", Start) { Color = value }.Color);
    }

    [Theory]
    [InlineData("red;background:url(https://evil.test)")]
    [InlineData("var(--accent)")]
    [InlineData("url(x)")]
    [InlineData("#12")]
    [InlineData("")]
    public void Colours_RejectAnythingElse(string value) {
        Assert.Throws<ArgumentException>(() => new CanopyCalendarEvent("x", Start) { Color = value });
        Assert.Throws<ArgumentException>(() => new CanopyCalendarEvent("x", Start) { BackgroundColor = value });
        Assert.Throws<ArgumentException>(() => new CanopyCalendarEvent("x", Start) { TextColor = value });
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
    public void TypedBuilder_BindsColourAndAddressMembers() {
        var grid = new CanopyDataGridView<Change>("changes", "Changes", change => change.Id);
        grid.Column(x => x.Title, configure: column => column.RowHeader = true);
        grid.Calendar().Start(x => x.Starts).Color(x => x.Team).BackgroundColor(x => x.Fill).TextColor(x => x.Ink).Url(x => x.Link, newWindow: true);
        var calendar = grid.View.Calendar!;
        Assert.Equal(new[] { "team", "fill", "ink", "link" }, new[] { calendar.Color, calendar.BackgroundColor, calendar.TextColor, calendar.Url });
        Assert.True(calendar.OpenUrlInNewWindow);
        Assert.True(grid.View.GetColumn("link").Hidden);
        ProtocolSchema.AssertValid(grid.View.ToJson(), "typed calendar with colour and address members");
    }

    [Fact]
    public void Definition_RejectsColourColumnsThatAreNotText() {
        var calendar = new CanopyCalendar(new[] { new CanopyCalendarEvent("x", Start) });
        calendar.Color = "start";
        Assert.Throws<InvalidOperationException>(() => calendar.Grid!.ToJson());
    }
}
