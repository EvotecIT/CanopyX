using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace CanopyX.Tests.Flows;

/// <summary>The flow document: its shape, the round trip through <see cref="CanopyFlow.FromContract"/>, the schema and the strict reader.</summary>
public sealed class FlowContractTests {
    [Fact]
    public void FromContract_EmptyInitial_PreservesEditModeBaseline() {
        const string json = "{\"kind\":\"flow\",\"version\":1,\"id\":\"edit\",\"title\":\"Edit settings\",\"steps\":[{\"id\":\"settings\",\"title\":\"Settings\"}],\"initial\":{}}";
        var flow = CanopyFlow.FromContract(json);

        Assert.Empty(flow.Initial);
        var roundTrip = flow.ToContract();
        using var document = JsonDocument.Parse(roundTrip);
        Assert.True(document.RootElement.TryGetProperty("initial", out var initial));
        Assert.Equal(JsonValueKind.Object, initial.ValueKind);
        Assert.Empty(initial.EnumerateObject());
        Assert.Equal(json, roundTrip);
        Assert.True(flow.IsEditMode);
        FlowSamples.AssertValid(roundTrip, "An edit flow with an empty baseline");
    }

    [Fact]
    public void ToContract_EditMode_WritesEmptyBaselineAndPreservesPopulatedInitialBehavior() {
        var flow = new CanopyFlow("edit", "Edit settings").Step("settings", "Settings", step => step.Text("host", "Host"));
        Assert.False(flow.IsEditMode);
        using (var create = JsonDocument.Parse(flow.ToContract())) {
            Assert.False(create.RootElement.TryGetProperty("initial", out _));
            Assert.False(CanopyFlow.FromContract(create.RootElement.GetRawText()).IsEditMode);
        }

        flow.IsEditMode = true;
        var json = flow.ToContract();
        using (var edit = JsonDocument.Parse(json)) {
            Assert.Equal("{}", edit.RootElement.GetProperty("initial").GetRawText());
        }
        FlowSamples.AssertValid(json, "An explicitly empty edit baseline");

        flow.IsEditMode = false;
        flow.Initial["host"] = "mail.example.com";
        var read = CanopyFlow.FromContract(flow.ToContract());
        Assert.True(read.IsEditMode);
        Assert.Equal("mail.example.com", read.Initial["host"]);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public void ToContract_EditMetadata_WritesEmptyInitialWithoutExplicitEditMode(bool storedSecret, bool baseline) {
        var flow = new CanopyFlow("edit", "Edit credentials").Step("credentials", "Credentials", step => step.Secret("token", "Token"));
        if (storedSecret) flow.StoredSecrets.Add("token");
        if (baseline) flow.Baseline = "revision-1";
        Assert.False(flow.IsEditMode);
        Assert.Empty(flow.Initial);

        var json = flow.ToContract();
        using var document = JsonDocument.Parse(json);
        Assert.Equal("{}", document.RootElement.GetProperty("initial").GetRawText());
        FlowSamples.AssertValid(json, "An edit flow identified by its metadata");
        var read = CanopyFlow.FromContract(json);
        Assert.True(read.IsEditMode);
        Assert.Equal(flow.Baseline, read.Baseline);
        Assert.Equal(flow.StoredSecrets, read.StoredSecrets);
        Assert.Equal(json, read.ToContract());

        var withoutInitial = JsonNode.Parse(json)!.AsObject();
        withoutInitial.Remove("initial");
        Assert.Equal(json, CanopyFlow.FromContract(withoutInitial.ToJsonString()).ToContract());
    }

    [Theory]
    [InlineData(CanopyFlowFieldKind.List)]
    [InlineData(CanopyFlowFieldKind.MultiChoice)]
    public void ToContract_CollectionDefault_OmitsNullAndWritesArrays(CanopyFlowFieldKind kind) {
        var field = new CanopyFlowField("items", kind, "Items") { DefaultValue = null };
        if (kind == CanopyFlowFieldKind.MultiChoice) field.Option("one");
        var flow = new CanopyFlow("create", "Create settings").Step("settings", "Settings");
        flow.Steps[0].Fields.Add(field);

        var json = flow.ToContract();
        using (var document = JsonDocument.Parse(json)) {
            Assert.False(document.RootElement.GetProperty("steps")[0].GetProperty("fields")[0].TryGetProperty("default", out _));
        }
        FlowSamples.AssertValid(json, "A collection field with no default");

        foreach (var values in new[] { Array.Empty<string>(), new[] { "one" } }) {
            field.DefaultValue = values;
            json = flow.ToContract();
            using var document = JsonDocument.Parse(json);
            var start = document.RootElement.GetProperty("steps")[0].GetProperty("fields")[0].GetProperty("default");
            Assert.Equal(JsonValueKind.Array, start.ValueKind);
            Assert.Equal(values, start.EnumerateArray().Select(item => item.GetString()));
            FlowSamples.AssertValid(json, "A collection field with an array default");
            Assert.Equal(json, CanopyFlow.FromContract(json).ToContract());
        }
    }

    [Theory]
    [InlineData(CanopyFlowFieldKind.List)]
    [InlineData(CanopyFlowFieldKind.MultiChoice)]
    public void FromContract_NullCollectionDefault_RejectsSchemaInvalidDocument(CanopyFlowFieldKind kind) {
        var field = new CanopyFlowField("items", kind, "Items");
        if (kind == CanopyFlowFieldKind.MultiChoice) field.Option("one");
        var flow = new CanopyFlow("create", "Create settings").Step("settings", "Settings");
        flow.Steps[0].Fields.Add(field);
        var json = Mutate(flow.ToContract(), root => root["steps"]![0]!["fields"]![0]!["default"] = null);

        Assert.False(FlowSamples.Evaluate(json).IsValid);
        var error = Assert.Throws<InvalidOperationException>(() => CanopyFlow.FromContract(json));
        Assert.Contains("default", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("items", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(CanopyFlowFieldKind.List)]
    [InlineData(CanopyFlowFieldKind.MultiChoice)]
    public void ToContract_NullCollectionInitial_RemainsNullAndMatchesSchema(CanopyFlowFieldKind kind) {
        var field = new CanopyFlowField("items", kind, "Items");
        if (kind == CanopyFlowFieldKind.MultiChoice) field.Option("one");
        var flow = new CanopyFlow("edit", "Edit settings").Step("settings", "Settings");
        flow.Steps[0].Fields.Add(field);
        flow.Initial["items"] = null;

        var json = flow.ToContract();
        using var document = JsonDocument.Parse(json);
        Assert.Equal(JsonValueKind.Null, document.RootElement.GetProperty("initial").GetProperty("items").ValueKind);
        FlowSamples.AssertValid(json, "A null collection baseline");
        var read = CanopyFlow.FromContract(json);
        Assert.True(read.Initial.ContainsKey("items"));
        Assert.Null(read.Initial["items"]);
        Assert.Equal(json, read.ToContract());
    }

    [Fact]
    public void ToContract_QuickStart_WritesTheDocumentedShape() {
        var json = FlowSamples.MailServer().ToContract();
        Assert.StartsWith("{\"kind\":\"flow\",\"version\":1,\"id\":\"mail-server\",\"title\":\"Connect a mail server\",\"steps\":[", json);
        Assert.Contains("{\"id\":\"host\",\"type\":\"text\",\"label\":\"Server name\",\"placeholder\":\"mail.example.com\",\"required\":true,\"path\":\"mail.host\"}", json);
        Assert.Contains("{\"id\":\"port\",\"type\":\"number\",\"label\":\"Port\",\"default\":587,\"width\":\"half\",\"path\":\"mail.port\",\"validation\":{\"min\":1,\"max\":65535}}", json);
        Assert.Contains("\"when\":{\"operator\":\"and\",\"filters\":[{\"field\":\"security\",\"operator\":\"ne\",\"values\":[\"none\"]}]}", json);
        Assert.Contains("{\"id\":\"review\",\"type\":\"review\",\"declaration\":\"The settings apply to new messages.\"}", json);
        Assert.EndsWith("],\"submit\":{\"label\":\"Save settings\"}}", json);
        Assert.DoesNotContain("\"mode\"", json);
        Assert.DoesNotContain("\"layout\"", json);
        Assert.DoesNotContain("\"labels\"", json);
        FlowSamples.AssertValid(json, "The quick start flow");
    }

    [Fact]
    public void ToContract_RichFlow_WritesEditModeSettingsAndCanonicalValues() {
        var json = FlowSamples.Everything().ToContract();
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal(new[] { "kind", "version", "id", "title", "description", "mode", "layout", "density", "timeZone", "steps", "initial", "storedSecrets", "baseline", "submit", "labels" },
            root.EnumerateObject().Select(property => property.Name));
        Assert.Equal("free", root.GetProperty("mode").GetString());
        Assert.Equal("vertical", root.GetProperty("layout").GetProperty("orientation").GetString());
        Assert.Equal("compact", root.GetProperty("density").GetString());
        Assert.Equal("local", root.GetProperty("timeZone").GetString());
        var initial = root.GetProperty("initial");
        Assert.Equal("2027-06-30T10:00:00Z", initial.GetProperty("until").GetString());
        Assert.Equal("PT2H", initial.GetProperty("window").GetString());
        Assert.Equal(JsonValueKind.Null, initial.GetProperty("notes").ValueKind);
        Assert.Equal(3, initial.GetProperty("retries").GetDouble());
        Assert.Equal("[\"token\"]", root.GetProperty("storedSecrets").GetRawText());
        Assert.Equal("{\"gridEditRequired\":\"Pole {column} jest wymagane.\"}", root.GetProperty("labels").GetRawText());
        Assert.Contains("\"default\":\"2026-11-02\"", json);
        Assert.Contains("\"default\":\"PT1H30M\"", json);
        Assert.Contains("\"validation\":{\"min\":\"PT5M\",\"max\":\"PT12H\"}", json);
        Assert.Contains("\"validation\":{\"min\":\"2026-01-01T00:00:00Z\",\"max\":\"2030-01-01T00:00:00Z\"}", json);
        Assert.Contains("\"units\":[\"minutes\",\"hours\"]", json);
        Assert.Contains("\"validation\":{\"minItems\":1,\"maxItems\":50,\"item\":\"email\"}", json);
        Assert.Contains("\"keepWhenBlank\":true,\"reveal\":false", json);
        Assert.Contains("{\"id\":\"rating\",\"type\":\"custom\",\"editor\":\"stars\",\"label\":\"Priority\",\"default\":3", json);
        Assert.Contains("{\"id\":\"welcome\",\"type\":\"info\",\"title\":\"Before you start\",\"description\":\"You need a recipient list.\"}", json);
        Assert.Contains("\"sections\":[{\"id\":\"advanced\",\"label\":\"Advanced\",\"description\":\"Only for unusual schedules.\",\"when\":", json);
        Assert.Contains("\"changesOnly\":false", json);
        Assert.Contains("{\"value\":\"team\",\"label\":\"My team\",\"description\":\"People you manage.\",\"badge\":\"Recommended\"}", json);
        Assert.Contains("\"display\":\"cards\"", json);
        FlowSamples.AssertValid(json, "The rich flow");
    }

    [Fact]
    public void FromContract_RoundTrip_IsStable() {
        foreach (var flow in new[] { FlowSamples.MailServer(), FlowSamples.Everything() }) {
            var json = flow.ToContract();
            var read = CanopyFlow.FromContract(json);
            Assert.Equal(json, read.ToContract());
            FlowSamples.AssertValid(read.ToContract(), "The round-tripped flow " + flow.Id);
        }
    }

    [Fact]
    public void FromContract_ReadsTheModel() {
        var flow = CanopyFlow.FromContract(FlowSamples.Everything().ToContract());
        Assert.Equal(CanopyFlowMode.Free, flow.Mode);
        Assert.Equal(CanopyGridDensity.Compact, flow.Density);
        Assert.Equal("rev-12", flow.Baseline);
        Assert.Equal("Pole {column} jest wymagane.", flow.Labels!.GridEditRequired);
        Assert.Contains("token", flow.StoredSecrets);
        var window = flow.Steps.Single(step => step.Id == "when").Fields.Single(field => field.Id == "window");
        Assert.Equal(TimeSpan.FromMinutes(5), window.MinimumDuration);
        Assert.Equal(new[] { CanopyFlowDurationUnit.Minutes, CanopyFlowDurationUnit.Hours }, window.DurationUnits);
        var delivery = flow.Steps.Single(step => step.Id == "delivery");
        Assert.True(delivery.IsOptional);
        Assert.True(delivery.Condition!.IsGroup);
        Assert.Equal(CanopyFlowGroupOperator.Any, delivery.Condition.GroupOperator);
        Assert.Equal(CanopyFlowItemRule.Email, delivery.Fields[0].ItemRule);
        Assert.Equal(CanopyFlowStepKind.Review, flow.Steps[flow.Steps.Count - 1].Kind);
        Assert.Null(flow.Steps[flow.Steps.Count - 1].Title);
    }

    [Theory]
    [InlineData("{\"kind\":\"grid\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\"}]}")]
    [InlineData("{\"kind\":\"flow\",\"version\":2,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\"}]}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1.0,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\"}]}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\"}],\"extra\":true}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\",\"color\":\"red\"}]}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\",\"fields\":[{\"id\":\"f\",\"type\":\"text\",\"label\":\"F\",\"size\":3}]}]}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\",\"fields\":[{\"id\":\"f\",\"type\":\"slider\",\"label\":\"F\"}]}]}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\",\"fields\":[{\"id\":\"f\",\"type\":\"number\",\"label\":\"F\",\"default\":\"5\"}]}]}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\",\"fields\":[{\"id\":\"f\",\"type\":\"date\",\"label\":\"F\",\"default\":\"2026-02-30\"}]}]}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\",\"fields\":[{\"id\":\"f\",\"type\":\"text\",\"label\":\"F\",\"validation\":{\"min\":1}}]}]}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\",\"fields\":[{\"id\":\"f\",\"type\":\"secret\",\"label\":\"F\"}]}],\"initial\":{\"f\":\"x\"}}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\"}],\"labels\":{\"notALabel\":\"x\"}}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[{\"id\":\"s\",\"title\":\"S\",\"when\":{\"operator\":\"xor\",\"filters\":[]}}]}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"steps\":[]}")]
    [InlineData("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\"}")]
    [InlineData("[]")]
    public void FromContract_InvalidDocument_Throws(string json) {
        Assert.Throws<InvalidOperationException>(() => CanopyFlow.FromContract(json));
    }

    [Theory]
    [InlineData("{\"kind\":\"flow\",\"kind\":\"flow\"}")]
    [InlineData("{\"kind\":\"flow\"} x")]
    [InlineData("{\"kind\":\"flow\",}")]
    [InlineData("{'kind':'flow'}")]
    [InlineData("{\"kind\":\"fl\u0001ow\"}")]
    [InlineData("{\"kind\":\"\\ud800\"}")]
    [InlineData("{\"kind\":\"\\x\"}")]
    [InlineData("{\"n\":01}")]
    [InlineData("{\"n\":1e999}")]
    [InlineData("{\"n\":.5}")]
    [InlineData("")]
    [InlineData("nul")]
    public void FromContract_MalformedJson_ThrowsFormatException(string json) {
        Assert.Throws<FormatException>(() => CanopyFlow.FromContract(json));
    }

    [Fact]
    public void FromContract_RejectsDeepNestingAndHugeInput() {
        var deep = new string('[', 65) + new string(']', 65);
        Assert.Throws<FormatException>(() => CanopyFlow.FromContract(deep));
        var fine = new string('[', 64) + new string(']', 64);
        Assert.Throws<InvalidOperationException>(() => CanopyFlow.FromContract(fine));
        var huge = "\"" + new string('a', 4 * 1024 * 1024) + "\"";
        Assert.Throws<FormatException>(() => CanopyFlow.FromContract(huge));
        Assert.Throws<ArgumentNullException>(() => CanopyFlow.FromContract(null!));
    }

    [Fact]
    public void FromContract_ReadsEscapesAndSurrogatePairs() {
        var json = "{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"Caf\\u00e9 \\ud83d\\ude00 \\\"x\\\" \\/ \u00e9\",\"steps\":[{\"id\":\"s\",\"title\":\"S\"}]}";
        Assert.Equal("Café 😀 \"x\" / é", CanopyFlow.FromContract(json).Title);
    }

    [Fact]
    public void FromContract_AcceptsExplicitDefaults() {
        var json = "{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"mode\":\"linear\",\"layout\":{\"orientation\":\"auto\"},\"density\":\"normal\",\"timeZone\":\"utc\"," +
            "\"steps\":[{\"id\":\"s\",\"type\":\"form\",\"title\":\"S\",\"fields\":[{\"id\":\"f\",\"type\":\"text\",\"label\":\"F\",\"width\":\"full\",\"required\":false}]}],\"labels\":{}}";
        FlowSamples.AssertValid(json, "A document with explicit defaults");
        var flow = CanopyFlow.FromContract(json);
        Assert.Equal(CanopyGridDensity.Default, flow.Density);
        Assert.Null(flow.Labels);
        Assert.Equal("{\"kind\":\"flow\",\"version\":1,\"id\":\"a\",\"title\":\"A\",\"density\":\"normal\",\"steps\":[{\"id\":\"s\",\"title\":\"S\",\"fields\":[{\"id\":\"f\",\"type\":\"text\",\"label\":\"F\"}]}]}", flow.ToContract());
    }

    [Fact]
    public void Schema_RejectsDocumentsOutsideTheContract() {
        var json = FlowSamples.MailServer().ToContract();
        Assert.False(FlowSamples.Evaluate(Mutate(json, root => root["extra"] = 1)).IsValid);
        Assert.False(FlowSamples.Evaluate(Mutate(json, root => root["version"] = 2)).IsValid);
        Assert.False(FlowSamples.Evaluate(Mutate(json, root => root["steps"]![0]!["fields"]![0]!["type"] = "slider")).IsValid);
        Assert.False(FlowSamples.Evaluate(Mutate(json, root => root["steps"]![0]!["fields"]![0]!["rows"] = 4)).IsValid);
        Assert.False(FlowSamples.Evaluate(Mutate(json, root => root["steps"]![0]!["when"] = JsonNode.Parse("{\"operator\":\"and\",\"filters\":[{\"field\":\"x\",\"operator\":\"between\",\"values\":[1]}]}"))).IsValid);
        Assert.False(FlowSamples.Evaluate(Mutate(json, root => root["steps"]![2]!["fields"] = new JsonArray())).IsValid);
    }

    [Fact]
    public void ToContract_EscapesTextForScripts() {
        var flow = new CanopyFlow("a", "</script><b>&") { Description = "line\nbreak" };
        flow.Step("s", "Step");
        var json = flow.ToContract();
        Assert.DoesNotContain("</script", json);
        Assert.Equal("</script><b>&", CanopyFlow.FromContract(json).Title);
        Assert.Equal(Encoding.UTF8.GetByteCount(json), Encoding.UTF8.GetBytes(json).Length);
    }

    private static string Mutate(string json, Action<JsonObject> change) {
        var node = JsonNode.Parse(json)!.AsObject();
        change(node);
        return node.ToJsonString();
    }
}
