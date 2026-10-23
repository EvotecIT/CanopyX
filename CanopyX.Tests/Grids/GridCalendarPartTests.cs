using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Grids;

/// <summary>The calendar and timeline parts: versions, size guards, what the entry points keep and which views carry them.</summary>
public sealed class GridCalendarPartTests {
    [Fact]
    public void CalendarPart_IsVersionedBoundedOutsideTheEntryPointsAndCarriedByCalendarViewsOnly() {
        var part = CanopyHtmlAssets.GetPart("calendar");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Equal("calendar", part.Label);
        Assert.NotNull(part.Style);
        Assert.False(part.IsShippedWith(CanopyRuntime.TreeGrid));
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            Assert.True(part.IsShippedWith(runtime));
            var script = CanopyHtmlAssets.GetScript(runtime);
            // The entry points carry the method stubs; views, recurrence, editing and export stay in the part.
            Assert.Contains("setCalendarView", script);
            Assert.DoesNotContain("function calSettings(", script);
            Assert.DoesNotContain("function calExpand(", script);
            Assert.DoesNotContain("cx-cal-month", CanopyHtmlAssets.GetStyle(runtime));
        }
        Assert.Contains("function calSettings(", part.Script);
        Assert.Contains("const CALENDAR_LABELS={", part.Script);
        // What a basic calendar does not use lives in parts of its own.
        Assert.DoesNotContain("function calExpand(", part.Script);
        Assert.DoesNotContain("calCreateForm(proposal", part.Script);
        Assert.DoesNotContain("function calIcsParse(", part.Script);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        // The part's size plus about 15%.
        Assert.True(ComponentGzip(part.Script) <= 40000, "The calendar part is " + ComponentGzip(part.Script) + " bytes gzip; the guard is 40,000 (34,796 measured + 15%).");
        Assert.True(ComponentGzip(part.Style!) <= 6400, "The calendar stylesheet is " + ComponentGzip(part.Style!) + " bytes gzip; the guard is 6,400 (5,522 measured + 15%).");

        var plain = Grid();
        Assert.DoesNotContain("x-canopyx-calendar\"", plain.ToHtmlFragment());
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(plain), item => item.Name == "calendar");
        var calendar = Grid();
        calendar.Calendar = new CanopyCalendar("starts");
        var required = CanopyHtmlAssets.GetRequiredParts(calendar).Select(item => item.Name).ToList();
        Assert.Contains("calendar", required);
        Assert.DoesNotContain("timeline", required);
        Assert.Contains("<script type=\"application/x-canopyx-calendar\" data-cx-version=\"" + part.Version + "\">", calendar.ToHtmlFragment());
    }

    [Theory]
    [InlineData("calendar-recurrence", "calendar recurrence", "function calExpand(", 3800)]
    // Current repaired parts: 12,196 and 8,209 bytes gzip, with about 15% headroom.
    [InlineData("calendar-edit", "calendar editing", "calCreateForm(proposal", 14050)]
    [InlineData("calendar-ics", "iCalendar", "function calIcsParse(", 9450)]
    public void CalendarSubParts_AreBoundedAndOutsideTheCore(string name, string label, string marker, int guard) {
        var part = CanopyHtmlAssets.GetPart(name);
        Assert.Equal(label, part.Label);
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Contains(marker, part.Script);
        Assert.DoesNotContain(marker, CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid));
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        Assert.True(ComponentGzip(part.Script) <= guard, "The " + name + " part is " + ComponentGzip(part.Script) + " bytes gzip; the guard is " + guard + " (measured + 15%).");
    }

    [Fact]
    public void CalendarSubParts_ComeWithTheOptionsThatUseThem() {
        // A basic calendar: events only, no toolbar, read-only.
        var basic = new CanopyCalendar(new[] { new CanopyCalendarEvent("Planning", new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc)) });
        var required = CanopyHtmlAssets.GetRequiredParts(basic.Grid!).Select(item => item.Name).ToList();
        Assert.Contains("calendar", required);
        foreach (var name in new[] { "calendar-recurrence", "calendar-edit", "calendar-ics", "timeline" }) Assert.DoesNotContain(name, required);
        // Recurrence, editing, the Export menu (iCalendar) and the timeline view each bring their part.
        var scheduler = new CanopyCalendar(new[] { new CanopyCalendarEvent("Stand-up", new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc)) { Recurrence = CanopyRecurrence.Daily() } }, CanopyCalendarPreset.Scheduler);
        scheduler.Views.Add(CanopyCalendarView.Timeline);
        required = CanopyHtmlAssets.GetRequiredParts(scheduler.Grid!).Select(item => item.Name).ToList();
        foreach (var name in new[] { "calendar", "calendar-recurrence", "calendar-edit", "calendar-ics", "timeline" }) Assert.Contains(name, required);
        var source = new CanopyCalendar(new[] { new CanopyCalendarEvent("Planning", new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc)) });
        source.Sources.Add(new CanopyCalendarSource("ext", "External") { Ics = "holidays.ics" });
        required = CanopyHtmlAssets.GetRequiredParts(source.Grid!).Select(item => item.Name).ToList();
        Assert.Contains("calendar-ics", required);
        Assert.Contains("calendar-recurrence", required);
        // A calendar whose toolbar shows Export carries the iCalendar part and the recurrence part it requires, though no event repeats.
        var exporting = Grid();
        exporting.Calendar = new CanopyCalendar("starts");
        required = CanopyHtmlAssets.GetRequiredParts(exporting).Select(item => item.Name).ToList();
        foreach (var name in new[] { "calendar", "calendar-recurrence", "calendar-ics" }) Assert.Contains(name, required);
        // Creating needs the editing part even when the host asks for the parts before the grid is written.
        var creating = new CanopyCalendar(new[] { new CanopyCalendarEvent("Planning", new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc)) }) { Create = new CanopyCalendarCreate() };
        Assert.Contains("editing", CanopyHtmlAssets.GetRequiredParts(creating.Grid!).Select(item => item.Name));
    }

    [Fact]
    public void ExplicitCalendarExportPart_EmbedsItsDependenciesOnce_WithoutChangingRequestedOptions() {
        var calendar = new CanopyCalendar(new[] { new CanopyCalendarEvent("Planning", new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc)) });
        var options = new CanopyHtmlOptions();
        options.Parts.Add("calendar-ics");
        var fragment = calendar.ToHtmlFragment(options);
        foreach (var name in new[] { "calendar", "calendar-recurrence", "calendar-ics" }) {
            var marker = "type=\"application/x-canopyx-" + name + "\"";
            Assert.Equal(1, fragment.Split(new[] { marker }, StringSplitOptions.None).Length - 1);
        }
        Assert.Equal(new[] { "calendar-ics" }, options.Parts);
        Assert.Null(calendar.Recurrence);
        Assert.Empty(calendar.Sources);
    }

    [Fact]
    public void TimelinePart_RequiresTheCalendarAndComesWithTheResourceTreeParts() {
        var part = CanopyHtmlAssets.GetPart("timeline");
        Assert.Equal("resource timeline", part.Label);
        Assert.NotNull(part.Style);
        Assert.False(part.IsShippedWith(CanopyRuntime.TreeGrid));
        Assert.True(part.IsShippedWith(CanopyRuntime.DataGrid));
        Assert.Contains("function tlAxis(", part.Script);
        Assert.DoesNotContain("function tlAxis(", CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid));
        Assert.DoesNotContain("function tlAxis(", CanopyHtmlAssets.GetPart("calendar").Script);
        Assert.True(ComponentGzip(part.Script) <= 11450, "The timeline part is " + ComponentGzip(part.Script) + " bytes gzip; the guard is 11,450 (9,960 measured + 15%).");
        Assert.True(ComponentGzip(part.Style!) <= 2256, "The timeline stylesheet is " + ComponentGzip(part.Style!) + " bytes gzip; the guard is 2,256 (1,962 measured + 15%).");

        var view = Grid();
        var tree = new CanopyTreeView("hosts", "Hosts");
        tree.Columns.Add(new CanopyColumn("name", "Host"));
        tree.Roots.Add(new CanopyNode("h1", "h1"));
        view.Calendar = new CanopyCalendar("starts") { Resource = "host", Resources = new CanopyCalendarResources(tree) };
        var required = CanopyHtmlAssets.GetRequiredParts(view).Select(item => item.Name).ToList();
        foreach (var name in new[] { "calendar", "timeline", "tree-tools" }) Assert.Contains(name, required);
        var fragment = view.ToHtmlFragment();
        Assert.Contains("application/x-canopyx-timeline\"", fragment);
        Assert.Contains("application/x-canopyx-tree-tools\"", fragment);
    }

    private static CanopyDataGridView Grid() {
        var grid = new CanopyDataGridView("schedule", "Schedule");
        grid.Columns.Add(new CanopyColumn("title", "Title") { Sortable = true });
        grid.Columns.Add(new CanopyColumn("starts", "Starts") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        grid.Columns.Add(new CanopyColumn("host", "Host"));
        return grid;
    }

    // Token fallback bytes have their own shared allowance; keep this component ceiling unchanged.
    private static long ComponentGzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(CanopyX.Tests.Html.SharedTokenAssets.WithoutFallbackPayload(value)); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
