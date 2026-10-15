using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Multi-level grouping over a store whose text collation ignores case: each level's scan may report another
/// spelling of a group, yet summaries and pages nest, count and order the same groups, and nothing answers staleRevision.</summary>
public sealed class CollationGroupingTests {
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("hosts", "Hosts") { Source = CanopyGridSource.HostedOffset(), PageSize = 50 };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        view.Columns.Add(new CanopyColumn("os", "Operating system") { Sortable = true });
        view.Columns.Add(new CanopyColumn("memory", "Memory") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Reporting = new CanopyGridReporting { Groupable = true };
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("hosts", "name", CanopyGridAggregateOperation.Count, "Hosts"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("memory", "memory", CanopyGridAggregateOperation.Sum, "Memory"));
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("site", descending: true, aggregate: "memory"));
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("os"));
        return view;
    }

    private static List<Host> Hosts() {
        // The first spelling each scan meets differs: the site scan reports "Berlin", while the site and system scan reports the
        // Linux machines of that site as "BERLIN", so nesting them needs the collation's view of the value.
        var sites = new[] { "berlin", "Oslo", "Berlin", "BERLIN", "oslo", "Austin" };
        var systems = new[] { OsFamily.Windows, OsFamily.Linux };
        return Enumerable.Range(1, 60).Select(i => new Host { Id = i, Name = "host-" + i.ToString("D3", System.Globalization.CultureInfo.InvariantCulture),
            Site = sites[(i * 7 + i / 6) % sites.Length], Os = systems[(i / 3) % systems.Length], Memory = i % 9 + 0.5 }).ToList();
    }

    [Fact]
    public async Task CaseInsensitiveStores_NestAndCountGroupsConsistently() {
        var hosts = Hosts();
        var map = new CanopyColumnMap<Host>(View()).Key(x => x.Id).Column("name", x => x.Name).Column("site", x => x.Site).Column("os", x => x.Os).Column("memory", x => x.Memory);
        var handler = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Host>(() => CaseInsensitiveQueryable.Create(hosts), map,
            new CanopyQueryOptions { TextComparison = CanopyTextComparison.Collation, Revision = _ => new ValueTask<string>("r1") }));
        var summary = JsonDocument.Parse(await handler.SummaryAsync("{\"revision\":\"r1\"}")).RootElement;
        var sites = summary.GetProperty("groups").EnumerateArray().ToList();
        // Three sites as the collation sees them, each with its systems nested inside and counts that add up.
        Assert.Equal(3, sites.Count);
        Assert.Equal(60, sites.Sum(site => site.GetProperty("count").GetInt32()));
        foreach (var site in sites) Assert.Equal(site.GetProperty("count").GetInt32(), site.GetProperty("groups").EnumerateArray().Sum(group => group.GetProperty("count").GetInt32()));
        var totals = sites.Select(site => site.GetProperty("aggregates").GetProperty("memory").GetDouble()).ToList();
        Assert.Equal(totals.OrderByDescending(total => total).ToList(), totals);
        // Pages read the same groups in the same order: the records of each group's range belong to it under the collation.
        var page = JsonDocument.Parse(await handler.QueryAsync("{\"limit\":60}")).RootElement.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(60, page.Count);
        foreach (var site in sites) foreach (var system in site.GetProperty("groups").EnumerateArray()) {
            var offset = system.GetProperty("offset").GetInt32();
            for (var i = offset; i < offset + system.GetProperty("count").GetInt32(); i++) {
                Assert.Equal(site.GetProperty("value").GetString(), page[i].GetProperty("cells").GetProperty("site").GetString(), StringComparer.OrdinalIgnoreCase);
                Assert.Equal(system.GetProperty("value").GetString(), page[i].GetProperty("cells").GetProperty("os").GetString());
            }
        }
    }
}
