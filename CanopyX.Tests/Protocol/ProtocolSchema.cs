using System.Text.Json;
using System.Text.Json.Nodes;
using Json.Schema;

namespace CanopyX.Tests.Protocol;

/// <summary>
/// Loads the checked-in <c>docs/schema/canopyx-1.schema.json</c> (linked into the test output) and validates
/// documents against it.
/// </summary>
internal static class ProtocolSchema {
    private static readonly Lazy<JsonSchema> Schema = new(() =>
        JsonSchema.FromFile(Path.Combine(AppContext.BaseDirectory, "Schema", "canopyx-1.schema.json")));

    internal static EvaluationResults Evaluate(string json) {
        using var document = JsonDocument.Parse(json);
        return Schema.Value.Evaluate(document.RootElement, new EvaluationOptions { OutputFormat = OutputFormat.List });
    }

    internal static void AssertValid(string json, string description) {
        var results = Evaluate(json);
        if (!results.IsValid) {
            var errors = string.Join(Environment.NewLine, (results.Details ?? new List<EvaluationResults>())
                .Where(detail => detail.Errors != null)
                .SelectMany(detail => detail.Errors!.Select(error => detail.InstanceLocation + ": " + error.Value)));
            Assert.Fail(description + " does not match canopyx-1.schema.json:" + Environment.NewLine + errors + Environment.NewLine + json);
        }
    }

    internal static string Mutate(string json, Action<JsonObject> change) {
        var node = JsonNode.Parse(json)!.AsObject();
        change(node);
        return node.ToJsonString();
    }
}
