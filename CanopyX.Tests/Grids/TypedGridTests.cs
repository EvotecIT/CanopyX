#if NET6_0_OR_GREATER
using System.Text.Json.Nodes;
using CanopyX.Tests.Protocol;
#endif
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Typed grids: columns from member expressions and rows from typed records, over the untyped grid.</summary>
public sealed class TypedGridTests {
    public enum Health { Healthy, Degraded }

    public sealed class Team {
        public string Name { get; set; } = "";
    }

    public sealed class Server {
        public string HostName { get; set; } = "";
        public Team Team { get; set; } = new Team();
        public int Cores { get; set; }
        public long DiskBytes { get; set; }
        public double LoadAverage { get; set; }
        public decimal Cost { get; set; }
        public bool Patched { get; set; }
        public DateTime LastSeenUtc { get; set; }
        public DateTimeOffset? RetiresAt { get; set; }
        public Health State { get; set; }
        public string? Notes { get; set; }
        public Team? Backup { get; set; }
        public string Url { get; set; } = "";
        public string UserID { get; set; } = "";
        public string IPAddress { get; set; } = "";
        public string TeamName { get; set; } = "";
        public ulong Huge { get; set; }
        public float Ratio { get; set; }
        public Guid Key { get; set; }
#if NET6_0_OR_GREATER
        public DateOnly Installed { get; set; }
#endif
    }

    private static Server[] Servers() => new[] {
        new Server { HostName = "web-01", Team = new Team { Name = "Platform" }, Cores = 8, DiskBytes = 5_000_000_000_000, LoadAverage = 0.5, Cost = 12.25m,
            Patched = true, LastSeenUtc = new DateTime(2026, 7, 1, 8, 30, 0, DateTimeKind.Utc), State = Health.Degraded, Notes = "Replaced fan",
#if NET6_0_OR_GREATER
            Installed = new DateOnly(2024, 3, 9),
#endif
        },
        new Server { HostName = "db-01", Team = new Team { Name = "Data" }, Cores = 32, LastSeenUtc = new DateTime(2026, 7, 2, 0, 0, 0, DateTimeKind.Unspecified) }
    };

    [Fact]
    public void Column_TakesItsIdTitleAndKindFromTheMember() {
        var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
        grid.Column(x => x.HostName);
        grid.Column(x => x.Team.Name);
        grid.Column(x => x.Cores);
        grid.Column(x => x.LastSeenUtc);
        grid.Column(x => x.RetiresAt);
        grid.Column(x => x.State);
        Assert.Equal(new[] { "hostName", "teamName", "cores", "lastSeenUtc", "retiresAt", "state" }, grid.View.Columns.Select(column => column.Id));
        Assert.Equal(new[] { "Host name", "Team name", "Cores", "Last seen utc", "Retires at", "State" }, grid.View.Columns.Select(column => column.Title));
        Assert.Equal(new[] { CanopyColumnKind.Text, CanopyColumnKind.Text, CanopyColumnKind.Number, CanopyColumnKind.DateTime, CanopyColumnKind.DateTime, CanopyColumnKind.Text },
            grid.View.Columns.Select(column => column.Kind));
        Assert.Equal("teamName", grid.ColumnId(x => x.Team.Name));
    }

    [Fact]
    public void Column_AppliesSettingsAndAnExplicitIdOrCell() {
        var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
        var host = grid.Column(x => x.HostName, "Server", column => column.Sortable = true);
        grid.Column("owner", x => x.Team.Name.ToUpperInvariant());
        grid.Column(x => x.Cores, cell: cores => new CanopyCell(cores) { Text = cores + " cores" });
        Assert.Equal("Server", host.Title);
        Assert.True(host.Sortable);
        Assert.Equal("owner", grid.View.Columns[1].Id);
        var row = grid.Row(Servers()[0]);
        Assert.Equal("PLATFORM", row.Cells["owner"].Value);
        Assert.Equal("8 cores", row.Cells["cores"].Text);
    }

    [Fact]
    public void Column_RefusesExpressionsThatAreNotMembersAndDuplicateIds() {
        var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
        Assert.Throws<ArgumentException>(() => grid.Column(x => x.Cores + 1));
        Assert.Throws<ArgumentException>(() => grid.Column(x => "constant"));
        grid.Column(x => x.Cores);
        Assert.Throws<ArgumentException>(() => grid.Column(x => x.Cores));
        Assert.Throws<ArgumentNullException>(() => new CanopyDataGridView<Server>("servers", "Servers", (Func<Server, string>)null!));
        Assert.Throws<ArgumentNullException>(() => grid.AddRows(null!));
    }

    [Fact]
    public void AddRows_WritesTypedCellsAndLeavesNullValuesEmpty() {
        var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
        grid.Column(x => x.HostName);
        grid.Column(x => x.Cores);
        grid.Column(x => x.DiskBytes);
        grid.Column(x => x.LoadAverage);
        grid.Column(x => x.Cost);
        grid.Column(x => x.Patched);
        grid.Column(x => x.LastSeenUtc);
        grid.Column(x => x.RetiresAt);
        grid.Column(x => x.State);
        grid.Column(x => x.Notes);
        grid.AddRows(Servers());
        Assert.Equal(2, grid.View.Rows.Count);
        var first = grid.View.Rows[0].Cells;
        Assert.Equal(8L, first["cores"].Value);
        Assert.Equal(5_000_000_000_000L, first["diskBytes"].Value);
        Assert.Equal(12.25m, first["cost"].Value);
        Assert.Equal(true, first["patched"].Value);
        Assert.Equal("Degraded", first["state"].Value);
        Assert.False(first.ContainsKey("retiresAt"));
        var second = grid.View.Rows[1];
        Assert.Equal("db-01", second.Id);
        Assert.False(second.Cells.ContainsKey("notes"));
        Assert.Equal(DateTimeKind.Utc, ((DateTime)second.Cells["lastSeenUtc"].Value!).Kind);
#if NET6_0_OR_GREATER
        var cells = JsonNode.Parse(grid.ToJson())!["rows"]![0]!["cells"]!;
        Assert.Equal("web-01", (string)cells["hostName"]!);
        Assert.Equal(8, (long)cells["cores"]!);
        Assert.Equal(5_000_000_000_000, (long)cells["diskBytes"]!);
        Assert.Equal(0.5, (double)cells["loadAverage"]!);
        Assert.Equal(12.25m, (decimal)cells["cost"]!);
        Assert.True((bool)cells["patched"]!);
        Assert.Equal("Degraded", (string)cells["state"]!);
        Assert.Null(cells["retiresAt"]);
        ProtocolSchema.AssertValid(grid.ToJson(), "a typed grid");
#endif
    }

#if NET6_0_OR_GREATER
    [Fact]
    public void Column_WritesADateOnlyMemberAsAUtcDate() {
        var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
        grid.Column(x => x.Installed);
        Assert.Equal(CanopyColumnKind.DateTime, grid.View.Columns[0].Kind);
        Assert.Equal(new DateTime(2024, 3, 9, 0, 0, 0, DateTimeKind.Utc), grid.Row(Servers()[0]).Cells["installed"].Value);
    }
#endif

    [Fact]
    public void Column_KeepsAcronymsInIdsAndTitles() {
        var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
        grid.Column(x => x.Url);
        grid.Column(x => x.UserID);
        grid.Column(x => x.IPAddress);
        grid.Column(x => x.Backup!.Name);
        Assert.Equal(new[] { "url", "userID", "ipAddress", "backupName" }, grid.View.Columns.Select(column => column.Id));
        Assert.Equal(new[] { "Url", "User ID", "IP address", "Backup name" }, grid.View.Columns.Select(column => column.Title));
    }

    [Fact]
    public void Row_LeavesACellEmptyWhenALinkOfItsChainIsNull() {
        var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
        grid.Column(x => x.Backup!.Name);
        grid.Column(x => x.RetiresAt!.Value.Year);
        grid.Field(x => x.Backup!.Name.Length);
        var row = grid.Row(Servers()[0]);
        Assert.Empty(row.Cells);
        Assert.False(row.HasFields);
        var withBackup = Servers()[0];
        withBackup.Backup = new Team { Name = "Ops" };
        withBackup.RetiresAt = new DateTimeOffset(2030, 1, 2, 0, 0, 0, TimeSpan.Zero);
        row = grid.Row(withBackup);
        Assert.Equal("Ops", row.Cells["backupName"].Value);
        Assert.Equal(2030L, row.Cells["retiresAtValueYear"].Value);
        Assert.Equal(3L, row.Fields["backupNameLength"].Value);
    }

    [Fact]
    public void Cell_WritesWideNumbersFloatsAndOtherValuesExactly() {
        var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
        grid.Column(x => x.Huge);
        grid.Column(x => x.Ratio);
        grid.Column(x => x.Key);
        // The kind follows the member, also through an expression typed as object.
        grid.Column<object>(x => x.Cores);
        var server = Servers()[0];
        server.Huge = ulong.MaxValue; server.Ratio = 1.1f; server.Key = new Guid("6f9619ff-8b86-d011-b42d-00cf4fc964ff");
        var cells = grid.Row(server).Cells;
        Assert.Equal((decimal)ulong.MaxValue, cells["huge"].Value);
        Assert.Equal(1.1, cells["ratio"].Value);
        Assert.Equal("6f9619ff-8b86-d011-b42d-00cf4fc964ff", cells["key"].Value);
        Assert.Equal(CanopyColumnKind.Text, grid.View.Columns[2].Kind);
        Assert.Equal(CanopyColumnKind.Number, grid.View.Columns[3].Kind);
        Assert.Equal(8L, cells["cores"].Value);
    }

    [Fact]
    public void Field_RefusesAnIdAColumnHasAndTakesAnExplicitId() {
        var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
        grid.Column(x => x.Team.Name);
        Assert.Throws<ArgumentException>(() => grid.Field(x => x.TeamName));
        Assert.Throws<ArgumentException>(() => grid.Column(x => x.TeamName));
        grid.Field("teamLabel", x => x.TeamName);
        Assert.Throws<ArgumentException>(() => grid.Column("teamLabel", x => x.TeamName));
        Assert.Throws<ArgumentNullException>(() => grid.Column<string>(null!));
        Assert.Equal("teamLabel", grid.View.Record!.Fields[0].Id);
    }

    [Fact]
    public void Field_AddsRecordPanelValuesThatAreNotColumns() {
        var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
        grid.Column(x => x.HostName);
        grid.Field(x => x.Notes, "Notes", field => field.Section = "Service");
        Assert.Single(grid.View.Columns);
        Assert.Equal("notes", Assert.Single(grid.View.Record!.Fields).Id);
        Assert.Equal("Replaced fan", grid.Row(Servers()[0]).Fields["notes"].Value);
        Assert.False(grid.Row(Servers()[1]).HasFields);
        Assert.Throws<ArgumentException>(() => grid.Field(x => x.Notes));
    }

    [Fact]
    public void TypedGrid_GoesWhereverTheUntypedGridGoes() {
        var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
        grid.Column(x => x.HostName);
        grid.View.PageSize = 50;
        CanopyDataGridView untyped = grid;
        Assert.Same(grid.View, untyped);
        Assert.Equal(untyped.ToJson(), grid.ToJson());
    }
}
