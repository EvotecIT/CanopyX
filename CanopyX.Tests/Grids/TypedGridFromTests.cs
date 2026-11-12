using System.Collections;
using System.Data;
using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>One-call grids: columns derived from properties, dictionary keys or data columns, and their keys.</summary>
public sealed class TypedGridFromTests {
    public enum Health { Healthy, Degraded }

    public sealed class Owner {
        public string Name { get; set; } = "";
    }

    public sealed class Server {
        [CanopyKey] public int AssetNumber { get; set; }
        public string HostName { get; set; } = "";
        [CanopyColumn(Title = "Disk", Format = "N0", Order = -1)] public long DiskBytes { get; set; }
        public DateTime LastSeenUtc { get; set; }
        public Health Health { get; set; }
        public bool? Online { get; set; }
        [CanopyColumn(Hidden = true)] public Guid Tag { get; set; }
        [CanopyIgnore] public string Secret { get; set; } = "";
        public Owner? Owner { get; set; }
        [CanopyColumn(Title = "Owned by")] public Owner? Contact { get; set; }
        public string this[int index] => HostName;
    }

    public sealed class Plain {
        public string Name { get; set; } = "";
    }

    public sealed class TwoKeys {
        [CanopyKey] public string A { get; set; } = "";
        [CanopyKey] public string B { get; set; } = "";
    }

    private static Server[] Servers() => new[] {
        new Server { AssetNumber = 10, HostName = "web-01", DiskBytes = 1_500_000, LastSeenUtc = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc), Health = Health.Degraded,
            Online = true, Tag = Guid.Empty, Secret = "x", Owner = new Owner { Name = "Ops" }, Contact = null },
        new Server { AssetNumber = 2, HostName = "db-01", DiskBytes = 20, Online = null }
    };

    [Fact]
    public void From_DerivesColumnsFromPropertiesAndAttributes() {
        var grid = CanopyDataGridView.From(Servers());
        Assert.Equal("server", grid.View.Id);
        Assert.Equal("Server", grid.View.Label);
        Assert.Equal(new[] { "diskBytes", "assetNumber", "hostName", "lastSeenUtc", "health", "online", "tag", "contact" }, grid.View.Columns.Select(column => column.Id));
        var columns = grid.View.Columns.ToDictionary(column => column.Id);
        Assert.Equal("Disk", columns["diskBytes"].Title);
        Assert.Equal("Last seen utc", columns["lastSeenUtc"].Title);
        Assert.Equal("Owned by", columns["contact"].Title);
        Assert.Equal(CanopyColumnKind.Number, columns["diskBytes"].Kind);
        Assert.Equal(CanopyColumnKind.DateTime, columns["lastSeenUtc"].Kind);
        Assert.Equal(CanopyColumnKind.Text, columns["health"].Kind);
        Assert.True(columns["tag"].Hidden);
        Assert.False(columns["hostName"].Hidden);

        var row = grid.View.Rows[0];
        Assert.Equal("10", row.Id);
        Assert.Equal(1_500_000L, row.Cells["diskBytes"].Value);
        Assert.Equal("1,500,000", row.Cells["diskBytes"].Text);
        Assert.Equal("Degraded", row.Cells["health"].Value);
        Assert.True((bool)row.Cells["online"].Value!);
        Assert.False(row.Cells.ContainsKey("contact"));
        Assert.False(grid.View.Rows[1].Cells.ContainsKey("online"));
        Assert.Equal("2", grid.View.Rows[1].Id);
        grid.View.Validate();
    }

    [Fact]
    public void From_TakesAKeyBySelectorOrNameAndNumbersKeylessRecords() {
        Assert.Equal(new[] { "web-01", "db-01" }, CanopyDataGridView.From(Servers(), x => x.HostName).View.Rows.Select(row => row.Id));
        Assert.Equal(new[] { "web-01", "db-01" }, CanopyDataGridView.From(Servers(), "hostname").View.Rows.Select(row => row.Id));
        var keyless = CanopyDataGridView.From(new[] { new Plain { Name = "a" }, new Plain { Name = "b" } }, id: "plain", label: "Plain rows");
        Assert.Equal(CanopyGridRowIdentity.Ordinal, keyless.View.RowIdentity);
        Assert.Equal(new[] { "0", "1" }, keyless.View.Rows.Select(row => row.Id));
        Assert.Equal("Plain rows", keyless.View.Label);
        Assert.Throws<ArgumentException>(() => CanopyDataGridView.From(Servers(), "missing"));
        Assert.Throws<InvalidOperationException>(() => CanopyDataGridView.From(new[] { new TwoKeys() }));
        Assert.Throws<ArgumentNullException>(() => CanopyDataGridView.From((IEnumerable<Plain>)null!));
    }

    [Fact]
    public void From_ReadsDictionaryRowsByKey() {
        var rows = new IDictionary[] {
            new Hashtable { ["Name"] = "a", ["Size"] = 1, ["Mixed"] = 1 },
            new Dictionary<string, object?> { ["Name"] = "b", ["LastSeen"] = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), ["Mixed"] = "two", ["Size"] = null }
        };
        var grid = CanopyDataGridView.From(rows, "Name", "rows", "Rows");
        var columns = grid.View.Columns.ToDictionary(column => column.Id);
        Assert.Equal(4, columns.Count);
        Assert.Equal(CanopyColumnKind.Number, columns["Size"].Kind);
        Assert.Equal(CanopyColumnKind.DateTime, columns["LastSeen"].Kind);
        Assert.Equal("Last seen", columns["LastSeen"].Title);
        Assert.Equal(CanopyColumnKind.Text, columns["Mixed"].Kind);
        Assert.Equal(new[] { "a", "b" }, grid.View.Rows.Select(row => row.Id));
        Assert.False(grid.View.Rows[0].Cells.ContainsKey("LastSeen"));
        Assert.False(grid.View.Rows[1].Cells.ContainsKey("Size"));
        Assert.Equal(1L, grid.View.Rows[0].Cells["Size"].Value);
    }

    [Fact]
    public void From_ReadsADataTableWithItsPrimaryKeyAndCaptions() {
        var table = new DataTable("hosts");
        var id = table.Columns.Add("HostId", typeof(int));
        table.Columns.Add("DiskFree", typeof(double)).Caption = "Free space";
        table.Columns.Add("LastSeen", typeof(DateTime));
        table.PrimaryKey = new[] { id };
        table.Rows.Add(7, 1.5, DBNull.Value);
        table.Rows.Add(8, 2.5, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        table.AcceptChanges();
        table.Rows[1].Delete();
        var grid = CanopyDataGridView.From(table);
        Assert.Equal("hosts", grid.View.Id);
        Assert.Equal(new[] { "Host id", "Free space", "Last seen" }, grid.View.Columns.Select(column => column.Title));
        Assert.Equal(new[] { CanopyColumnKind.Number, CanopyColumnKind.Number, CanopyColumnKind.DateTime }, grid.View.Columns.Select(column => column.Kind));
        var row = Assert.Single(grid.View.Rows);
        Assert.Equal("7", row.Id);
        Assert.False(row.Cells.ContainsKey("LastSeen"));
        Assert.Throws<ArgumentException>(() => CanopyDataGridView.From(table, "Nope"));
    }

    [Fact]
    public void ToStaticHtml_WritesWhatTheStaticRendererWrites() {
        var grid = CanopyDataGridView.From(Servers());
        Assert.Equal(CanopyStaticHtml.RenderGrid(grid.View), grid.ToStaticHtml());
        var tree = new CanopyTreeView("files", "Files");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        tree.Roots.Add(new CanopyNode("root", "Root"));
        Assert.Equal(CanopyStaticHtml.Render(tree), tree.ToStaticHtml());
    }
}
