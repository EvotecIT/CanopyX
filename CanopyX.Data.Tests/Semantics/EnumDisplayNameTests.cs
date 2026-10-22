using System.Runtime.Serialization;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Enumeration members with an EnumMember value are filtered, searched, sorted, listed and written by that text.</summary>
public sealed class EnumDisplayNameTests {
    [Flags]
    public enum Access { None = 0, [EnumMember(Value = "read")] Read = 1, [EnumMember(Value = "write")] Write = 2 }

    public enum Platform { Windows, [EnumMember(Value = "macOS")] MacOs, [EnumMember(Value = "FreeBSD")] FreeBsd, Linux }

    public sealed class Device {
        public int Id { get; set; }
        public Platform Platform { get; set; }
    }

    private static readonly List<Device> Devices = new List<Device> {
        new Device { Id = 1, Platform = Platform.MacOs }, new Device { Id = 2, Platform = Platform.Windows },
        new Device { Id = 3, Platform = Platform.FreeBsd }, new Device { Id = 4, Platform = Platform.Linux }, new Device { Id = 5, Platform = Platform.MacOs }
    };

    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("devices", "Devices") { Source = CanopyGridSource.HostedOffset() };
        view.Columns.Add(new CanopyColumn("platform", "Platform") { Sortable = true });
        view.Reporting = new CanopyGridReporting();
        view.Reporting.FacetColumns.Add("platform");
        return view;
    }

    public static TheoryData<string> Providers => new TheoryData<string> { "reference", "canonical", "store" };

    private static CanopyRemoteHandler Handler(string provider, bool categories = false) {
        var view = View();
        if (categories) { view.GetColumn("platform").ValueOrder.Add("Windows"); view.GetColumn("platform").ValueOrder.Add("macOS"); view.Reporting!.Groupable = true; }
        var map = new CanopyColumnMap<Device>(view).Key(x => x.Id).Column("platform", x => x.Platform);
        ICanopyDataProvider data = provider == "reference"
            ? new CanopyInMemoryProvider<Device>(map.Schema, () => Devices, x => x.Id.ToString(System.Globalization.CultureInfo.InvariantCulture),
                new Dictionary<string, Func<Device, object?>> { ["platform"] = x => x.Platform }, () => "r1")
            // "store" evaluates the database translation (rank expressions, lowercased text) in memory.
            : new CanopyQueryableProvider<Device>(Devices.AsQueryable(), map, new CanopyQueryOptions {
                Revision = _ => new ValueTask<string>("r1"), TextComparison = provider == "store" ? CanopyTextComparison.Lowercase : CanopyTextComparison.Canonical });
        return new CanopyRemoteHandler(map.Schema, data);
    }

    private static async Task<string[]> Ids(CanopyRemoteHandler handler, string query) {
        using var page = JsonDocument.Parse(await handler.QueryAsync(query));
        return page.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetString()!).ToArray();
    }

    [Theory, MemberData(nameof(Providers))]
    public async Task DeclaredCategoriesOrderNormalizedEnumSortsFacetsAndGroups(string provider) {
        var handler = Handler(provider, true);
        Assert.Equal(new[] { "2", "1", "5", "3", "4" }, await Ids(handler, "{\"sort\":[{\"column\":\"platform\",\"direction\":\"asc\"}]}"));
        Assert.Equal(new[] { "4", "3", "1", "5", "2" }, await Ids(handler, "{\"sort\":[{\"column\":\"platform\",\"direction\":\"desc\"}]}"));
        using var facet = JsonDocument.Parse(await handler.FacetAsync("{\"column\":\"platform\",\"query\":{\"revision\":\"r1\"}}"));
        Assert.Equal(new[] { "Windows", "macOS", "FreeBSD", "Linux" }, facet.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("value").GetString()));
        Assert.Equal(new[] { 1, 2, 1, 1 }, facet.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("count").GetInt32()));
        using var summary = JsonDocument.Parse(await handler.SummaryAsync("{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"platform\",\"direction\":\"asc\"}]}"));
        Assert.Equal(new[] { "Windows", "macOS", "FreeBSD", "Linux" }, summary.RootElement.GetProperty("groups").EnumerateArray().Select(item => item.GetProperty("value").GetString()));
    }

    [Theory, MemberData(nameof(Providers))]
    public async Task DisplayNames_DriveEveryOperation(string provider) {
        var handler = Handler(provider);
        Assert.Equal(new[] { "1", "5" }, await Ids(handler, "{\"filters\":[{\"column\":\"platform\",\"operator\":\"eq\",\"values\":[\"MACOS\"]}]}"));
        Assert.Equal(new[] { "1", "3", "5" }, await Ids(handler, "{\"filters\":[{\"column\":\"platform\",\"operator\":\"in\",\"values\":[\"freebsd\",\"MACOS\"]}]}"));
        Assert.Equal(new[] { "3" }, await Ids(handler, "{\"search\":\"bsd\"}"));
        Assert.Equal(new[] { "3", "4", "2", "1", "5" }, await Ids(handler, "{\"sort\":[{\"column\":\"platform\",\"direction\":\"asc\"}]}"));
        using var page = JsonDocument.Parse(await handler.QueryAsync("{\"limit\":1}"));
        Assert.Equal("macOS", page.RootElement.GetProperty("items")[0].GetProperty("cells").GetProperty("platform").GetString());
        using var facet = JsonDocument.Parse(await handler.FacetAsync("{\"column\":\"platform\",\"query\":{\"revision\":\"r1\"}}"));
        // Value lists order by folded text; sorting is ordinal.
        Assert.Equal(new[] { "FreeBSD", "Linux", "macOS", "Windows" }, facet.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("value").GetString()));
    }

    [Fact]
    public void EnumText_UsesEnumMemberValuesOrNames() {
        Assert.Equal("macOS", CanopyDataValues.EnumText(Platform.MacOs));
        Assert.Equal("Linux", CanopyDataValues.EnumText(Platform.Linux));
        Assert.Equal("FreeBSD", CanopyDataValues.Normalize(Platform.FreeBsd));
        Assert.Equal("read, write", CanopyDataValues.EnumText(Access.Read | Access.Write));
        Assert.Equal("None", CanopyDataValues.EnumText(Access.None));
    }
}
