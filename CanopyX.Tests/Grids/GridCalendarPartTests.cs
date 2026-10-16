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
        Assert.Contains("function calExpand(", part.Script);
        Assert.Contains("const CALENDAR_LABELS={", part.Script);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        // The new part's size plus about 15%.
        Assert.True(Gzip(part.Script) <= 40400, "The calendar part is " + Gzip(part.Script) + " bytes gzip; the guard is 40,400 (35,124 measured + 15%).");
        Assert.True(Gzip(part.Style!) <= 4500, "The calendar stylesheet is " + Gzip(part.Style!) + " bytes gzip; the guard is 4,500 (3,917 measured + 15%).");

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
        Assert.True(Gzip(part.Script) <= 11450, "The timeline part is " + Gzip(part.Script) + " bytes gzip; the guard is 11,450 (9,960 measured + 15%).");
        Assert.True(Gzip(part.Style!) <= 2256, "The timeline stylesheet is " + Gzip(part.Style!) + " bytes gzip; the guard is 2,256 (1,962 measured + 15%).");

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

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
