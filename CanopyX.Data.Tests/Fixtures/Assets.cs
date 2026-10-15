namespace CanopyX.Data.Tests;

public sealed class AssetGroup {
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public List<Asset> Members { get; set; } = new List<Asset>();
}

public sealed class Asset {
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Site { get; set; }
    public int? Cores { get; set; }
    public DateTime? Seen { get; set; }
    public string? Serial { get; set; }
    public DateTime? Purchased { get; set; }
    public double? Weight { get; set; }
    public string? Notes { get; set; }
    public string? Secret { get; set; }
    public int? ReplacesId { get; set; }
    public Asset? Replaces { get; set; }
    public int? GroupId { get; set; }
    public AssetGroup? Group { get; set; }
    public List<AssetPart> Parts { get; set; } = new List<AssetPart>();
    public List<AssetEvent> Events { get; set; } = new List<AssetEvent>();
    public List<AssetChange> Changes { get; set; } = new List<AssetChange>();
}

public sealed class AssetPart {
    public int Id { get; set; }
    public int AssetId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Vendor { get; set; }
    public int? Quantity { get; set; }
    public DateTime? Installed { get; set; }
}

public sealed class AssetEvent {
    public int Id { get; set; }
    public int AssetId { get; set; }
    public DateTime? At { get; set; }
    public string? Summary { get; set; }
    public string? Actor { get; set; }
    public string? Kind { get; set; }
}

public sealed class AssetChange {
    public int Id { get; set; }
    public int AssetId { get; set; }
    public DateTime At { get; set; }
    public string Setting { get; set; } = string.Empty;
    public string? Before { get; set; }
    public string? After { get; set; }
}

/// <summary>
/// A deterministic generic asset inventory with record details: parts (a paged collection with duplicate and missing order
/// values), group peers (related records), events (a timeline with missing times and blank summaries), changes and a link to
/// the asset each replaces. Assets on the site "Hidden" lie outside the caller's scope.
/// </summary>
public static class Assets {
    public static readonly string?[] Sites = { "North", "south", "East", null, "Hidden", "West" };
    public static readonly string?[] Vendors = { "Acme", "acme", "Zeta", null, "Beta", "Ünïcode" };
    public static readonly string?[] Kinds = { "Repair", "Inspection", "Failure", null };
    private static readonly DateTime Epoch = new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc);

    public static List<Asset> Create(int count, int seed = 5) {
        var random = new Random(seed);
        var groups = Enumerable.Range(1, Math.Max(1, count / 7)).Select(i => new AssetGroup { Id = i, Name = "Group " + i }).ToList();
        var assets = new List<Asset>(count);
        int part = 0, item = 0, change = 0;
        for (var i = 1; i <= count; i++) {
            var group = random.Next(5) == 0 ? null : groups[random.Next(groups.Count)];
            var asset = new Asset {
                Id = i,
                Name = (i % 4 == 0 ? "ASSET-" : "asset-") + i.ToString("D4"),
                Site = Sites[random.Next(Sites.Length)],
                Cores = random.Next(6) == 0 ? null : 1 << random.Next(6),
                Seen = random.Next(9) == 0 ? null : Epoch.AddMinutes(-random.Next(100000)).AddMilliseconds(random.Next(1000)),
                Serial = random.Next(10) == 0 ? null : "SN-" + random.Next(100000, 999999),
                Purchased = random.Next(7) == 0 ? null : Epoch.AddDays(-random.Next(3000)),
                Weight = random.Next(8) == 0 ? null : Math.Round(random.NextDouble() * 40, 2),
                Notes = random.Next(3) == 0 ? null : "note " + i + (i % 5 == 0 ? " =HYPERLINK(\"x\")" : ""),
                Secret = "secret-" + i,
                ReplacesId = i > 3 && random.Next(4) == 0 ? random.Next(1, i) : null,
                GroupId = group?.Id,
                Group = group
            };
            group?.Members.Add(asset);
            var parts = i % 11 == 0 ? 0 : i % 13 == 0 ? 60 + random.Next(70) : random.Next(1, 14);
            for (var p = 0; p < parts; p++) asset.Parts.Add(new AssetPart {
                Id = ++part, AssetId = i, Name = "part " + random.Next(40), Vendor = Vendors[random.Next(Vendors.Length)],
                Quantity = random.Next(5) == 0 ? null : random.Next(1, 9), Installed = random.Next(6) == 0 ? null : Epoch.AddDays(-random.Next(50))
            });
            var events = i % 9 == 0 ? 0 : random.Next(1, 30);
            for (var e = 0; e < events; e++) asset.Events.Add(new AssetEvent {
                Id = ++item, AssetId = i, At = random.Next(7) == 0 ? null : Epoch.AddHours(-random.Next(40)),
                Summary = random.Next(10) == 0 ? (random.Next(2) == 0 ? null : "  ") : "Event " + random.Next(100),
                Actor = random.Next(3) == 0 ? null : "tech " + random.Next(5), Kind = Kinds[random.Next(Kinds.Length)]
            });
            var changes = random.Next(0, 22);
            for (var c = 0; c < changes; c++) asset.Changes.Add(new AssetChange {
                Id = ++change, AssetId = i, At = Epoch.AddDays(-random.Next(10)), Setting = "setting " + random.Next(6),
                Before = random.Next(4) == 0 ? null : "v" + random.Next(9), After = random.Next(4) == 0 ? null : "v" + random.Next(9)
            });
            assets.Add(asset);
        }
        foreach (var asset in assets) if (asset.ReplacesId != null) asset.Replaces = assets[asset.ReplacesId.Value - 1];
        return assets;
    }

    /// <summary>What the caller may read: every asset except those on the site "Hidden".</summary>
    public static IEnumerable<Asset> Scoped(IEnumerable<Asset> assets) => assets.Where(asset => asset.Site != "Hidden");

    public static CanopyDataGridView View() {
        var view = new CanopyDataGridView("assets", "Assets") { Source = CanopyGridSource.HostedOffset(), PageSize = 50, RowAction = CanopyGridRowAction.Details };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        view.Columns.Add(new CanopyColumn("cores", "Cores") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("seen", "Seen") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("group", "Group") { Sortable = true });
        view.Columns.Add(new CanopyColumn("display", "Display only"));
        var record = view.Record = new CanopyRecordPanel { Source = CanopyRecordSource.Host(), DeepLink = true };
        record.Fields.Add(new CanopyColumn("serial", "Serial number"));
        record.Fields.Add(new CanopyColumn("purchased", "Purchased") { Kind = CanopyColumnKind.DateTime });
        record.Fields.Add(new CanopyColumn("weight", "Weight") { Kind = CanopyColumnKind.Number });
        record.Fields.Add(new CanopyColumn("notes", "Notes"));
        record.Fields.Add(new CanopyColumn("secret", "Secret"));
        record.Fields.Add(new CanopyColumn("replaces", "Replaces"));
        record.Fields.Add(new CanopyColumn("parts", "Parts"));
        record.Fields.Add(new CanopyColumn("peers", "Group peers"));
        record.Fields.Add(new CanopyColumn("events", "Events"));
        record.Fields.Add(new CanopyColumn("changes", "Changes"));
        record.Fields.Add(new CanopyColumn("unmapped", "Declared but not served"));
        return view;
    }

    public static CanopyColumnMap<Asset> Columns(CanopyDataGridView view) => new CanopyColumnMap<Asset>(view)
        .Key(asset => asset.Id)
        .Column("name", asset => asset.Name)
        .Column("site", asset => asset.Site)
        .Column("cores", asset => asset.Cores)
        .Column("seen", asset => asset.Seen)
        .Column("group", asset => asset.Group!.Name);

    public static CanopyRecordMap<Asset> Records(CanopyColumnMap<Asset> columns) => new CanopyRecordMap<Asset>(columns)
        .Field("serial", asset => asset.Serial)
        .Field("purchased", asset => asset.Purchased)
        .Field("weight", asset => asset.Weight)
        .Field("notes", asset => asset.Notes)
        .Field("secret", asset => asset.Secret)
        .Link("replaces", asset => asset.ReplacesId, asset => asset.Replaces!.Name)
        .Cell("site", asset => asset.Site, site => site == null ? null : new CanopyCell(site) { Title = "Site " + site })
        .Collection("parts", asset => asset.Parts, list => list.Key(p => p.Id).OrderBy(p => p.Vendor).OrderBy(p => p.Installed, descending: true)
            .Column(new CanopyColumn("name", "Part"), p => p.Name)
            .Column(new CanopyColumn("vendor", "Vendor"), p => p.Vendor)
            .Column(new CanopyColumn("quantity", "Quantity") { Kind = CanopyColumnKind.Number }, p => p.Quantity)
            .Column(new CanopyColumn("installed", "Installed") { Kind = CanopyColumnKind.DateTime }, p => p.Installed)
            .PageSize(10))
        .Collection("peers", asset => asset.Group!.Members, list => list.Key(m => m.Id).OrderBy(m => m.Name)
            .Column(new CanopyColumn("name", "Name"), m => m.Name).Column(new CanopyColumn("site", "Site"), m => m.Site).Target("assets").PageSize(5))
        .Timeline("events", asset => asset.Events, events => events.Key(e => e.Id).Time(e => e.At).Summary(e => e.Summary).Actor(e => e.Actor)
            .Kind(e => e.Kind, kind => kind == "Failure" ? CanopyTone.Danger : CanopyTone.None).Limit(20))
        .Changes("changes", asset => asset.Changes, changes => changes.Key(c => c.Id).Name(c => c.Setting).Before(c => c.Before).After(c => c.After)
            .OrderBy(c => c.At, descending: true).Limit(15));

    /// <summary>A record handler over a record provider, with the fixed revision r1.</summary>
    public static CanopyRemoteHandler Handler(CanopyRecordMap<Asset> records, ICanopyRecordProvider provider, CanopyRemoteOptions? options = null) {
        var data = new CanopyQueryableProvider<Asset>(Array.Empty<Asset>().AsQueryable(), records.Columns, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        return new CanopyRemoteHandler(records.Columns.Schema, data, options, null, provider);
    }

    public static string Query(string id, string extra = "") =>
        "{\"protocol\":\"canopyx/2\",\"type\":\"gridRecordQuery\",\"view\":\"assets\",\"id\":" + RandomQueries.Json(id) + extra + "}";
}
