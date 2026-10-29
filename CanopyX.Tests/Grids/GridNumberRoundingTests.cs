using System;
using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Explicit display formats round the binary64 wire value consistently with browser fixed-point formatting.</summary>
public sealed class GridNumberRoundingTests {
    [Theory]
    [InlineData("ROUND(150000, -5)", 199999.99999999997)]
    [InlineData("ROUND(-150000, -5)", -199999.99999999997)]
    public void CalculationRound_UsesTheSameDecimalScaleOnTheLegacyClr(string expression, double expected) {
        var result = CanopyCalculation.Parse(expression).Evaluate(_ => null);
        Assert.Null(result.Error);
        Assert.Equal(expected, result.Value);
    }

    [Theory]
    [InlineData(2.675, "2.67")]
    [InlineData(-2.675, "-2.67")]
    [InlineData(0.125, "0.13")]
    [InlineData(-0.125, "-0.13")]
    [InlineData(-0.004, "0.00")]
    [InlineData(9007199254740991d, "9,007,199,254,740,991.00")]
    [InlineData(1e21 + 1e6, "1,000,000,000,000,001,048,576.00")]
    [InlineData(-(1e21 + 1e6), "-1,000,000,000,000,001,048,576.00")]
    public void FixedDigits_RoundTheActualBinary64ValueWithoutAnotherRounding(double value, string expected) {
        Assert.Equal(expected, CanopyGridNumberFormat.Fixed(2).Format(value));
    }

    [Fact]
    public void StaticGrid_UsesCanonicalDecimalWireConversionAtTheLegacyClrBoundary() {
        var view = new CanopyDataGridView("number", "Number");
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Format = CanopyGridNumberFormat.Fixed(10) });
        view.Rows.Add(new CanopyGridRow("one") { Cells = { ["amount"] = new CanopyCell(10000000000000.099609375m) } });
        Assert.Equal("10,000,000,000,000.0996093750", CanopyStaticHtml.RenderGridWithResult(view).Rows[0][0]);
    }

    [Fact]
    public void AggregateFormats_PreserveCompiledConstructorSignaturesAndCustomOperations() {
        var arguments = new[] { typeof(string), typeof(string), typeof(CanopyGridAggregateOperation), typeof(string) };
        var existing = typeof(CanopyGridAggregate).GetConstructor(arguments);
        Assert.NotNull(existing);
        Assert.Null(((CanopyGridAggregate)existing!.Invoke(new object[] { "count", "amount", CanopyGridAggregateOperation.Count, "Count" })).Format);
        var custom = typeof(CanopyGridAggregate).GetConstructor(new[] { typeof(string), typeof(string), typeof(string), typeof(string) });
        Assert.NotNull(custom);
        var format = CanopyGridNumberFormat.Fixed(1, suffix: " ms");
        var aggregate = new CanopyGridAggregate("median", "amount", "median", "Median", format);
        Assert.Equal(CanopyGridAggregateOperation.Custom, aggregate.Operation);
        Assert.Equal("median", aggregate.CustomOperation);
        Assert.Same(format, aggregate.Format);
    }

    [Fact]
    public void OmittedMaximum_RemainsThreeAndHigherMinimumNeedsAnExplicitMaximum() {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridNumberFormat(minimumFractionDigits: 4));
        Assert.Equal("1.2500", new CanopyGridNumberFormat(4, 4).Format(1.25));
    }

    [Fact]
    public void TreeGrid_RejectsFlatGridFormatsBeforeSerializationOrStaticRendering() {
        var view = new CanopyTreeView("tree", "Tree");
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Format = CanopyGridNumberFormat.Fixed(2) });
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.Render(view));
    }
}
