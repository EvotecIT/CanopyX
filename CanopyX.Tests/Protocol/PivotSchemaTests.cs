using System.Text.Json;
using System.Text.Json.Nodes;
using CanopyX.Data;
using Json.Schema;

namespace CanopyX.Tests.Protocol;

/// <summary>Checks the pivot and atomic-tuple writer contracts against the versioned public schema.</summary>
public sealed class PivotSchemaTests {
    [Fact]
    public void AuthoredPivotAndComputedResultMatchSchemaWithoutDatasetOwnership() {
        var view = View();
        ProtocolSchema.AssertValid(view.ToJson(), "authored reporting pivot");
        var json = Result(view);
        ProtocolSchema.AssertValid(json, "computed data-only pivot");
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.False(root.TryGetProperty("query", out _));
        Assert.False(root.TryGetProperty("revision", out _));
        Assert.True(root.GetProperty("columnsLimited").GetBoolean());
        Assert.Contains(root.GetProperty("columns").EnumerateArray(), node => node.GetProperty("other").GetBoolean());
        Assert.Contains(root.GetProperty("columns").EnumerateArray(), node => node.GetProperty("path").EnumerateArray()
            .Any(value => value.ValueKind == JsonValueKind.String && value.GetString()!.StartsWith("2026-", StringComparison.Ordinal)));
        Assert.Contains(root.GetProperty("rows").EnumerateArray(), node => node.GetProperty("path").EnumerateArray().Any(value => value.ValueKind == JsonValueKind.Null));
    }

    [Fact]
    public async Task HostedPivotRequestAndWriterEchoMatchSchemaWithAtomicTuples() {
        var view = View();
        var query = Query(view);
        var request = new JsonObject {
            ["protocol"] = "canopyx/2", ["type"] = "gridPivotQuery", ["query"] = JsonNode.Parse(query.ToJson(view)),
            ["definition"] = JsonNode.Parse(view.ToJson())!["reporting"]!["pivot"]!.DeepClone()
        };
        ProtocolSchema.AssertValid(request.ToJsonString(), "hosted pivot request");
        var schema = new CanopyDataSchema(view);
        var values = view.Columns.ToDictionary(column => column.Id, column => new Func<CanopyGridRow, object?>(row => row.Cells.TryGetValue(column.Id, out var cell) ? cell?.Value : null));
        var provider = new CanopyInMemoryProvider<CanopyGridRow>(schema, () => view.Rows, row => row.Id, values, () => "schema-r1");
        var json = await new CanopyRemoteHandler(schema, provider).PivotAsync(request.ToJsonString());
        ProtocolSchema.AssertValid(json, "revisioned hosted pivot response");
        using var result = JsonDocument.Parse(json);
        Assert.Equal("schema-r1", result.RootElement.GetProperty("revision").GetString());
        Assert.Equal(2, result.RootElement.GetProperty("matched").GetInt32());
        Assert.True(JsonNode.DeepEquals(request["query"], JsonNode.Parse(result.RootElement.GetProperty("query").GetRawText())));
    }

    [Fact]
    public void TupleWritersPreserveRawNullBooleanDateAndBucketOperandsInBothNavigationSchemas() {
        var view = View(); var query = Query(view);
        query.TupleFilters.Add(new CanopyGridTupleFilter(new[] { new CanopyGridTupleColumn("amount", CanopyBucket.FixedWidth(10)) },
            new[] { new CanopyCell?[] { 1d }, new CanopyCell?[] { null } }, exclude: true));
        query.TupleFilters.Add(new CanopyGridTupleFilter(new[] { new CanopyGridTupleColumn("flag"), new CanopyGridTupleColumn("at") },
            new[] { new CanopyCell?[] { true, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc) } }));
        var json = query.ToJson(view);
        ProtocolSchema.AssertValid(json, "raw and bucketed tuples");
        var cursor = JsonNode.Parse(json)!.AsObject(); cursor["type"] = "gridCursorQuery"; cursor.Remove("offset");
        ProtocolSchema.AssertValid(cursor.ToJsonString(), "tuple criteria in a cursor document");
        using var document = JsonDocument.Parse(json);
        var tuples = document.RootElement.GetProperty("tupleFilters");
        Assert.Equal(JsonValueKind.Null, tuples[0].GetProperty("values")[1][0].ValueKind);
        Assert.True(tuples[1].GetProperty("exclude").GetBoolean());
        Assert.True(tuples[2].GetProperty("values")[0][0].GetBoolean());
        Assert.Equal(JsonValueKind.String, tuples[2].GetProperty("values")[0][1].ValueKind);
        var plain = new CanopyGridQuery(view.Id).ToJson(view);
        using var plainDocument = JsonDocument.Parse(plain);
        Assert.False(plainDocument.RootElement.TryGetProperty("tupleFilters", out _));
    }

    [Theory]
    [InlineData("predicate_limit")]
    [InlineData("empty_fields")]
    [InlineData("field_limit")]
    [InlineData("empty_operands")]
    [InlineData("operand_limit")]
    [InlineData("short_tuple")]
    [InlineData("long_tuple")]
    [InlineData("object_operand")]
    [InlineData("exclude_type")]
    [InlineData("unknown_field")]
    public void SchemaRejectsMalformedAtomicTupleDocuments(string problem) {
        var view = View();
        var json = ProtocolSchema.Mutate(Query(view).ToJson(view), document => {
            var tuple = document["tupleFilters"]![0]!.AsObject();
            switch (problem) {
                case "predicate_limit": document["tupleFilters"] = Copies(tuple, 9); break;
                case "empty_fields": tuple["columns"] = new JsonArray(); break;
                case "field_limit": tuple["columns"] = Copies(tuple["columns"]![0]!, 7); break;
                case "empty_operands": tuple["values"] = new JsonArray(); break;
                case "operand_limit": tuple["values"] = Copies(tuple["values"]![0]!, 201); break;
                case "short_tuple": tuple["values"]![0]!.AsArray().RemoveAt(1); break;
                case "long_tuple": tuple["values"]![0]!.AsArray().Add("extra"); break;
                case "object_operand": tuple["values"]![0]![0] = new JsonObject { ["value"] = "North" }; break;
                case "exclude_type": tuple["exclude"] = "false"; break;
                case "unknown_field": tuple["columns"]![0]!["operator"] = "eq"; break;
            }
        });
        Assert.False(ProtocolSchema.Evaluate(json).IsValid, problem);
    }

    [Theory]
    [InlineData("row_limit")]
    [InlineData("column_limit")]
    [InlineData("empty_values")]
    [InlineData("duplicate_values")]
    [InlineData("value_limit")]
    [InlineData("zero_cap")]
    [InlineData("cap_limit")]
    [InlineData("zero_top_n")]
    [InlineData("top_n_limit")]
    [InlineData("aggregate_axis_sort")]
    [InlineData("sort_direction")]
    public void SchemaRejectsMalformedAuthoredPivotDefinitions(string problem) {
        var json = ProtocolSchema.Mutate(View().ToJson(), document => {
            var pivot = document["reporting"]!["pivot"]!.AsObject();
            switch (problem) {
                case "row_limit": pivot["rows"] = Copies(pivot["rows"]![0]!, 5); break;
                case "column_limit": pivot["columns"] = Copies(pivot["columns"]![0]!, 3); break;
                case "empty_values": pivot["values"] = new JsonArray(); break;
                case "duplicate_values": pivot["values"] = new JsonArray("sum", "sum"); break;
                case "value_limit": pivot["values"] = new JsonArray(Enumerable.Range(0, 33).Select(index => (JsonNode?)JsonValue.Create("v" + index)).ToArray()); break;
                case "zero_cap": pivot["maxColumns"] = 0; break;
                case "cap_limit": pivot["maxColumns"] = 201; break;
                case "zero_top_n": pivot["topNColumns"] = 0; break;
                case "top_n_limit": pivot["topNColumns"] = 201; break;
                case "aggregate_axis_sort": pivot["rows"]![0]!["aggregate"] = "sum"; break;
                case "sort_direction": pivot["sortByTotal"]!["direction"] = "up"; break;
            }
        });
        Assert.False(ProtocolSchema.Evaluate(json).IsValid, problem);
    }

    [Theory]
    [InlineData("key_limit")]
    [InlineData("row_depth")]
    [InlineData("column_depth")]
    [InlineData("negative_count")]
    [InlineData("aggregate_type")]
    [InlineData("revision_without_query")]
    [InlineData("query_without_revision")]
    [InlineData("query_without_accepted_revision")]
    public void SchemaRejectsMalformedPivotResultsAndPartialOwnership(string problem) {
        var view = View();
        var json = ProtocolSchema.Mutate(Result(view), document => {
            switch (problem) {
                case "key_limit": document["rows"]![0]!["key"] = new string('k', 65537); break;
                case "row_depth": document["rows"]![0]!["path"] = new JsonArray(1, 2, 3, 4, 5); break;
                case "column_depth": document["columns"]![0]!["path"] = new JsonArray(1, 2, 3); break;
                case "negative_count": document["cells"]![0]!["count"] = -1; break;
                case "aggregate_type": document["cells"]![0]!["aggregates"]!["sum"] = "10"; break;
                case "revision_without_query": document["revision"] = "schema-r1"; break;
                case "query_without_revision": document["query"] = JsonNode.Parse(Query(view).ToJson(view)); break;
                case "query_without_accepted_revision":
                    document["revision"] = "schema-r1"; document["query"] = JsonNode.Parse(new CanopyGridQuery(view.Id).ToJson(view)); break;
            }
        });
        Assert.False(ProtocolSchema.Evaluate(json).IsValid, problem);
    }

    [Fact]
    public void SavedPivotDefinitionAndCollapseKeysMatchTheBoundedPreferenceSchema() {
        var view = View();
        var pivot = JsonNode.Parse(view.ToJson())!["reporting"]!["pivot"]!.DeepClone();
        pivot["active"] = true; pivot["collapsedRows"] = new JsonArray(new string('k', 65536)); pivot["collapsedColumns"] = new JsonArray("c|retained"); pivot["columnKey"] = "c:other";
        var state = new JsonObject {
            ["version"] = 1, ["view"] = view.Id, ["columns"] = new JsonArray(new JsonObject { ["id"] = "region", ["width"] = 120, ["hidden"] = false }),
            ["query"] = JsonNode.Parse(new CanopyGridQuery(view.Id).ToJson(view)), ["timeZone"] = "utc", ["selection"] = new JsonArray(), ["scrollTop"] = 0, ["pivot"] = pivot
        };
        var settings = new JsonObject { ["version"] = 1, ["view"] = view.Id, ["current"] = state, ["views"] = new JsonArray() };
        // Preference snapshots are a named subschema, not a canopyx/2 data envelope.
        var specification = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Schema", "canopyx-2.schema.json")))!.AsObject();
        specification["$id"] = "https://evotec.xyz/canopyx/tests/pivot-view-settings";
        specification["oneOf"] = new JsonArray(new JsonObject { ["$ref"] = "#/$defs/gridViewSettings" });
        var schema = JsonSchema.FromText(specification.ToJsonString());
        Assert.True(schema.Evaluate(JsonSerializer.SerializeToElement(settings)).IsValid);
        pivot["collapsedRows"]![0] = new string('k', 65537);
        Assert.False(schema.Evaluate(JsonSerializer.SerializeToElement(settings)).IsValid);
    }

    [Fact]
    public void SchemaRejectsResultCollectionsBeyondThePublishedMetadataBounds() {
        var specification = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Schema", "canopyx-2.schema.json")))!.AsObject();
        specification["$id"] = "https://evotec.xyz/canopyx/tests/pivot-result-bounds";
        var schema = JsonSchema.FromText(specification.ToJsonString());
        foreach (var (field, count) in new[] { ("rows", 10002), ("columns", 403), ("cells", 100001) }) {
            var result = JsonNode.Parse(Result(View()))!.AsObject();
            result[field] = Copies(result[field]![0]!, count);
            // Flag output stops at a violated collection bound without materializing per-item diagnostics.
            var evaluation = schema.Evaluate(JsonSerializer.SerializeToElement(result), new EvaluationOptions { OutputFormat = OutputFormat.Flag });
            Assert.False(evaluation.IsValid, field);
        }
    }

    [Fact]
    public void SparsePivotRejectsAnOversizedDisplayEvenWhenPopulatedIntersectionsFit() {
        var view = View(); var pivot = new CanopyGridPivot();
        pivot.Rows.Add(new CanopyGridGroupLevel("region")); pivot.Columns.Add(new CanopyGridGroupLevel("status")); pivot.Values.Add("sum");
        view.Reporting!.Pivot = pivot;
        var records = Enumerable.Range(0, 1000).Select(index => {
            var row = new CanopyGridRow("sparse-" + index); row.Cells["region"] = "R" + index; row.Cells["status"] = "C" + index % 100; row.Cells["amount"] = 1d;
            return row;
        }).ToArray();
        var accepted = CanopyPivot.Compute(view, pivot, records.Take(989));
        Assert.Equal(99990, (long)accepted.Rows.Count * accepted.Columns.Count * pivot.Values.Count);
        Assert.InRange(accepted.Cells.Count, 1, 100000);
        var error = Assert.Throws<InvalidOperationException>(() => CanopyPivot.Compute(view, pivot, records));
        Assert.Contains("100,000 display cells", error.Message);
    }

    private static JsonArray Copies(JsonNode node, int count) => new(Enumerable.Range(0, count).Select(_ => node.DeepClone()).ToArray());
    private static string Result(CanopyDataGridView view) => CanopyPivot.Compute(view, view.Reporting!.Pivot!, view.Rows).ToJson();
    private static CanopyGridQuery Query(CanopyDataGridView view) {
        var query = new CanopyGridQuery(view.Id) { Revision = "schema-r1" };
        query.TupleFilters.Add(new CanopyGridTupleFilter(new[] { new CanopyGridTupleColumn("region"), new CanopyGridTupleColumn("status") },
            new[] { new CanopyCell?[] { "North", "Open" }, new CanopyCell?[] { null, "Closed" } }));
        return query;
    }
    private static CanopyDataGridView View() {
        var pivot = new CanopyGridPivot { MaxColumns = 2, TopNColumns = 1, SortByTotal = "sum", SortDescending = true };
        pivot.Rows.Add(new CanopyGridGroupLevel("region")); pivot.Rows.Add(new CanopyGridGroupLevel("flag"));
        pivot.Columns.Add(new CanopyGridGroupLevel("at")); pivot.Columns.Add(new CanopyGridGroupLevel("status")); pivot.Values.Add("sum");
        var view = new CanopyDataGridView("pivot-schema", "Records") { Reporting = new CanopyGridReporting { Pivot = pivot, Pivotable = true } };
        foreach (var id in new[] { "region", "status", "flag", "at", "amount" }) view.Columns.Add(new CanopyColumn(id, id) {
            Kind = id == "amount" ? CanopyColumnKind.Number : id == "at" ? CanopyColumnKind.DateTime : CanopyColumnKind.Text, Sortable = true
        });
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Sum, "Total"));
        view.Labels.GridPivot = "Cross-tab";
        void Row(string id, string? region, string status, bool? flag, int month, double? amount) {
            var row = new CanopyGridRow(id); row.Cells["region"] = new CanopyCell(region); row.Cells["status"] = status; row.Cells["flag"] = flag.HasValue ? new CanopyCell(flag.Value) : new CanopyCell();
            row.Cells["at"] = new CanopyCell(new DateTime(2026, month, 1, 0, 0, 0, DateTimeKind.Utc)); row.Cells["amount"] = amount.HasValue ? new CanopyCell(amount.Value) : new CanopyCell(); view.Rows.Add(row);
        }
        Row("a", "North", "Open", true, 1, 10); Row("b", "North", "Closed", false, 1, 30); Row("c", null, "Closed", null, 2, null);
        return view;
    }
}
