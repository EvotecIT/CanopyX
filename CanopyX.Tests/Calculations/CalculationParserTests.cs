using Xunit;

namespace CanopyX.Tests.Calculations;

public sealed class CalculationParserTests {
    public static IEnumerable<object[]> InvalidNames() => InvalidExpressions.Keys.Select(name => new object[] { name });

    private static readonly IReadOnlyDictionary<string, string> InvalidExpressions = new Dictionary<string, string> {
        ["empty"] = "",
        ["whitespace"] = " \t\n",
        ["missing-operand"] = "1 +",
        ["missing-parenthesis"] = "(1 + 2",
        ["trailing-token"] = "1 2",
        ["leading-zero"] = "01",
        ["leading-point"] = ".5",
        ["trailing-point"] = "1.",
        ["exponent-without-digits"] = "1e+",
        ["infinite-literal"] = "1e309",
        ["nan-word"] = "NaN",
        ["single-quoted-text"] = "'text'",
        ["unfinished-string"] = "\"text",
        ["invalid-json-escape"] = "\"\\v\"",
        ["invalid-unicode-escape"] = "\"\\u12xz\"",
        ["unfinished-unicode-escape"] = "\"\\u12\"",
        ["raw-control-in-string"] = "\"\n\"",
        ["empty-reference"] = "[]",
        ["unclosed-reference"] = "[a",
        ["extra-closing-bracket"] = "[a]]",
        ["malformed-identifier"] = "[\ud800]",
        ["unknown-function"] = "SUM(1,2)",
        ["empty-coalesce"] = "COALESCE()",
        ["empty-concat"] = "CONCAT()",
        ["if-too-few"] = "IF(true,1)",
        ["if-too-many"] = "IF(true,1,2,3)",
        ["round-arity"] = "ROUND(1)",
        ["datepart-arity"] = "DATEPART(\"day\")",
        ["datediff-arity"] = "DATEDIFF(\"day\",\"2026-01-01\")",
        ["trailing-comma"] = "CONCAT(1,)",
        ["member-access"] = "[a].value",
        ["code-injection"] = "1;alert(1)",
        ["comment"] = "1 /* comment */ + 2"
    };

    [Theory]
    [MemberData(nameof(InvalidNames))]
    public void Parse_RejectsInvalidSyntax(string name) => Assert.Throws<ArgumentException>(() => CanopyCalculation.Parse(InvalidExpressions[name]));

    [Fact]
    public void Parse_RejectsNull() => Assert.Throws<ArgumentException>(() => CanopyCalculation.Parse(null!));

    [Fact]
    public void Parse_PreservesExpressionAndOrderedImmutableDependencies() {
        const string expression = " IF(true, [B] + [a] + [B], [never] + [A]) ";
        var calculation = CanopyCalculation.Parse(expression);
        Assert.Equal(expression, calculation.Expression);
        Assert.Equal(new[] { "B", "a", "never", "A" }, calculation.Dependencies);
        var list = Assert.IsAssignableFrom<IList<string>>(calculation.Dependencies);
        Assert.Throws<NotSupportedException>(() => list[0] = "mutated");
        Assert.Throws<NotSupportedException>(() => list.Add("mutated"));
        Assert.Equal(6d, calculation.Evaluate(_ => 2).Value);
    }

    [Fact]
    public void Parse_EnforcesExpressionLengthBoundary() {
        var expression = "1" + new string(' ', 2047);
        Assert.Equal(1d, CanopyCalculation.Parse(expression).Evaluate(_ => null).Value);
        Assert.Throws<ArgumentException>(() => CanopyCalculation.Parse(expression + " "));
    }

    [Fact]
    public void Parse_EnforcesActualBinarySpineDepth() {
        var expression = string.Join("+", Enumerable.Repeat("1", 32));
        Assert.Equal(32d, CanopyCalculation.Parse(expression).Evaluate(_ => null).Value);
        Assert.Throws<ArgumentException>(() => CanopyCalculation.Parse(expression + "+1"));
    }

    [Fact]
    public void Parse_EnforcesUnaryAndFunctionDepth() {
        Assert.Equal(1d, CanopyCalculation.Parse(new string('+', 31) + "1").Evaluate(_ => null).Value);
        Assert.Throws<ArgumentException>(() => CanopyCalculation.Parse(new string('+', 32) + "1"));
        var nested = "1";
        for (var index = 0; index < 31; index++) nested = "COALESCE(" + nested + ")";
        Assert.Equal(1d, CanopyCalculation.Parse(nested).Evaluate(_ => null).Value);
        Assert.Throws<ArgumentException>(() => CanopyCalculation.Parse("COALESCE(" + nested + ")"));
        Assert.Throws<ArgumentException>(() => CanopyCalculation.Parse(new string('(', 1000) + "1" + new string(')', 1000)));
    }

    [Fact]
    public void Parse_EnforcesNodeLimitIndependentlyOfDepth() {
        string Balanced(int leaves) => leaves == 1 ? "1" : "(" + Balanced(leaves / 2) + "+" + Balanced(leaves - leaves / 2) + ")";
        var expression = "COALESCE(" + Balanced(128) + ")";
        Assert.Equal(128d, CanopyCalculation.Parse(expression).Evaluate(_ => null).Value);
        Assert.Throws<ArgumentException>(() => CanopyCalculation.Parse("+" + expression));
    }

    [Fact]
    public void Parse_EnforcesArgumentLimit() {
        var arguments = string.Join(",", Enumerable.Repeat("1", 32));
        Assert.Equal(new string('1', 32), CanopyCalculation.Parse("CONCAT(" + arguments + ")").Evaluate(_ => null).Value);
        Assert.Throws<ArgumentException>(() => CanopyCalculation.Parse("CONCAT(" + arguments + ",1)"));
    }

    [Fact]
    public void Parse_EnforcesDistinctDependencyLimit() {
        string Group(int first, int count) => "CONCAT(" + string.Join(",", Enumerable.Range(first, count).Select(index => "[c" + index + "]")) + ")";
        var expression = "CONCAT(" + Group(0, 32) + "," + Group(32, 32) + ")";
        Assert.Equal(64, CanopyCalculation.Parse(expression).Dependencies.Count);
        Assert.Throws<ArgumentException>(() => CanopyCalculation.Parse("CONCAT(" + expression + ",[extra])"));
        Assert.Single(CanopyCalculation.Parse("CONCAT(" + string.Join(",", Enumerable.Repeat("[same]", 32)) + ")").Dependencies);
    }

    [Fact]
    public void Parse_UsesJavaScriptWhitespaceOutsideStrings() {
        Assert.Equal(3d, CanopyCalculation.Parse("\ufeff1\u00a0+\u20282").Evaluate(_ => null).Value);
        Assert.Throws<ArgumentException>(() => CanopyCalculation.Parse("1\u0085+2"));
    }
}
