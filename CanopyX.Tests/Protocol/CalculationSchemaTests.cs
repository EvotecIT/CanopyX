using System.Text.Json;
using System.Text.Json.Nodes;
using Json.Schema;

namespace CanopyX.Tests.Protocol;

/// <summary>Schema contracts for authored calculation columns and optional inline-editor preferences.</summary>
public sealed class CalculationSchemaTests {
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void AuthoredColumnWriterMatchesSchemaWithOrWithoutTheInlineEditor(bool editable) {
        var view = View(); view.CalculatedColumnsEditable = editable;
        view.Labels.GridCalculationError = "Calculation failed: {error}";
        var row = new CanopyGridRow("row"); row.Cells["amount"] = 3d; view.Rows.Add(row);
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "authored calculated column");
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal("[amount] * 2", root.GetProperty("columns")[1].GetProperty("calculation").GetString());
        Assert.Equal(6d, root.GetProperty("rows")[0].GetProperty("cells").GetProperty("double").GetDouble());
        Assert.Equal(editable, root.TryGetProperty("calculatedColumnsEditable", out _));
        Assert.False(root.GetProperty("columns")[1].TryGetProperty("editable", out _));
    }

    [Fact]
    public void HostedWriterDeclaresCalculationWithoutEnablingAClientEditorOrRecomputingPageValues() {
        var view = View(); view.Source = CanopyGridSource.HostedOffset();
        ProtocolSchema.AssertValid(view.ToJson(), "authored hosted calculation");
        var row = new CanopyGridRow("server-row"); row.Cells["amount"] = 3d; row.Cells["double"] = 99d;
        var page = new CanopyGridPage(view.Id, "r1", 0, 1, 1); page.Rows.Add(row);
        var json = page.ToJson(view);
        ProtocolSchema.AssertValid(json, "server-provided calculated page");
        using var document = JsonDocument.Parse(json);
        Assert.Equal(99d, document.RootElement.GetProperty("items")[0].GetProperty("cells").GetProperty("double").GetDouble());
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2048)]
    public void WriterAcceptsTheExpressionLengthBoundaries(int length) {
        var view = View(); view.Columns[1].Calculation = CanopyCalculation.Parse("1" + new string(' ', length - 1));
        ProtocolSchema.AssertValid(view.ToJson(), "bounded expression");
    }

    [Fact]
    public void SchemaCountsCalculatedColumnsWithoutLimitingOrdinaryColumns() {
        var view = View(); view.Columns.RemoveAt(1);
        for (var index = 0; index < 32; index++) view.Columns.Add(new CanopyColumn("c" + index, "Calculation " + index) {
            Kind = CanopyColumnKind.Number, Calculation = CanopyCalculation.Parse("[amount] + 1")
        });
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "32 calculations plus a source column");
        var overflow = ProtocolSchema.Mutate(json, document => {
            var extra = document["columns"]![1]!.DeepClone(); extra["id"] = "overflow"; document["columns"]!.AsArray().Add(extra);
        });
        Assert.False(ProtocolSchema.Evaluate(overflow).IsValid);
    }

    [Theory]
    [InlineData("empty_expression")]
    [InlineData("whitespace_expression")]
    [InlineData("expression_limit")]
    [InlineData("nonstring_expression")]
    [InlineData("editable_calculation")]
    [InlineData("hosted_editor")]
    [InlineData("editor_flag_type")]
    public void SchemaRejectsMalformedAuthoredCalculations(string problem) {
        var json = ProtocolSchema.Mutate(View().ToJson(), document => {
            var column = document["columns"]![1]!;
            switch (problem) {
                case "empty_expression": column["calculation"] = ""; break;
                case "whitespace_expression": column["calculation"] = "   "; break;
                case "expression_limit": column["calculation"] = "1" + new string(' ', 2048); break;
                case "nonstring_expression": column["calculation"] = 12; break;
                case "editable_calculation": column["editable"] = true; break;
                case "hosted_editor": document["calculatedColumnsEditable"] = true; document["source"] = new JsonObject { ["kind"] = "host" }; document.Remove("rows"); break;
                case "editor_flag_type": document["calculatedColumnsEditable"] = "true"; break;
            }
        });
        Assert.False(ProtocolSchema.Evaluate(json).IsValid, problem);
    }

    [Fact]
    public void TreeColumnsRejectCalculationMetadata() {
        var view = new CanopyTreeView("tree", "Tree"); view.Columns.Add(new CanopyColumn("name", "Name"));
        var json = ProtocolSchema.Mutate(view.ToJson(), document => document["columns"]![0]!["calculation"] = "1");
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
    }

    [Theory]
    [InlineData("calculatedColumns")]
    [InlineData("calculatedColumnsEditable")]
    [InlineData("calculation")]
    public void QueriesReferToDeclaredColumnsWithoutCarryingCalculationPrograms(string field) {
        var view = View();
        var query = new CanopyGridQuery(view.Id);
        query.Filters.Add(new CanopyGridFilter("double", CanopyGridFilterOperator.GreaterThan, new CanopyCell(5d)));
        var json = query.ToJson(view);
        ProtocolSchema.AssertValid(json, "query over a declared calculated column");
        using var document = JsonDocument.Parse(json);
        Assert.False(document.RootElement.TryGetProperty(field, out _));
        var malformed = ProtocolSchema.Mutate(json, root => root[field] = new JsonArray());
        Assert.False(ProtocolSchema.Evaluate(malformed).IsValid);
    }

    [Fact]
    public void SavedCalculationDefinitionsAcceptBothEmptyAndBoundedSets() {
        var schema = PreferenceSchema(); var envelope = Preferences();
        Assert.True(Valid(schema, envelope));
        var current = envelope["current"]!;
        current["calculatedColumns"] = new JsonArray();
        Assert.True(Valid(schema, envelope));
        current["calculatedColumns"] = new JsonArray(Enumerable.Range(0, 32).Select(index => (JsonNode?)Definition("c" + index)).ToArray());
        Assert.True(Valid(schema, envelope));
        current["calculatedColumns"]!.AsArray().Add(Definition("overflow"));
        Assert.False(Valid(schema, envelope));
    }

    [Theory]
    [InlineData("expression_property")]
    [InlineData("expression_limit")]
    [InlineData("title_limit")]
    [InlineData("blank_title")]
    [InlineData("unknown_kind")]
    [InlineData("editable_definition")]
    public void SavedCalculationDefinitionsRejectMalformedEntries(string problem) {
        var envelope = Preferences(); var item = envelope["current"]!["calculatedColumns"]![0]!.AsObject();
        switch (problem) {
            case "expression_property": item.Remove("expression"); item["calculation"] = "[amount] * 2"; break;
            case "expression_limit": item["expression"] = new string('1', 2049); break;
            case "title_limit": item["title"] = new string('t', 257); break;
            case "blank_title": item["title"] = "   "; break;
            case "unknown_kind": item["kind"] = "boolean"; break;
            case "editable_definition": item["editable"] = true; break;
        }
        Assert.False(Valid(PreferenceSchema(), envelope), problem);
    }

    private static readonly Lazy<JsonSchema> SavedSchema = new(() => {
        var root = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Schema", "canopyx-2.schema.json")))!.AsObject();
        root["$id"] = "https://evotec.xyz/canopyx/tests/calculated-column-preferences";
        root["oneOf"] = new JsonArray(new JsonObject { ["$ref"] = "#/$defs/gridViewSettings" });
        return JsonSchema.FromText(root.ToJsonString());
    });
    private static JsonSchema PreferenceSchema() => SavedSchema.Value;
    private static bool Valid(JsonSchema schema, JsonNode value) => schema.Evaluate(JsonSerializer.SerializeToElement(value)).IsValid;
    private static JsonObject Definition(string id) => new() { ["id"] = id, ["title"] = "Double", ["kind"] = "number", ["expression"] = "[amount] * 2" };
    private static JsonObject Preferences() {
        var view = View();
        return new JsonObject {
            ["version"] = 1, ["view"] = view.Id, ["views"] = new JsonArray(),
            ["current"] = new JsonObject {
                ["version"] = 1, ["view"] = view.Id, ["timeZone"] = "utc", ["selection"] = new JsonArray(), ["scrollTop"] = 0,
                ["query"] = JsonNode.Parse(new CanopyGridQuery(view.Id).ToJson(view)),
                ["columns"] = new JsonArray(new JsonObject { ["id"] = "amount", ["width"] = 160, ["hidden"] = false }),
                ["calculatedColumns"] = new JsonArray(Definition("double"))
            }
        };
    }
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("calculation-schema", "Calculations");
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("double", "Double") { Kind = CanopyColumnKind.Number, Filterable = true, Sortable = true, Calculation = CanopyCalculation.Parse("[amount] * 2") });
        return view;
    }
}
