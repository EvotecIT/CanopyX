using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Nodes;

/// <summary>A cell's sort key is written beside its value, in UTC for dates, and only within the protocol's limits.</summary>
public sealed class CellSortKeyTests {
    [Fact]
    public void SortKey_TextNumberOrDate_IsWrittenBesideTheValue() {
        var view = new CanopyDataGridView("runs", "Runs");
        view.Columns.Add(new CanopyColumn("run", "Run") { Sortable = true });
        var row = new CanopyGridRow("a");
        row.Cells["run"] = new CanopyCell("Nightly #7") { SortKey = new DateTime(2026, 10, 14, 11, 5, 0, DateTimeKind.Utc) };
        view.Rows.Add(row);
        var number = new CanopyGridRow("b");
        number.Cells["run"] = new CanopyCell("Nightly #8") { SortKey = 42 };
        view.Rows.Add(number);
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "sort keys");
        Assert.Contains("{\"value\":\"Nightly #7\",\"sort\":\"2026-10-14T11:05:00.000Z\"}", json);
        Assert.Contains("{\"value\":\"Nightly #8\",\"sort\":42}", json);
    }

    [Fact]
    public void SortKey_Dates_AreStoredInUtc() {
        var local = new DateTime(2026, 10, 14, 11, 5, 0, DateTimeKind.Local);
        Assert.Equal(local.ToUniversalTime(), (DateTime)new CanopyCell("x") { SortKey = local }.SortKey!);
        var unspecified = new DateTime(2026, 10, 14, 11, 5, 0, DateTimeKind.Unspecified);
        var stored = (DateTime)new CanopyCell("x") { SortKey = unspecified }.SortKey!;
        Assert.Equal(DateTimeKind.Utc, stored.Kind);
        Assert.Equal(unspecified.Ticks, stored.Ticks);
        Assert.Equal(new DateTime(2026, 10, 14, 9, 5, 0, DateTimeKind.Utc), new CanopyCell("x") { SortKey = new DateTimeOffset(2026, 10, 14, 11, 5, 0, TimeSpan.FromHours(2)) }.SortKey);
    }

    [Fact]
    public void SortKey_OutsideTheProtocol_IsRejected() {
        Assert.Throws<ArgumentException>(() => new CanopyCell("x") { SortKey = new object() });
        Assert.Throws<ArgumentException>(() => new CanopyCell("x") { SortKey = double.NaN });
        Assert.Throws<ArgumentException>(() => new CanopyCell("x") { SortKey = double.PositiveInfinity });
        Assert.Throws<InvalidOperationException>(() => Write(new CanopyCell("x") { SortKey = new string('k', 4097) }));
        Assert.Throws<InvalidOperationException>(() => Write(new CanopyCell("x") { SortKey = 1e300 }));
        Assert.Throws<InvalidOperationException>(() => Write(new CanopyCell("x") { SortKey = 9007199254740992L }));
    }

    private static string Write(CanopyCell cell) =>
        new CanopyDataGridView("long", "Long") { Columns = { new CanopyColumn("run", "Run") }, Rows = { new CanopyGridRow("a") { Cells = { ["run"] = cell } } } }.ToJson();
}
