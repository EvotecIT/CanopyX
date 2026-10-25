using System.Globalization;
using Xunit;

namespace CanopyX.Tests.Calculations;

public sealed class CalculationEvaluationTests {
    [Fact]
    public void Evaluate_NormalizesAllNumericPrimitivesToBinary64() {
        object[] numbers = { (byte)2, (sbyte)2, (short)2, (ushort)2, 2, 2U, 2L, 2UL, 2F, 2D, 2M };
        var program = CanopyCalculation.Parse("[value] + 0.5");
        foreach (var number in numbers) Assert.Equal(2.5d, program.Evaluate(_ => number).Value);
        Assert.Equal(0.8455124082255701d, CanopyCalculation.Parse("[value]").Evaluate(_ => 0.84551240822557006m).Value);
        Assert.Equal(18446744073709551616d, CanopyCalculation.Parse("[value]").Evaluate(_ => ulong.MaxValue).Value);
    }

    [Fact]
    public void Evaluate_RejectsNonfiniteAndUnsupportedSourcesWithoutHostConversion() {
        var program = CanopyCalculation.Parse("[value]");
        foreach (var value in new object[] { double.NaN, double.PositiveInfinity, double.NegativeInfinity, float.NaN })
            Assert.Equal("number-range", program.Evaluate(_ => value).Error);
        foreach (var value in new object[] { new object(), new[] { 1 }, 'a', DayOfWeek.Monday, DBNull.Value })
            Assert.Equal("type", program.Evaluate(_ => value).Error);
    }

    [Fact]
    public void Evaluate_EnforcesSourceAndResultUtf16Limits() {
        var exact = new string('x', 4096);
        var read = CanopyCalculation.Parse("[value]");
        Assert.Equal(exact, read.Evaluate(_ => exact).Value);
        Assert.Equal("text-limit", read.Evaluate(_ => exact + "x").Error);
        var concat = CanopyCalculation.Parse("CONCAT([a],[b])");
        Assert.Equal(exact, concat.Evaluate(_ => new string('x', 2048)).Value);
        Assert.Equal("text-limit", concat.Evaluate(id => id == "a" ? exact : "x").Error);
        var rocket = string.Concat(Enumerable.Repeat("🚀", 2048));
        Assert.Equal(rocket, read.Evaluate(_ => rocket).Value);
        Assert.Equal("text-limit", read.Evaluate(_ => rocket + "x").Error);
    }

    [Fact]
    public void Evaluate_LazyBranchesNeverResolveUnusedColumns() {
        var visited = new List<string>();
        object? Resolve(string id) { visited.Add(id); return id == "used" ? 4 : throw new InvalidOperationException("unused"); }
        Assert.Equal(4d, CanopyCalculation.Parse("IF(null,[unused],[used])").Evaluate(Resolve).Value);
        Assert.Equal(4d, CanopyCalculation.Parse("COALESCE([used],[unused])").Evaluate(Resolve).Value);
        Assert.Equal(new[] { "used", "used" }, visited);
    }

    [Fact]
    public void Evaluate_PropagatesSourceErrorsAcrossColumnChains() {
        var source = new Dictionary<string, object?> { ["base"] = 3 };
        var programs = new Dictionary<string, CanopyCalculation> {
            ["double"] = CanopyCalculation.Parse("[base] * 2"),
            ["total"] = CanopyCalculation.Parse("[double] + [base]"),
            ["broken"] = CanopyCalculation.Parse("[base] / 0"),
            ["dependent"] = CanopyCalculation.Parse("COALESCE([broken], 99)")
        };
        object? Resolve(string id) => programs.TryGetValue(id, out var program) ? program.Evaluate(Resolve) : source.TryGetValue(id, out var value) ? value : null;
        Assert.Equal(9d, programs["total"].Evaluate(Resolve).Value);
        var result = programs["dependent"].Evaluate(Resolve);
        Assert.True(result.IsError);
        Assert.Null(result.Value);
        Assert.Equal("divide-by-zero", result.Error);
        Assert.Equal("reference", CanopyCalculation.Parse("[cycle] + 1").Evaluate(_ => CanopyCalculatedValue.FromError("reference")).Error);
        Assert.Equal(2d, CanopyCalculation.Parse("[wrapped] + 1").Evaluate(_ => new CanopyCalculatedValue(1)).Value);
        Assert.Equal("type", CanopyCalculation.Parse("[wrapped]").Evaluate(_ => new CanopyCalculatedValue(new object())).Error);
    }

    [Fact]
    public void Evaluate_PropagatesHostExceptionUnchanged() {
        var expected = new InvalidOperationException("host failed");
        var actual = Assert.Throws<InvalidOperationException>(() => CanopyCalculation.Parse("[value]").Evaluate(_ => throw expected));
        Assert.Same(expected, actual);
        Assert.Throws<ArgumentNullException>(() => CanopyCalculation.Parse("1").Evaluate(null!));
    }

    [Fact]
    public void Evaluate_EagerErrorsPrecedeConcatOutputLimit() {
        var program = CanopyCalculation.Parse("CONCAT([a],[b],[error])");
        var visited = new List<string>();
        var result = program.Evaluate(id => {
            visited.Add(id);
            return id == "error" ? CanopyCalculatedValue.FromError("reference") : new string('x', 4096);
        });
        Assert.Equal("reference", result.Error);
        Assert.Equal(new[] { "a", "b", "error" }, visited);
    }

    [Fact]
    public void Evaluate_NormalizesDatesLikeCellsWithoutAmbientCulture() {
        var original = CultureInfo.CurrentCulture;
        try {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("pl-PL");
            var offset = new DateTimeOffset(2026, 1, 1, 0, 30, 45, TimeSpan.FromHours(2)).AddTicks(1234567);
            var cell = new CanopyCell(offset);
            Assert.Equal("2025-12-31T22:30:45.123Z", CanopyCalculation.Parse("[date]").Evaluate(_ => cell.Value).Value);
            Assert.Equal("2025-12-31T22:30:45.123Z", CanopyCalculation.Parse("[date]").Evaluate(_ => offset).Value);
            Assert.Equal(2025d, CanopyCalculation.Parse("DATEPART(\"year\",[date])").Evaluate(_ => offset).Value);
            Assert.Equal("2026-01-01T00:00:00Z", CanopyCalculation.Parse("[date]").Evaluate(_ => new DateTime(2026, 1, 1)).Value);
            Assert.Equal("1.25", CanopyCalculation.Parse("CONCAT([number])").Evaluate(_ => 1.25m).Value);
        } finally { CultureInfo.CurrentCulture = original; }
    }

    [Fact]
    public void Evaluate_NormalizesNegativeZeroAndHasNoRowCache() {
        var program = CanopyCalculation.Parse("[value]");
        var zero = Assert.IsType<double>(program.Evaluate(_ => -0d).Value);
        Assert.Equal(0L, BitConverter.DoubleToInt64Bits(zero));
        Assert.Equal(1d, program.Evaluate(_ => 1).Value);
        Assert.Equal(2d, program.Evaluate(_ => 2).Value);
        Parallel.For(0, 100, value => Assert.Equal((double)value, program.Evaluate(_ => value).Value));
    }

    [Fact]
    public void ErrorResult_ValidatesStableCodes() {
        foreach (var code in new[] { "type", "divide-by-zero", "number-range", "text-limit", "date", "reference" }) {
            var error = CanopyCalculatedValue.FromError(code);
            Assert.True(error.IsError);
            Assert.Null(error.Value);
            Assert.Equal(code, error.Error);
        }
        Assert.Throws<ArgumentException>(() => CanopyCalculatedValue.FromError("unknown"));
        Assert.False(new CanopyCalculatedValue(null).IsError);
    }
}
