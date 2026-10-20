using System.Text.Json.Nodes;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Matrix;

/// <summary>Malformed matrix documents fail the public schema before reaching a host renderer.</summary>
public sealed class MatrixSchemaTests {
    [Theory]
    [InlineData("unknown document field")]
    [InlineData("unknown axis field")]
    [InlineData("missing columns")]
    [InlineData("square with columns")]
    [InlineData("unknown symbol")]
    [InlineData("unsafe link")]
    [InlineData("invalid cell digit")]
    [InlineData("oversized note value")]
    public void Schema_RejectsMalformedMatrixShapes(string defect) {
        var json = File.ReadAllText(Path.Combine(RepositoryPaths.Root, "tests", "fixtures", "matrix-small.json"));
        ProtocolSchema.AssertValid(json, "Shared matrix fixture");
        var malformed = ProtocolSchema.Mutate(json, doc => {
            switch (defect) {
                case "unknown document field": doc["extra"] = true; break;
                case "unknown axis field": doc["rows"]!["extra"] = true; break;
                case "missing columns": doc.Remove("columns"); break;
                case "square with columns": doc["square"] = true; break;
                case "unknown symbol": doc["states"]![0]!["symbol"] = "unknown"; break;
                case "unsafe link": doc["rows"]!["items"]![0]!["href"] = "javascript:alert(1)"; break;
                case "invalid cell digit": doc["cells"]![0] = "22!2"; break;
                case "oversized note value": doc["notes"]![0]![2] = JsonValue.Create(9007199254740992d); break;
                default: throw new ArgumentOutOfRangeException(nameof(defect));
            }
        });
        Assert.False(ProtocolSchema.Evaluate(malformed).IsValid, defect);
    }
}
