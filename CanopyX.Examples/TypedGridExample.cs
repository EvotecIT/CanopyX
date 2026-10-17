using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// A grid authored from a typed record (docs/typed-grids.md): columns come from member expressions, so renaming a member
/// changes the grid with it or fails the build, and the rows come straight from the records. typed-grid.html.
/// </summary>
internal static class TypedGridExample {
    internal enum Health { Healthy, Degraded, Down }

    internal sealed class Owner {
        public string Team { get; set; } = string.Empty;
        public string Contact { get; set; } = string.Empty;
    }

    internal sealed class Server {
        public string HostName { get; set; } = string.Empty;
        public string Site { get; set; } = string.Empty;
        public Owner Owner { get; set; } = new Owner();
        public Health Health { get; set; }
        public int Cores { get; set; }
        public double LoadAverage { get; set; }
        public long DiskBytes { get; set; }
        public DateTime LastSeenUtc { get; set; }
        public string? Notes { get; set; }
    }

    private static readonly string[] Sites = { "Oslo", "Lyon", "Rome", "Porto", "Gdansk" };
    private static readonly string[] Teams = { "Platform", "Data", "Identity", "Network" };
    private static readonly string[] Contacts = { "Ada", "Brook", "Casey", "Dana", "Eli" };

    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            Create().View.SaveHtmlPage(Path.Combine(output, "typed-grid" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"),
                new CanopyHtmlOptions { Title = "Servers from typed records", Theme = theme, Height = "600px" });
        }
    }

    internal static CanopyDataGridView<Server> Create() {
        var grid = new CanopyDataGridView<Server>("typed-servers", "Servers", server => server.HostName);
        grid.View.Selection = CanopySelectionMode.Multiple;
        grid.View.PageSize = 200;
        grid.View.Noun = "servers";
        grid.View.RowAction = CanopyGridRowAction.Details;
        grid.Column(x => x.HostName, "Server", column => { column.Sortable = true; column.RowHeader = true; });
        grid.Column(x => x.Site, configure: column => column.Sortable = true);
        grid.Column(x => x.Owner.Team, "Team", column => column.Sortable = true);
        grid.Column(x => x.Health, configure: column => {
            column.Sortable = true;
            column.Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> { ["Down"] = CanopyTone.Danger, ["Degraded"] = CanopyTone.Warning, ["Healthy"] = CanopyTone.Success });
        });
        grid.Column(x => x.Cores, configure: column => column.Sortable = true);
        grid.Column(x => x.LoadAverage, "Load", column => column.Sortable = true, load => new CanopyCell(load) { Text = load.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) });
        grid.Column(x => x.DiskBytes, "Disk", column => column.Sortable = true, bytes => new CanopyCell(bytes) { Text = (bytes / 1_000_000_000L).ToString("N0", System.Globalization.CultureInfo.InvariantCulture) + " GB" });
        grid.Column(x => x.LastSeenUtc, "Last seen", column => column.Sortable = true);
        // Drawer-only values, and settings that name columns through the same members.
        grid.Field(x => x.Owner.Contact, "Contact");
        grid.Field(x => x.Notes);
        grid.View.FacetPanel = new CanopyFacetPanel().Add(grid.ColumnId(x => x.Site)).Add(grid.ColumnId(x => x.Health)).Add(grid.ColumnId(x => x.LoadAverage));
        return grid.AddRows(Servers());
    }

    private static IEnumerable<Server> Servers() {
        var random = new Random(41);
        var start = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
        for (var i = 1; i <= 120; i++) {
            var roll = random.Next(20);
            yield return new Server {
                HostName = "srv-" + i.ToString("000", System.Globalization.CultureInfo.InvariantCulture),
                Site = Sites[i % Sites.Length],
                Owner = new Owner { Team = Teams[random.Next(Teams.Length)], Contact = Contacts[random.Next(Contacts.Length)] },
                Health = roll == 0 ? Health.Down : roll < 4 ? Health.Degraded : Health.Healthy,
                Cores = 4 << random.Next(4),
                LoadAverage = Math.Round(random.NextDouble() * 6, 2),
                DiskBytes = (long)(random.Next(200, 8000)) * 1_000_000_000L,
                LastSeenUtc = start.AddMinutes(random.Next(60 * 24 * 30)),
                Notes = roll < 4 ? "Watch the fan speed after the last firmware update." : null
            };
        }
    }
}
