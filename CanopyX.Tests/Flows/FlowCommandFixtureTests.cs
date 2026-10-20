using System.Runtime.CompilerServices;
using System.Text.Json;

namespace CanopyX.Tests.Flows;

/// <summary>
/// The equivalent command: every case of tests/fixtures/flow-commands.json, which the browser spec flow-host-commands.spec.mjs
/// runs too, written by <see cref="CanopyFlow.FormatCommand"/> from the case's document, answers and typed secrets.
/// </summary>
public sealed class FlowCommandFixtureTests {
    public static IEnumerable<object[]> Cases() {
        using var document = JsonDocument.Parse(File.ReadAllText(FixturePath()));
        foreach (var item in document.RootElement.GetProperty("cases").EnumerateArray()) yield return new object[] { item.GetProperty("name").GetString()! };
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void FormatCommand_FixtureCase_WritesTheSharedCommand(string name) {
        using var document = JsonDocument.Parse(File.ReadAllText(FixturePath()));
        var item = document.RootElement.GetProperty("cases").EnumerateArray().First(entry => entry.GetProperty("name").GetString() == name);
        var flow = CanopyFlow.FromContract(Flow(item));
        var values = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var property in item.GetProperty("values").EnumerateObject()) values[property.Name] = Clr(property.Value);
        var secrets = item.GetProperty("secrets").EnumerateArray().Select(entry => entry.GetString()!).ToList();
        Assert.Equal(item.GetProperty("command").GetString(), flow.FormatCommand(values, secrets));
    }

    [Fact]
    public void FormatCommand_FlowWithoutCommand_ReturnsNull() {
        var flow = new CanopyFlow("plain", "Plain").Step("one", "One", step => step.Text("name", "Name", field => field.Parameter("Name")));
        Assert.Null(flow.FormatCommand(new Dictionary<string, object?> { ["name"] = "x" }));
    }

    /// <summary>The case's document, with its edit-mode values under <c>initial</c>.</summary>
    internal static string Flow(JsonElement item) {
        var flow = System.Text.Json.Nodes.JsonNode.Parse(item.GetProperty("flow").GetRawText())!.AsObject();
        if (item.TryGetProperty("initial", out var initial)) flow["initial"] = System.Text.Json.Nodes.JsonNode.Parse(initial.GetRawText());
        return flow.ToJsonString();
    }

    /// <summary>A JSON value as the flow API takes it: text, a double, a boolean, a list or a dictionary.</summary>
    internal static object? Clr(JsonElement value) => value.ValueKind switch {
        JsonValueKind.String => value.GetString(),
        JsonValueKind.Number => value.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Array => value.EnumerateArray().Select(Clr).ToList(),
        JsonValueKind.Object => value.EnumerateObject().ToDictionary(property => property.Name, property => Clr(property.Value), StringComparer.Ordinal),
        _ => null
    };

    internal static string FixturePath([CallerFilePath] string source = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(source)!, "..", "..", "tests", "fixtures", "flow-commands.json"));
}
