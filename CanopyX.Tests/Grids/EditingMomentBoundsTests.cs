using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Editable date bounds use the same UTC millisecond wire precision as native date cells.</summary>
public sealed class EditingMomentBoundsTests {
    [Theory]
    [InlineData(false, 0, 0)]
    [InlineData(true, 0, 0)]
    [InlineData(false, 789, 0)]
    [InlineData(true, 789, 0)]
    [InlineData(false, 789, 1234)]
    [InlineData(true, 789, 1234)]
    public void DateBounds_UseCanonicalUtcCellPrecision(bool offset, int milliseconds, int extraTicks) {
        var instant = new DateTimeOffset(2026, 3, 28, 12, 34, 56, milliseconds, TimeSpan.Zero).AddTicks(extraTicks);
        if (offset) instant = instant.ToOffset(TimeSpan.FromHours(2));
        var view = new CanopyDataGridView("moments", "Moment bounds");
        view.Columns.Add(new CanopyColumn("value", "Value") {
            Kind = CanopyColumnKind.DateTime, Editable = true, Editor = CanopyCellEditor.DateTime(),
            Validation = new CanopyCellValidation { Earliest = instant, Latest = instant }
        });
        var row = new CanopyGridRow("a");
        row.Cells["value"] = new CanopyCell(instant.UtcDateTime);
        view.Rows.Add(row);

        var expected = milliseconds == 0 ? "2026-03-28T12:34:56Z" : "2026-03-28T12:34:56.789Z";
        var json = view.ToJson();
        Assert.Contains("\"min\":\"" + expected + "\"", json);
        Assert.Contains("\"max\":\"" + expected + "\"", json);
        Assert.Contains("\"value\":\"" + expected + "\"", json);
    }
}
