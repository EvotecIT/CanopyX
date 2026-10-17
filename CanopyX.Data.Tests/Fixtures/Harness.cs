using System.Text.Json;

namespace CanopyX.Data.Tests;

public enum ProviderKind { Reference, Linq }

/// <summary>Builds handlers over the fleet fixture with one fixed revision, so documents from different providers compare byte for byte.</summary>
public sealed class Harness {
    public Harness(IReadOnlyList<Host> hosts, ProviderKind kind, bool grouped = false, CanopyRemoteOptions? options = null, CanopyDataGridView? view = null) {
        Hosts = hosts;
        var map = Fleet.Map(view ?? Fleet.View(grouped));
        Schema = map.Schema;
        Provider = kind == ProviderKind.Reference
            ? new CanopyInMemoryProvider<Host>(Schema, () => hosts, host => host.Id.ToString(System.Globalization.CultureInfo.InvariantCulture), Values(), () => "r1")
            : new CanopyQueryableProvider<Host>(hosts.AsQueryable(), map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        Handler = new CanopyRemoteHandler(Schema, Provider, options);
    }

    public IReadOnlyList<Host> Hosts { get; }
    public CanopyDataSchema Schema { get; }
    public ICanopyDataProvider Provider { get; }
    public CanopyRemoteHandler Handler { get; }

    public static Dictionary<string, Func<Host, object?>> Values() => new Dictionary<string, Func<Host, object?>> {
        ["name"] = x => x.Name, ["site"] = x => x.Site, ["os"] = x => x.Os, ["cores"] = x => x.Cores, ["memory"] = x => x.Memory,
        ["online"] = x => x.Online, ["lastSeen"] = x => x.LastSeen, ["owner"] = x => x.Owner?.Name, ["notes"] = x => x.Notes
    };

    /// <summary>Runs a query and returns the row identities of the page.</summary>
    public async Task<(string[] Ids, int Matched, int Total)> Ids(string json) {
        using var page = JsonDocument.Parse(await Handler.QueryAsync(json));
        var root = page.RootElement;
        var ids = root.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetString()!).ToArray();
        return (ids, root.GetProperty("matched").GetInt32(), root.GetProperty("total").GetInt32());
    }

    /// <summary>A query document with the given filters, sorted by name.</summary>
    public static string Where(string filters, string search = "", string mode = "substring", int limit = 1000, string sort = "[{\"column\":\"name\",\"direction\":\"asc\"}]") =>
        "{\"view\":\"fleet\",\"offset\":0,\"limit\":" + limit + ",\"search\":" + RandomQueries.Json(search) + ",\"searchMode\":\"" + mode + "\",\"sort\":" + sort + ",\"filters\":[" + filters + "]}";
}
