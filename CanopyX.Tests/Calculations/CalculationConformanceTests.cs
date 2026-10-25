using System.Text.Json;
using Xunit;

namespace CanopyX.Tests.Calculations;

public sealed class CalculationConformanceTests {
    private static readonly JsonElement Cases = ReadCases();

    public static IEnumerable<object[]> Names() => Cases.EnumerateArray().Select(item => new object[] { item.GetProperty("name").GetString()! });

    [Theory]
    [MemberData(nameof(Names))]
    public void Evaluate_MatchesSharedVector(string name) {
        var item = Cases.EnumerateArray().Single(candidate => candidate.GetProperty("name").GetString() == name);
        var program = CanopyCalculation.Parse(item.GetProperty("expression").GetString()!);
        var row = item.GetProperty("row");
        var result = program.Evaluate(id => row.TryGetProperty(id, out var scalar) ? Scalar(scalar) : null);
        Assert.Equal(item.GetProperty("error").GetString(), result.Error);
        Assert.Equal(item.GetProperty("error").ValueKind != JsonValueKind.Null, result.IsError);
        Assert.Equal(Scalar(item.GetProperty("value")), result.Value);
    }

    private static object? Scalar(JsonElement scalar) => scalar.ValueKind switch {
        JsonValueKind.Number => scalar.GetDouble(),
        JsonValueKind.String => scalar.GetString(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Null => null,
        _ => throw new InvalidOperationException("Conformance rows contain only scalars.")
    };

    private static JsonElement ReadCases() {
        // Read the single shared fixture without requiring a project-file copy rule.
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "CanopyX.sln"))) directory = directory.Parent;
        // Isolated artifact output can be outside the checkout; the build records this source path.
        var root = directory?.FullName ?? Path.GetFullPath(Path.Combine(SourceDirectory(), "..", ".."));
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "tests", "conformance", "calculations.json")));
        return document.RootElement.Clone();
    }

    private static string SourceDirectory([System.Runtime.CompilerServices.CallerFilePath] string source = "") => Path.GetDirectoryName(source)!;
}
