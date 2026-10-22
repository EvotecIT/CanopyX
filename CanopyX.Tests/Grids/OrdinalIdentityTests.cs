using System.Text.Json;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class OrdinalIdentityTests {
    [Theory]
    [InlineData("none", true, false)]
    [InlineData("none", false, true)]
    [InlineData("single", true, true)]
    [InlineData("multiple", true, true)]
    public void SchemaSelectionControlsRequireASelectionMode(string selection, bool controls, bool valid) {
        var grid = new CanopyDataGridView("g", "Grid");
        grid.Columns.Add(new CanopyColumn("a", "A"));
        var json = ProtocolSchema.Mutate(grid.ToJson(), value => {
            value["selection"] = selection;
            value["reporting"] = new System.Text.Json.Nodes.JsonObject { ["selectionControls"] = controls };
        });
        Assert.Equal(valid, ProtocolSchema.Evaluate(json).IsValid);
    }

    private sealed record Attempt(string Message, int Count);

    [Fact]
    public void TypedOrdinalDataset_AssignsSourcePositionsWithoutInventedKeyColumns() {
        var grid = new CanopyDataGridView<Attempt>("attempts", "Attempts", CanopyGridRowIdentity.Ordinal);
        grid.Column(row => row.Message);
        grid.Column(row => row.Count);
        grid.AddRows(new[] { new Attempt("Retry", 2), new Attempt("Retry", 2) });
        grid.AddRows(new[] { new Attempt("Completed", 1) });
        Assert.Equal(new[] { "0", "1", "2" }, grid.View.Rows.Select(row => row.Id));
        Assert.Equal(new[] { "message", "count" }, grid.View.Columns.Select(column => column.Id));
        using var json = JsonDocument.Parse(grid.ToJson());
        Assert.Equal("ordinal", json.RootElement.GetProperty("rowIdentity").GetString());
        ProtocolSchema.AssertValid(grid.ToJson(), "ordinal dataset");
    }

    [Fact]
    public void StableKeys_RemainTheDefaultAndRequireASelectorInTypedGrids() {
        var grid = new CanopyDataGridView<Attempt>("attempts", "Attempts", row => row.Message);
        grid.Column(row => row.Message);
        Assert.Equal(CanopyGridRowIdentity.StableKey, grid.View.RowIdentity);
        Assert.DoesNotContain("rowIdentity", grid.ToJson());
        Assert.Throws<ArgumentException>(() => new CanopyDataGridView<Attempt>("attempts", "Attempts", CanopyGridRowIdentity.StableKey));
    }

    [Fact]
    public void OrdinalIdentity_RejectsKeyedLiveUpdatesWithAnActionableDiagnostic() {
        var grid = new CanopyDataGridView("attempts", "Attempts") {
            RowIdentity = CanopyGridRowIdentity.Ordinal, Live = new CanopyGridLive()
        };
        grid.Columns.Add(new CanopyColumn("message", "Message"));
        Assert.Contains("stable row keys", Assert.Throws<InvalidOperationException>(() => grid.ToJson()).Message);
        grid.Live = null;
        grid.Record = new CanopyRecordPanel { DeepLink = true };
        Assert.Contains("record deep links require stable row keys", Assert.Throws<InvalidOperationException>(() => grid.ToJson()).Message);
    }

    [Fact]
    public void IdentitySchema_RejectsUnknownModesAndSupportsReadOnlySelection() {
        var grid = new CanopyDataGridView("attempts", "Attempts") {
            RowIdentity = CanopyGridRowIdentity.Ordinal, Selection = CanopySelectionMode.None
        };
        grid.Columns.Add(new CanopyColumn("message", "Message"));
        ProtocolSchema.AssertValid(grid.ToJson(), "read-only ordinal dataset");
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(grid.ToJson(), value => value["live"] = new System.Text.Json.Nodes.JsonObject())).IsValid);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(grid.ToJson(), value => value["rowIdentity"] = "unstable")).IsValid);
        grid.RowIdentity = (CanopyGridRowIdentity)99;
        Assert.Throws<ArgumentOutOfRangeException>(() => grid.ToJson());
    }

    [Fact]
    public void ReadOnlySelection_RejectsContradictoryControlsAndTreeUse() {
        var grid = new CanopyDataGridView("attempts", "Attempts") {
            Selection = CanopySelectionMode.None, Reporting = new CanopyGridReporting { SelectionControls = true }
        };
        grid.Columns.Add(new CanopyColumn("message", "Message"));
        Assert.Contains("enabled row selection", Assert.Throws<InvalidOperationException>(() => grid.ToJson()).Message);
        var tree = new CanopyTreeView("events", "Events") { Selection = CanopySelectionMode.None };
        Assert.Contains("flat grids only", Assert.Throws<InvalidOperationException>(() => tree.ToJson()).Message);
    }
}
