using System.Runtime.CompilerServices;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace CanopyX.Tests.Flows;

/// <summary>
/// The golden flow document: tests/fixtures/flow-document-everything.json holds <see cref="FlowSamples.Everything"/> as C#
/// writes it, so the browser specs (flow-everything.spec.mjs) prove the runtime reads every document C# writes.
/// </summary>
public sealed class FlowFixtureTests {
    private const string UpdateVariable = "CANOPYX_FIXTURE_UPDATE";

    [Fact]
    public void Everything_MatchesTheGoldenDocument() {
        var path = FixturePath();
        var expected = Pretty(FlowSamples.Everything().ToContract());
        if (Environment.GetEnvironmentVariable(UpdateVariable) == "1") {
            File.WriteAllText(path, expected);
            return;
        }
        Assert.True(File.Exists(path), "tests/fixtures/flow-document-everything.json is missing; regenerate it with " + UpdateVariable + "=1.");
        var actual = File.ReadAllText(path).Replace("\r\n", "\n");
        Assert.True(actual == expected, "tests/fixtures/flow-document-everything.json differs from FlowSamples.Everything().ToContract(); " +
            "regenerate it with " + UpdateVariable + "=1 dotnet test --filter FlowFixtureTests and review the diff.");
    }

    [Fact]
    public void Everything_GoldenDocumentReadsBackToTheSameContract() {
        var json = FlowSamples.Everything().ToContract();
        Assert.Equal(json, CanopyFlow.FromContract(json).ToContract());
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(json), JsonNode.Parse(File.ReadAllText(FixturePath()))),
            "The golden document is not the contract C# writes; regenerate it with " + UpdateVariable + "=1.");
    }

    // The document indented for readable diffs; the values and their order are the contract's.
    private static string Pretty(string json) =>
        JsonNode.Parse(json)!.ToJsonString(new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }).Replace("\r\n", "\n") + "\n";

    // The fixture in the source tree, next to this file's repository, so an update rewrites the tracked file.
    private static string FixturePath([CallerFilePath] string source = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(source)!, "..", "..", "tests", "fixtures", "flow-document-everything.json"));
}
