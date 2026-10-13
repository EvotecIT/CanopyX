namespace CanopyX.Tests.Views;

public sealed class CanopyColumnSizingTests {
    public static TheoryData<CanopyColumnSizing> Sizings => new() {
        CanopyColumnSizing.Content(60, 300, CanopyColumnAutoSize.Header),
        CanopyColumnSizing.Preferred(160, 100, 400),
        CanopyColumnSizing.Fixed(180, 120, 400),
        CanopyColumnSizing.Flex(2.5, 90, 400, 200, CanopyColumnAutoSize.None)
    };

    [Theory]
    [MemberData(nameof(Sizings))]
    public void WithMaximum_ChangesOnlyTheMaximumAndLeavesTheOriginal(CanopyColumnSizing sizing) {
        var original = sizing.Maximum;
        var derived = sizing.WithMaximum(320);

        Assert.NotSame(sizing, derived);
        Assert.Equal(320, derived.Maximum);
        Assert.Equal(original, sizing.Maximum);
        AssertSameExcept(sizing, derived, minimum: sizing.Minimum, maximum: 320);
    }

    [Theory]
    [MemberData(nameof(Sizings))]
    public void WithMinimum_ChangesOnlyTheMinimumAndLeavesTheOriginal(CanopyColumnSizing sizing) {
        var original = sizing.Minimum;
        var derived = sizing.WithMinimum(50);

        Assert.NotSame(sizing, derived);
        Assert.Equal(50, derived.Minimum);
        Assert.Equal(original, sizing.Minimum);
        AssertSameExcept(sizing, derived, minimum: 50, maximum: sizing.Maximum);
    }

    [Fact]
    public void Helpers_Chain() {
        var sizing = CanopyColumnSizing.Content().WithMaximum(480).WithMinimum(120);

        Assert.Equal(120, sizing.Minimum);
        Assert.Equal(480, sizing.Maximum);
        Assert.Null(sizing.Width);
    }

    [Fact]
    public void Helpers_RejectContradictoryBoundsAndNameTheirArgument() {
        var preferred = CanopyColumnSizing.Preferred(200, 100, 400);

        Assert.Equal("maximum", Assert.Throws<ArgumentOutOfRangeException>(() => preferred.WithMaximum(199)).ParamName);
        Assert.Equal("maximum", Assert.Throws<ArgumentOutOfRangeException>(() => CanopyColumnSizing.Content(100).WithMaximum(99)).ParamName);
        Assert.Equal("minimum", Assert.Throws<ArgumentOutOfRangeException>(() => preferred.WithMinimum(201)).ParamName);
        Assert.Equal("minimum", Assert.Throws<ArgumentOutOfRangeException>(() => preferred.WithMinimum(39)).ParamName);
        Assert.Equal("minimum", Assert.Throws<ArgumentOutOfRangeException>(() => CanopyColumnSizing.Content(maximum: 300).WithMinimum(301)).ParamName);
    }

    [Fact]
    public void DerivedSizing_WritesTheNewBoundsOnTheWire() {
        var view = new CanopyDataGridView("rules", "Rules");
        view.Columns.Add(new CanopyColumn("rule", "Rule") { Sizing = CanopyColumnSizing.Flex(2, 120, 900).WithMaximum(480) });

        var json = view.ToJson();

        Assert.Contains("\"minWidth\":120,\"maxWidth\":480", json);
        Assert.Contains("\"flex\":2", json);
    }

    private static void AssertSameExcept(CanopyColumnSizing original, CanopyColumnSizing derived, int minimum, int maximum) {
        Assert.Equal(original.Width, derived.Width);
        Assert.Equal(minimum, derived.Minimum);
        Assert.Equal(maximum, derived.Maximum);
        Assert.Equal(original.FlexWeight, derived.FlexWeight);
        Assert.Equal(original.IsFixed, derived.IsFixed);
        Assert.Equal(original.Measure, derived.Measure);
    }
}
