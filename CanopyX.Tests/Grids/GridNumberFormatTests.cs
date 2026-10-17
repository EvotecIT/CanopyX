using CanopyX.Rendering;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridNumberFormatTests {
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("devices", "Devices") { Reporting = new CanopyGridReporting { Grouping = new CanopyGridGrouping("site") } };
        view.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        view.Columns.Add(new CanopyColumn("patch", "Patch level") { Kind = CanopyColumnKind.Number, Format = CanopyGridNumberFormat.Fixed(0, suffix: "%") });
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("patch-average", "patch", CanopyGridAggregateOperation.Average, "Average patch level"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("patch-minimum", "patch", CanopyGridAggregateOperation.Minimum, "Lowest patch level",
            new CanopyGridNumberFormat(1, 2, suffix: " pct")));
        return view;
    }

    [Fact]
    public void ColumnAndAggregateFormats_AreWrittenAsValidOptionalProtocolFields() {
        var view = View();
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "formatted grid");
        using var document = JsonDocument.Parse(json);
        var column = document.RootElement.GetProperty("columns")[1].GetProperty("format");
        Assert.Equal(0, column.GetProperty("minimumFractionDigits").GetInt32());
        Assert.Equal(0, column.GetProperty("maximumFractionDigits").GetInt32());
        Assert.Equal("%", column.GetProperty("suffix").GetString());
        Assert.False(column.TryGetProperty("prefix", out _));
        var aggregates = document.RootElement.GetProperty("reporting").GetProperty("aggregates");
        Assert.False(aggregates[0].TryGetProperty("format", out _));
        Assert.Equal("Lowest patch level", aggregates[1].GetProperty("label").GetString());
        Assert.Equal(2, aggregates[1].GetProperty("format").GetProperty("maximumFractionDigits").GetInt32());
        Assert.Equal(" pct", aggregates[1].GetProperty("format").GetProperty("suffix").GetString());
    }

    [Fact]
    public void Format_RoundsHalfAwayFromZeroAndPlacesThePrefixAfterTheSign() {
        Assert.Equal("77%", CanopyGridNumberFormat.Fixed(0, suffix: "%").Format(77.042));
        Assert.Equal("1,234.50 €", CanopyGridNumberFormat.Fixed(2, suffix: " €").Format(1234.5));
        Assert.Equal("-$3.5", new CanopyGridNumberFormat(0, 1, "$").Format(-3.46));
        Assert.Equal("0%", CanopyGridNumberFormat.Fixed(0, suffix: "%").Format(-0.4));
        Assert.Equal("3", new CanopyGridNumberFormat().Format(2.9999));
        Assert.Equal("2.5", new CanopyGridNumberFormat().Format(2.5));
    }

    [Fact]
    public void InvalidFormats_AreRejected() {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridNumberFormat(3, 2));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridNumberFormat(0, 11));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridNumberFormat(-1, 2));
        Assert.Throws<ArgumentException>(() => new CanopyGridNumberFormat(prefix: ""));
        Assert.Throws<ArgumentException>(() => new CanopyGridNumberFormat(suffix: new string('x', 17)));
        var view = View(); view.GetColumn("site").Format = CanopyGridNumberFormat.Fixed(0);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Schema_RejectsAMinimumAboveTheEffectiveMaximum(bool explicitMaximum) {
        var json = ProtocolSchema.Mutate(View().ToJson(), root => {
            var format = root["columns"]![1]!["format"]!.AsObject();
            format["minimumFractionDigits"] = 4;
            if (explicitMaximum) format["maximumFractionDigits"] = 3;
            else format.Remove("maximumFractionDigits");
        });
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
    }

    [Fact]
    public void StaticGrid_FormatsRawNumbersWithTheColumnFormatAndKeepsHostText() {
        var view = View();
        view.Rows.Add(new CanopyGridRow("one") { Cells = { ["site"] = "Warsaw", ["patch"] = 88.4 } });
        view.Rows.Add(new CanopyGridRow("two") { Cells = { ["site"] = "Warsaw", ["patch"] = new CanopyCell(55) { Text = "Fifty-five" } } });
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Equal("88%", result.Rows[0][1]);
        Assert.Equal("Fifty-five", result.Rows[1][1]);
    }

    [Fact]
    public void MaximumFiniteNumber_PreservesTheExactIntegerWithoutScientificRounding() {
        var expected = new System.Numerics.BigInteger(double.MaxValue).ToString("N0", System.Globalization.CultureInfo.InvariantCulture) + ".00";
        Assert.Equal(expected, CanopyGridNumberFormat.Fixed(2).Format(double.MaxValue));
    }
}
