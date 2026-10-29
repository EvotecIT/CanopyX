using System.Text.Json.Nodes;
using Json.Schema;

namespace CanopyX.Tests.ViewIntents;

public sealed class ViewIntentTests {
    private static readonly JsonSchema Schema = ViewIntentSchema.Value;

    [Fact]
    public void ValidatesTypedSnapshotAndSchemaWithoutChangingGrid() {
        var view = View();
        var before = view.ToJson();
        var root = Intent(new JsonObject {
            ["search"] = "<script>untrusted</script>", ["searchMode"] = "words",
            ["sort"] = JsonNode.Parse("[{\"column\":\"amount\",\"direction\":\"desc\"}]"),
            ["filters"] = JsonNode.Parse("[{\"column\":\"date\",\"operator\":\"ge\",\"values\":[\"2026-10-25T07:30:00.123Z\"]},{\"column\":\"name\",\"operator\":\"eq\",\"values\":[true]}]")
        });
        root["columns"] = new JsonArray("amount", "name");
        var accepted = CanopyViewIntentValidator.Validate(root.ToJsonString(), view);
        root["query"]!["search"] = "changed by caller";
        Assert.Equal("inventory", accepted.View);
        Assert.Equal(new[] { "amount", "name" }, accepted.Columns);
        Assert.Contains("untrusted", accepted.ToJson());
        Assert.DoesNotContain("<script>", accepted.ToJson());
        Assert.DoesNotContain("changed by caller", accepted.ToJson());
        Assert.True(Evaluate(accepted.ToJson()));
        Assert.Equal(before, view.ToJson());
    }

    [Fact]
    public void EmptyArraysAndNullGroupAreExplicitClearOperations() {
        var root = Intent(new JsonObject { ["search"] = "", ["sort"] = new JsonArray(), ["filters"] = new JsonArray(), ["filterGroup"] = null, ["groupBy"] = new JsonArray() });
        var accepted = CanopyViewIntentValidator.Validate(root.ToJsonString(), View());
        Assert.True(Evaluate(accepted.ToJson()));
        var query = JsonNode.Parse(accepted.ToJson())!["query"]!;
        Assert.True(query.AsObject().ContainsKey("filterGroup"));
        Assert.Null(query["filterGroup"]);
        Assert.Empty(query["sort"]!.AsArray());
    }

    [Fact]
    public void SchemaVersionUsesJsonNumericEqualityAndColumnsCanBeTheOnlyChange() {
        var root = Intent(new JsonObject()); root["columns"] = new JsonArray("name");
        var json = root.ToJsonString().Replace("\"version\":1", "\"version\":1.0");
        Assert.True(Evaluate(json));
        var accepted = CanopyViewIntentValidator.Validate(json, View());
        Assert.Equal(new[] { "name" }, accepted.Columns);
    }

    [Theory]
    [InlineData("wrong-view")]
    [InlineData("wrong-protocol")]
    [InlineData("wrong-type")]
    [InlineData("wrong-version")]
    [InlineData("missing-version")]
    [InlineData("empty-intent")]
    [InlineData("query-null")]
    [InlineData("unknown-field")]
    [InlineData("query-endpoint")]
    [InlineData("query-offset")]
    [InlineData("unknown-sort")]
    [InlineData("duplicate-sort")]
    [InlineData("bad-direction")]
    [InlineData("unknown-filter")]
    [InlineData("blocked-filter")]
    [InlineData("unknown-operator")]
    [InlineData("numeric-text-match")]
    [InlineData("text-range")]
    [InlineData("wrong-number")]
    [InlineData("null-operand")]
    [InlineData("wrong-arity")]
    [InlineData("missing-values")]
    [InlineData("invalid-date")]
    [InlineData("unsafe-number")]
    [InlineData("unknown-column")]
    [InlineData("empty-columns")]
    [InlineData("duplicate-column")]
    [InlineData("empty-group")]
    [InlineData("unknown-aggregate")]
    [InlineData("duplicate-grouping")]
    public void RejectsReachableInvalidInputBeforeProducingSnapshot(string boundary) {
        var root = Intent(new JsonObject { ["search"] = "needle" });
        var query = root["query"]!.AsObject();
        switch (boundary) {
            case "wrong-view": root["view"] = "other"; break;
            case "wrong-protocol": root["protocol"] = "canopyx/3"; break;
            case "wrong-type": root["type"] = "gridCommit"; break;
            case "wrong-version": root["version"] = 2; break;
            case "missing-version": root.Remove("version"); break;
            case "empty-intent": query.Clear(); break;
            case "query-null": root["query"] = null; break;
            case "unknown-field": root["allow_write"] = true; break;
            case "query-endpoint": query["endpoint"] = "https://example.test"; break;
            case "query-offset": query["offset"] = 100; break;
            case "unknown-sort": query["sort"] = JsonNode.Parse("[{\"column\":\"missing\",\"direction\":\"asc\"}]"); break;
            case "duplicate-sort": query["sort"] = JsonNode.Parse("[{\"column\":\"name\",\"direction\":\"asc\"},{\"column\":\"name\",\"direction\":\"desc\"}]"); break;
            case "bad-direction": query["sort"] = JsonNode.Parse("[{\"column\":\"name\",\"direction\":\"descending\"}]"); break;
            case "unknown-filter": query["filters"] = Filters("missing", "eq", 1); break;
            case "blocked-filter": query["filters"] = Filters("secret", "eq", "a"); break;
            case "unknown-operator": query["filters"] = Filters("name", "execute", "a"); break;
            case "numeric-text-match": query["filters"] = Filters("amount", "contains", "1"); break;
            case "text-range": query["filters"] = Filters("name", "ge", "a"); break;
            case "wrong-number": query["filters"] = Filters("amount", "eq", "1"); break;
            case "null-operand": query["filters"] = Filters("amount", "eq", null); break;
            case "wrong-arity": query["filters"] = Filters("name", "isNull", "a"); break;
            case "missing-values": query["filters"] = JsonNode.Parse("[{\"column\":\"name\",\"operator\":\"isNull\"}]"); break;
            case "invalid-date": query["filters"] = Filters("date", "eq", "2026-02-30T00:00:00Z"); break;
            case "unsafe-number": query["filters"] = Filters("amount", "eq", 9007199254740992L); break;
            case "unknown-column": root["columns"] = new JsonArray("missing"); break;
            case "empty-columns": root["columns"] = new JsonArray(); break;
            case "duplicate-column": root["columns"] = new JsonArray("name", "name"); break;
            case "empty-group": query["filterGroup"] = Group(); break;
            case "unknown-aggregate": query["groupBy"] = JsonNode.Parse("[{\"column\":\"name\",\"direction\":\"asc\",\"aggregate\":\"missing\"}]"); break;
            case "duplicate-grouping": query["groupBy"] = JsonNode.Parse("[{\"column\":\"name\",\"direction\":\"asc\"},{\"column\":\"name\",\"direction\":\"asc\"}]"); break;
            default: throw new ArgumentOutOfRangeException(nameof(boundary));
        }
        Assert.ThrowsAny<Exception>(() => CanopyViewIntentValidator.Validate(root.ToJsonString(), View()));
    }

    [Fact]
    public void StrictReaderRejectsDuplicateKeysMalformedJsonAndOversizePayloads() {
        var valid = Intent(new JsonObject { ["search"] = "ok" }).ToJsonString();
        Assert.Throws<FormatException>(() => CanopyViewIntentValidator.Validate(valid.Replace("\"version\":1", "\"version\":1,\"version\":1"), View()));
        Assert.Throws<FormatException>(() => CanopyViewIntentValidator.Validate(valid + " trailing", View()));
        var padded = valid + new string(' ', CanopyViewIntentValidator.MaximumLength - valid.Length);
        Assert.True(Evaluate(CanopyViewIntentValidator.Validate(padded, View()).ToJson()));
        Assert.Throws<FormatException>(() => CanopyViewIntentValidator.Validate(padded + " ", View()));
    }

    [Theory]
    [InlineData(8, true)]
    [InlineData(9, false)]
    public void GroupDepthMatchesExistingQueryBoundary(int depth, bool accepted) {
        var group = Group(Filters("amount", "ge", 1));
        for (var index = 1; index < depth; index++) group = Group(groups: new JsonArray(group));
        Check(Intent(new JsonObject { ["filterGroup"] = group }), accepted);
    }

    [Theory]
    [InlineData(63, true)]
    [InlineData(64, false)]
    public void PredicateBudgetCountsFlatAndNestedFiltersTogether(int flat, bool accepted) {
        var filters = new JsonArray(Enumerable.Range(0, flat).Select(_ => Filters("amount", "ge", 0)[0]!.DeepClone()).ToArray());
        Check(Intent(new JsonObject { ["filters"] = filters, ["filterGroup"] = Group(Filters("name", "isNotNull")) }), accepted);
    }

    [Theory]
    [InlineData(63, true)]
    [InlineData(64, false)]
    public void GroupCountIncludesRootAndNestedGroups(int children, bool accepted) {
        var groups = new JsonArray(Enumerable.Range(0, children).Select(_ => (JsonNode)Group(Filters("amount", "ge", 0))).ToArray());
        Check(Intent(new JsonObject { ["filterGroup"] = Group(groups: groups) }), accepted);
    }

    [Theory]
    [InlineData(1000, true)]
    [InlineData(1001, false)]
    public void MembershipUsesExistingOperandBoundary(int count, bool accepted) {
        var filter = Filters("amount", "in")[0]!.AsObject();
        filter["values"] = new JsonArray(Enumerable.Range(0, count).Select(value => (JsonNode)JsonValue.Create(value)!).ToArray());
        Check(Intent(new JsonObject { ["filters"] = new JsonArray(filter.DeepClone()) }), accepted);
    }

    [Fact]
    public void GroupingUsesDeclaredSortableColumnsAndAggregates() {
        var root = Intent(new JsonObject { ["groupBy"] = JsonNode.Parse("[{\"column\":\"name\",\"direction\":\"desc\",\"aggregate\":\"total\"}]") });
        Check(root, true);
        var view = View(); view.Reporting = null;
        Assert.Throws<InvalidOperationException>(() => CanopyViewIntentValidator.Validate(root.ToJsonString(), view));
    }

    [Fact]
    public void SchemaRejectsExecutableFieldsUnknownOperatorsAndOperandArity() {
        var root = Intent(new JsonObject { ["filters"] = Filters("name", "eq", "a") });
        Assert.True(Evaluate(root.ToJsonString()));
        root["query"]!["filters"]![0]!["operator"] = "execute";
        Assert.False(Evaluate(root.ToJsonString()));
        root["query"]!["filters"]![0]!["operator"] = "isNull";
        Assert.False(Evaluate(root.ToJsonString()));
        root["query"] = new JsonObject { ["search"] = "a" }; root["endpoint"] = "/write";
        Assert.False(Evaluate(root.ToJsonString()));
    }

    [Fact]
    public void RegexSearchIntentRetainsItsModeSchemaAndTargetOptIn() {
        var view = View();
        view.AllowRegexSearch = true;
        var proposal = Intent(new JsonObject { ["search"] = "^Record [13]$", ["searchMode"] = "regex" });
        var accepted = CanopyViewIntentValidator.Validate(proposal.ToJsonString(), view);
        Assert.True(Evaluate(accepted.ToJson()));
        var query = JsonNode.Parse(accepted.ToJson())!["query"]!;
        Assert.Equal("regex", query["searchMode"]!.GetValue<string>());
        Assert.Equal("^Record [13]$", query["search"]!.GetValue<string>());
        view.AllowRegexSearch = false;
        Assert.Throws<InvalidOperationException>(() => CanopyViewIntentValidator.Validate(accepted.ToJson(), view));
        view.AllowRegexSearch = true;
        proposal["query"]!["search"] = "[";
        Assert.ThrowsAny<Exception>(() => CanopyViewIntentValidator.Validate(proposal.ToJsonString(), view));
    }

    private static void Check(JsonObject intent, bool accepted) {
        if (accepted) Assert.True(Evaluate(CanopyViewIntentValidator.Validate(intent.ToJsonString(), View()).ToJson()));
        else Assert.ThrowsAny<Exception>(() => CanopyViewIntentValidator.Validate(intent.ToJsonString(), View()));
    }
    private static bool Evaluate(string json) {
        using var document = System.Text.Json.JsonDocument.Parse(json);
        return Schema.Evaluate(document.RootElement).IsValid;
    }
    private static JsonObject Intent(JsonObject query) => new() { ["protocol"] = "canopyx/2", ["type"] = "viewIntent", ["version"] = 1, ["view"] = "inventory", ["query"] = query };
    private static JsonArray Filters(string column, string op, object? value = null) => new(new JsonObject {
        ["column"] = column, ["operator"] = op,
        ["values"] = op is "isNull" or "isNotNull" && value == null ? new JsonArray() : new JsonArray(System.Text.Json.JsonSerializer.SerializeToNode(value))
    });
    private static JsonObject Group(JsonArray? filters = null, JsonArray? groups = null) => new() { ["operator"] = "and", ["filters"] = filters ?? new JsonArray(), ["groups"] = groups ?? new JsonArray() };
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("inventory", "Inventory") { Reporting = new CanopyGridReporting { Groupable = true } };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("date", "Date") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("secret", "Secret") { Filterable = false });
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("total", "amount", CanopyGridAggregateOperation.Sum, "Total {value}"));
        return view;
    }
}
