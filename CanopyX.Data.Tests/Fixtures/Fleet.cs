namespace CanopyX.Data.Tests;

public enum OsFamily { Windows, Linux, MacOs, FreeBsd }

public sealed class Owner {
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
}

public sealed class Host {
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Site { get; set; }
    public OsFamily Os { get; set; }
    public int? Cores { get; set; }
    public double Memory { get; set; }
    public bool Online { get; set; }
    public DateTime? LastSeen { get; set; }
    public int? OwnerId { get; set; }
    public Owner? Owner { get; set; }
    public string? Notes { get; set; }
}

/// <summary>A deterministic generic inventory with nulls, mixed case, wildcard characters and formula-like text.</summary>
public static class Fleet {
    public static readonly string?[] Sites = { "Berlin", "berlin", "Austin", "Oslo", "São Paulo", null, "Zürich", "oslo" };
    public static readonly string?[] Notes = { null, "50% capacity", "under_score", "quote's here", "=SUM(A1:A3)", "tab\there", "plain", "a\"b", "-negative", "Ünïcode" };
    public static readonly DateTime Epoch = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public static List<Owner> Owners() => Enumerable.Range(1, 6).Select(i => new Owner { Id = i, Name = "Team " + (char)('A' + i - 1) }).ToList();

    public static List<Host> Hosts(int count, bool asciiOnly = false, int seed = 7) {
        var random = new Random(seed);
        var owners = Owners();
        var hosts = new List<Host>(count);
        for (var i = 1; i <= count; i++) {
            var owner = random.Next(8) < 6 ? owners[random.Next(owners.Count)] : null;
            var site = Sites[random.Next(Sites.Length)];
            var note = Notes[random.Next(Notes.Length)];
            if (asciiOnly) {
                site = site?.Replace("ã", "a").Replace("ü", "u");
                note = note?.Replace("Ü", "U").Replace("ï", "i");
            }
            hosts.Add(new Host {
                Id = i,
                Name = (i % 3 == 0 ? "HOST-" : "host-") + i.ToString("D5"),
                Site = site,
                Os = (OsFamily)random.Next(4),
                Cores = random.Next(10) == 0 ? null : 1 << random.Next(7),
                Memory = Math.Round(random.NextDouble() * 512, 2),
                Online = random.Next(5) != 0,
                LastSeen = random.Next(12) == 0 ? null : Epoch.AddMinutes(-random.Next(0, 60 * 24 * 90)).AddMilliseconds(random.Next(1000)),
                OwnerId = owner?.Id,
                Owner = owner,
                Notes = note
            });
        }
        return hosts;
    }

    /// <summary>The grid definition: every kind, value lists, aggregates, an optional fixed grouping.</summary>
    /// <summary>The grid definition with runtime grouping: declared levels site then operating system, readers may regroup, and a distinct count.</summary>
    public static CanopyDataGridView DynamicView() {
        var view = View();
        view.Reporting!.Groupable = true;
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("site"));
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("os", descending: true));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("ownerDistinct", "owner", CanopyGridAggregateOperation.DistinctCount, "Owners"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("seenDistinct", "lastSeen", CanopyGridAggregateOperation.DistinctCount, "Distinct last seen"));
        return view;
    }

    /// <summary>The grid definition with editable columns, typed editors and validation; the owner (a navigation) stays read-only.</summary>
    public static CanopyDataGridView EditableView() {
        var view = View();
        void Edit(string id, CanopyCellEditor? editor = null, CanopyCellValidation? validation = null) {
            var column = view.Columns.First(item => item.Id == id);
            column.Editable = true;
            column.Editor = editor;
            column.Validation = validation;
        }
        Edit("name", null, new CanopyCellValidation { Required = true, MaxLength = 12, Pattern = "[A-Za-z0-9-]+" });
        Edit("site", CanopyCellEditor.Select("Berlin", "Austin", "Oslo", "Zurich"));
        Edit("os");
        Edit("cores", CanopyCellEditor.Number(1, 512, 1));
        Edit("memory", null, new CanopyCellValidation { Minimum = 0, Maximum = 1024 });
        Edit("online", CanopyCellEditor.Toggle());
        Edit("lastSeen", null, new CanopyCellValidation { Earliest = new DateTimeOffset(2020, 1, 1, 0, 0, 0, TimeSpan.Zero) });
        Edit("notes", null, new CanopyCellValidation { MinLength = 2, MaxLength = 64, Message = "Notes take 2 to 64 characters." });
        return view;
    }

    public static CanopyDataGridView View(bool grouped = false, bool explicitSearch = true, string groupColumn = "site") {
        var view = new CanopyDataGridView("fleet", "Fleet inventory") { Source = CanopyGridSource.HostedOffset(), PageSize = 50, Selection = CanopySelectionMode.Multiple };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        view.Columns.Add(new CanopyColumn("os", "Operating system") { Sortable = true });
        view.Columns.Add(new CanopyColumn("cores", "Cores") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("memory", "Memory (GB)") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("online", "Online") { Sortable = true });
        view.Columns.Add(new CanopyColumn("lastSeen", "Last seen") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Sortable = true });
        view.Columns.Add(new CanopyColumn("notes", "Notes") { Hidden = true });
        if (explicitSearch) foreach (var id in new[] { "name", "site", "os", "owner", "notes", "cores" }) view.SearchColumns.Add(id);
        view.Reporting = new CanopyGridReporting { FilterGroups = true };
        foreach (var id in new[] { "site", "os", "online", "cores", "owner", "memory", "lastSeen" }) view.Reporting.FacetColumns.Add(id);
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("coreCount", "cores", CanopyGridAggregateOperation.Count, "Hosts with cores"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("memorySum", "memory", CanopyGridAggregateOperation.Sum, "Memory"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("memoryAvg", "memory", CanopyGridAggregateOperation.Average, "Average memory"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("coresMin", "cores", CanopyGridAggregateOperation.Minimum, "Fewest cores"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("coresMax", "cores", CanopyGridAggregateOperation.Maximum, "Most cores"));
        if (grouped) view.Reporting.Grouping = new CanopyGridGrouping(groupColumn, groupColumn == "memory");
        return view;
    }

    public static CanopyColumnMap<Host> Map(CanopyDataGridView view) => new CanopyColumnMap<Host>(view)
        .Key(x => x.Id)
        .Column("name", x => x.Name)
        .Column("site", x => x.Site)
        .Column("os", x => x.Os)
        .Column("cores", x => x.Cores)
        .Column("memory", x => x.Memory)
        .Column("online", x => x.Online)
        .Column("lastSeen", x => x.LastSeen)
        .Column("owner", x => x.Owner!.Name)
        .Column("notes", x => x.Notes);

    public static CanopyInMemoryProvider<Host> Reference(CanopyDataSchema schema, IReadOnlyList<Host> hosts) =>
        new CanopyInMemoryProvider<Host>(schema, () => hosts, host => host.Id.ToString(System.Globalization.CultureInfo.InvariantCulture),
            new Dictionary<string, Func<Host, object?>> {
                ["name"] = x => x.Name, ["site"] = x => x.Site, ["os"] = x => x.Os, ["cores"] = x => x.Cores, ["memory"] = x => x.Memory,
                ["online"] = x => x.Online, ["lastSeen"] = x => x.LastSeen, ["owner"] = x => x.Owner?.Name, ["notes"] = x => x.Notes
            });
}
