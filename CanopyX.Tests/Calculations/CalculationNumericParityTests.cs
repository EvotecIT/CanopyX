using Xunit;

namespace CanopyX.Tests.Calculations;

/// <summary>Formatting and rounding contracts sensitive to the legacy CLR's numeric implementation.</summary>
public sealed class CalculationNumericParityTests {
    [Theory]
    [InlineData("0.1", "0.1")]
    [InlineData("0.1 + 0.2", "0.30000000000000004")]
    [InlineData("0.84551240822557006", "0.8455124082255701")]
    [InlineData("1e-6", "0.000001")]
    [InlineData("1e-7", "1e-7")]
    [InlineData("1e20", "100000000000000000000")]
    [InlineData("1e21", "1e+21")]
    [InlineData("1e23", "1e+23")]
    [InlineData("5e-324", "5e-324")]
    [InlineData("1.7976931348623157e308", "1.7976931348623157e+308")]
    [InlineData("1000000000000000100", "1000000000000000100")]
    [InlineData("-0", "0")]
    [InlineData("ROUND(0.49999999999999994,0)", "0")]
    [InlineData("ROUND(-0.5,0)", "0")]
    [InlineData("ROUND(4503599627370497,0)", "4503599627370497")]
    [InlineData("ROUND(1.005,2)", "1")]
    [InlineData("ROUND(150000,-5)", "199999.99999999997")]
    [InlineData("ROUND(-150000,-5)", "-199999.99999999997")]
    [InlineData("7.916649096419213e-249", "7.916649096419213e-249")]
    [InlineData("5.893133417034912e-127", "5.893133417034912e-127")]
    [InlineData("-3.969307562684322e-224", "-3.969307562684322e-224")]
    [InlineData("6.032053543241257e261", "6.032053543241257e+261")]
    [InlineData("2.2250738585072014e-308", "2.2250738585072014e-308")]
    [InlineData("1e-999999", "0")]
    [InlineData("0e999999", "0")]
    [InlineData("2.4703282292062327e-324", "0")]
    [InlineData("2.4703282292062328e-324", "5e-324")]
    public void Concat_UsesJavaScriptShortestBinary64Text(string expression, string expected) {
        var result = CanopyCalculation.Parse("CONCAT(" + expression + ")").Evaluate(_ => null);
        Assert.Null(result.Error);
        Assert.Equal(expected, result.Value);
    }
}
