using System.Text.Json;
using System.Text.Json.Nodes;
using Json.Schema;

namespace CanopyX.Tests.ViewIntents;

/// <summary>Contracts for data-only pivot, bucket and correlated drill-through proposals.</summary>
public sealed class ViewIntentAnalysisTests {
    private static readonly JsonSchema Schema = ViewIntentSchema.Value;

    [Theory]
    [InlineData("asc")]
    [InlineData("desc")]
    public void PivotDefinitionWithBucketsAndTotalSortRoundTripsWithoutChangingGrid(string direction) {
        var pivot = new CanopyGridPivot { MaxColumns = 12, TopNColumns = 5, SortByTotal = "total", SortDescending = direction == "desc" };
        pivot.Rows.Add(new CanopyGridGroupLevel("date", bucket: CanopyBucket.Calendar(CanopyBucketKind.Week)));
        pivot.Rows.Add(new CanopyGridGroupLevel("amount", true, bucket: CanopyBucket.FixedWidth(10, -5)));
        pivot.Columns.Add(new CanopyGridGroupLevel("region"));
        pivot.Columns.Add(new CanopyGridGroupLevel("amount", bucket: CanopyBucket.ExplicitEdges(-10, 0, 25.5)));
        pivot.Values.Add("total"); pivot.Values.Add("count");
        var source = View(); source.Reporting!.Pivot = pivot;
        var definition = JsonNode.Parse(source.ToJson())!["reporting"]!["pivot"]!.DeepClone();
        var root = Intent(); root["pivot"] = definition;
        root["query"] = new JsonObject { ["search"] = "<untrusted>", ["groupBy"] = new JsonArray(Level("date", new JsonObject { ["kind"] = "month" }, "total")) };
        root["columns"] = new JsonArray("amount", "date", "region");
        var view = View();
        var before = view.ToJson();

        var accepted = Accept(root, view);
        definition["maxColumns"] = 1;

        Assert.Equal(before, view.ToJson());
        Assert.Equal(new[] { "amount", "date", "region" }, accepted.Columns);
        Assert.DoesNotContain("<untrusted>", accepted.ToJson());
        var snapshot = JsonNode.Parse(accepted.ToJson())!;
        Assert.Equal(12, snapshot["pivot"]!["maxColumns"]!.GetValue<int>());
        Assert.Equal(direction, snapshot["pivot"]!["sortByTotal"]!["direction"]!.GetValue<string>());
        Assert.Equal(1, snapshot["pivot"]!["rows"]![0]!["bucket"]!["firstWeekday"]!.GetValue<int>());
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public void PivotOnlyDefinitionOrFalseIsAChangeWithOptionalEmptyQuery(bool clear, bool emptyQuery) {
        var root = Intent(); root["pivot"] = clear ? JsonValue.Create(false) : Pivot();
        if (emptyQuery) root["query"] = new JsonObject();

        var accepted = Accept(root);
        var snapshot = JsonNode.Parse(accepted.ToJson())!.AsObject();

        Assert.Null(accepted.Columns);
        Assert.False(snapshot.ContainsKey("columns"));
        Assert.Equal(emptyQuery, snapshot.ContainsKey("query"));
        Assert.True(JsonNode.DeepEquals(root["pivot"], snapshot["pivot"]));
    }

    [Fact]
    public void OmittedPivotRemainsAbsentAndPreservesConfiguredDefinition() {
        var view = View(); view.Reporting!.Pivot = ConfiguredPivot();
        var before = view.ToJson();
        var root = Intent(); root["query"] = new JsonObject { ["search"] = "retained" };

        var snapshot = JsonNode.Parse(Accept(root, view).ToJson())!.AsObject();

        Assert.False(snapshot.ContainsKey("pivot"));
        Assert.Equal(before, view.ToJson());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ConfiguredPivotEnablesDefinitionAndClearWithoutPivotableFlag(bool clear) {
        var view = View(); view.Reporting!.Pivotable = false; view.Reporting.Pivot = ConfiguredPivot();
        var before = view.ToJson();
        var root = Intent(); root["pivot"] = clear ? JsonValue.Create(false) : Pivot();

        Accept(root, view);

        Assert.Equal(before, view.ToJson());
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public void ExplicitPivotDefinitionAndClearRequireReportingOptIn(bool noReporting, bool clear) {
        var view = View(); view.Reporting!.Pivotable = false;
        if (noReporting) view.Reporting = null;
        var root = Intent(); root["pivot"] = clear ? JsonValue.Create(false) : Pivot();

        Assert.Throws<InvalidOperationException>(() => CanopyViewIntentValidator.Validate(root.ToJsonString(), view));
        root.Remove("pivot"); root["query"] = new JsonObject { ["search"] = "still allowed" };
        Accept(root, view);
    }

    [Fact]
    public void BucketGroupingUsesDeclaredAggregatesWithoutPivotOptIn() {
        var view = View(); view.Reporting!.Pivotable = false;
        var root = Intent(); root["query"] = new JsonObject { ["groupBy"] = new JsonArray(
            Level("amount", new JsonObject { ["kind"] = "edges", ["edges"] = new JsonArray(-5, 0, 50) }, "total"),
            Level("date", new JsonObject { ["kind"] = "month", ["timeZone"] = "UTC", ["firstWeekday"] = 1 })) };

        Accept(root, view);

        view.Reporting.Groupable = false;
        Assert.Throws<InvalidOperationException>(() => CanopyViewIntentValidator.Validate(root.ToJsonString(), view));
    }

    [Theory]
    [InlineData("day")]
    [InlineData("week")]
    [InlineData("month")]
    [InlineData("quarter")]
    [InlineData("year")]
    [InlineData("hour")]
    [InlineData("weekday")]
    public void CalendarKindsAcceptOmittedDefaultsAndNormalizedExportedSettings(string kind) {
        var root = Intent(); var pivot = Pivot(); root["pivot"] = pivot;
        pivot["rows"] = new JsonArray(Level("date", new JsonObject { ["kind"] = kind }));
        root["query"] = new JsonObject { ["groupBy"] = new JsonArray(Level("date", new JsonObject {
            ["kind"] = kind, ["timeZone"] = "UTC", ["firstWeekday"] = 1
        })) };

        var snapshot = JsonNode.Parse(Accept(root).ToJson())!;

        Assert.False(snapshot["pivot"]!["rows"]![0]!["bucket"]!.AsObject().ContainsKey("firstWeekday"));
        Assert.Equal(1, snapshot["query"]!["groupBy"]![0]!["bucket"]!["firstWeekday"]!.GetValue<int>());
    }

    [Theory]
    [InlineData("rows", 4, true)]
    [InlineData("rows", 5, false)]
    [InlineData("columns", 2, true)]
    [InlineData("columns", 3, false)]
    [InlineData("values", 0, false)]
    [InlineData("values", 32, true)]
    [InlineData("values", 33, false)]
    public void PivotAxesAndValuesEnforceCanonicalBounds(string field, int count, bool valid) {
        var view = View(); var root = Intent(); var pivot = Pivot(); root["pivot"] = pivot;
        if (field == "values") {
            view.Reporting!.Aggregates.Clear();
            for (var index = 0; index < 32; index++) view.Reporting.Aggregates.Add(new CanopyGridAggregate("v" + index, "amount", CanopyGridAggregateOperation.Sum, "Value"));
            pivot[field] = new JsonArray(Enumerable.Range(0, count).Select(index => (JsonNode)JsonValue.Create("v" + index)!).ToArray());
        } else {
            var ids = new[] { "name", "region", "amount", "date", "flag" };
            pivot[field] = new JsonArray(ids.Take(count).Select(id => (JsonNode)Level(id)).ToArray());
        }

        if (valid) Accept(root, view); else Reject(root, view);
    }

    [Theory]
    [InlineData("maxColumns", 0, false)]
    [InlineData("maxColumns", 1, true)]
    [InlineData("maxColumns", 200, true)]
    [InlineData("maxColumns", 201, false)]
    [InlineData("topNColumns", 0, false)]
    [InlineData("topNColumns", 1, true)]
    [InlineData("topNColumns", 200, true)]
    [InlineData("topNColumns", 201, false)]
    public void PivotColumnLimitsEnforceCanonicalBounds(string field, int limit, bool valid) {
        var root = Intent(); var pivot = Pivot(); root["pivot"] = pivot; pivot[field] = limit;
        if (valid) Accept(root); else Reject(root);
    }

    [Theory]
    [InlineData("unknown-row")]
    [InlineData("unknown-column")]
    [InlineData("unsortable-axis")]
    [InlineData("unfilterable-axis")]
    [InlineData("duplicate-axis")]
    [InlineData("unknown-value")]
    [InlineData("duplicate-value")]
    [InlineData("total-outside-values")]
    [InlineData("bad-direction")]
    [InlineData("missing-direction")]
    [InlineData("bad-total-direction")]
    [InlineData("unknown-group-column")]
    [InlineData("unknown-group-aggregate")]
    [InlineData("unsortable-group")]
    [InlineData("duplicate-group")]
    public void RejectsUndeclaredOrUnsupportedAnalysisBindings(string boundary) {
        var root = Intent(); var pivot = Pivot(); root["pivot"] = pivot;
        switch (boundary) {
            case "unknown-row": pivot["rows"]![0]!["column"] = "missing"; break;
            case "unknown-column": pivot["columns"]![0]!["column"] = "missing"; break;
            case "unsortable-axis": pivot["rows"]![0]!["column"] = "unsortable"; break;
            case "unfilterable-axis": pivot["columns"]![0]!["column"] = "secret"; break;
            case "duplicate-axis": pivot["rows"] = new JsonArray(Level("name"), Level("name")); break;
            case "unknown-value": pivot["values"] = new JsonArray("missing"); break;
            case "duplicate-value": pivot["values"] = new JsonArray("total", "total"); break;
            case "total-outside-values": pivot["sortByTotal"] = new JsonObject { ["aggregate"] = "count", ["direction"] = "desc" }; break;
            case "bad-direction": pivot["rows"]![0]!["direction"] = "up"; break;
            case "missing-direction": pivot["rows"]![0]!.AsObject().Remove("direction"); break;
            case "bad-total-direction": pivot["sortByTotal"] = new JsonObject { ["aggregate"] = "total", ["direction"] = "up" }; break;
            case "unknown-group-column": root["query"] = GroupQuery(Level("missing")); break;
            case "unknown-group-aggregate": root["query"] = GroupQuery(Level("name", aggregate: "missing")); break;
            case "unsortable-group": root["query"] = GroupQuery(Level("unsortable")); break;
            case "duplicate-group": root["query"] = GroupQuery(Level("name"), Level("name")); break;
            default: throw new ArgumentOutOfRangeException(nameof(boundary));
        }
        Assert.Throws<InvalidOperationException>(() => CanopyViewIntentValidator.Validate(root.ToJsonString(), View()));
    }

    [Theory]
    [InlineData("true")]
    [InlineData("null")]
    [InlineData("string")]
    [InlineData("array")]
    [InlineData("missing-rows")]
    [InlineData("missing-columns")]
    [InlineData("missing-values")]
    [InlineData("rows-object")]
    [InlineData("level-string")]
    [InlineData("values-object")]
    [InlineData("value-number")]
    [InlineData("null-max")]
    [InlineData("text-max")]
    [InlineData("fractional-max")]
    [InlineData("overflow-max")]
    [InlineData("null-top")]
    [InlineData("fractional-top")]
    [InlineData("null-total")]
    public void WrongKindOrIncompletePivotIsRejectedByValidatorAndSchema(string boundary) {
        var root = Intent(); var pivot = Pivot(); root["pivot"] = pivot;
        switch (boundary) {
            case "true": root["pivot"] = true; break;
            case "null": root["pivot"] = null; break;
            case "string": root["pivot"] = "false"; break;
            case "array": root["pivot"] = new JsonArray(); break;
            case "missing-rows": pivot.Remove("rows"); break;
            case "missing-columns": pivot.Remove("columns"); break;
            case "missing-values": pivot.Remove("values"); break;
            case "rows-object": pivot["rows"] = new JsonObject(); break;
            case "level-string": pivot["rows"] = new JsonArray("name"); break;
            case "values-object": pivot["values"] = new JsonObject(); break;
            case "value-number": pivot["values"] = new JsonArray(1); break;
            case "null-max": pivot["maxColumns"] = null; break;
            case "text-max": pivot["maxColumns"] = "10"; break;
            case "fractional-max": pivot["maxColumns"] = 1.5; break;
            case "overflow-max": pivot["maxColumns"] = 2147483648L; break;
            case "null-top": pivot["topNColumns"] = null; break;
            case "fractional-top": pivot["topNColumns"] = 2.5; break;
            case "null-total": pivot["sortByTotal"] = null; break;
            default: throw new ArgumentOutOfRangeException(nameof(boundary));
        }
        Assert.False(Evaluate(root.ToJsonString()));
        Assert.Throws<InvalidOperationException>(() => CanopyViewIntentValidator.Validate(root.ToJsonString(), View()));
    }

    [Theory]
    [InlineData("root", "endpoint")]
    [InlineData("root", "authorization")]
    [InlineData("query", "revision")]
    [InlineData("query", "offset")]
    [InlineData("query", "selected")]
    [InlineData("pivot", "options")]
    [InlineData("pivot", "collapsedRows")]
    [InlineData("pivot", "drill")]
    [InlineData("pivot", "showAs")]
    [InlineData("axis", "aggregate")]
    [InlineData("axis", "render")]
    [InlineData("total", "comparer")]
    [InlineData("bucket", "callback")]
    [InlineData("group", "endpoint")]
    public void RuntimeSavedStateAndExecutableExtrasAreRejectedAtEveryAnalysisBoundary(string location, string field) {
        var root = Intent(); var pivot = Pivot(); root["pivot"] = pivot;
        var bucket = new JsonObject { ["kind"] = "width", ["width"] = 10 };
        var axis = Level("amount", bucket); pivot["rows"] = new JsonArray(axis);
        var total = new JsonObject { ["aggregate"] = "total", ["direction"] = "desc" }; pivot["sortByTotal"] = total;
        var level = Level("name"); var query = GroupQuery(level); root["query"] = query;
        var target = location switch { "root" => root, "query" => query, "pivot" => pivot, "axis" => axis, "total" => total, "bucket" => bucket, "group" => level, _ => throw new ArgumentOutOfRangeException(nameof(location)) };
        target[field] = "untrusted";

        Assert.False(Evaluate(root.ToJsonString()));
        Assert.Throws<InvalidOperationException>(() => CanopyViewIntentValidator.Validate(root.ToJsonString(), View()));
    }

    [Theory]
    [InlineData("null")]
    [InlineData("unknown-kind")]
    [InlineData("numeric-kind")]
    [InlineData("wrong-column-kind")]
    [InlineData("missing-width")]
    [InlineData("zero-width")]
    [InlineData("negative-width")]
    [InlineData("text-origin")]
    [InlineData("width-calendar-option")]
    [InlineData("missing-edges")]
    [InlineData("empty-edges")]
    [InlineData("duplicate-edges")]
    [InlineData("descending-edges")]
    [InlineData("text-edge")]
    [InlineData("too-many-edges")]
    [InlineData("bad-weekday")]
    [InlineData("fractional-weekday")]
    [InlineData("calendar-width")]
    public void InvalidBucketsAreRejectedInBothPivotAndGrouping(string boundary) {
        JsonNode? bucket = new JsonObject { ["kind"] = "width", ["width"] = 10 };
        var column = "amount";
        switch (boundary) {
            case "null": bucket = null; break;
            case "unknown-kind": bucket = new JsonObject { ["kind"] = "decade" }; break;
            case "numeric-kind": bucket = new JsonObject { ["kind"] = "0" }; break;
            case "wrong-column-kind": column = "date"; break;
            case "missing-width": bucket!.AsObject().Remove("width"); break;
            case "zero-width": bucket!["width"] = 0; break;
            case "negative-width": bucket!["width"] = -1; break;
            case "text-origin": bucket!["origin"] = "0"; break;
            case "width-calendar-option": bucket!["timeZone"] = "UTC"; break;
            case "missing-edges": bucket = new JsonObject { ["kind"] = "edges" }; break;
            case "empty-edges": bucket = EdgeBucket(); break;
            case "duplicate-edges": bucket = EdgeBucket(1, 1); break;
            case "descending-edges": bucket = EdgeBucket(2, 1); break;
            case "text-edge": bucket = new JsonObject { ["kind"] = "edges", ["edges"] = new JsonArray("1") }; break;
            case "too-many-edges": bucket = EdgeBucket(Enumerable.Range(0, 201).Select(i => (double)i).ToArray()); break;
            case "bad-weekday": column = "date"; bucket = new JsonObject { ["kind"] = "week", ["firstWeekday"] = 7 }; break;
            case "fractional-weekday": column = "date"; bucket = new JsonObject { ["kind"] = "week", ["firstWeekday"] = 1.5 }; break;
            case "calendar-width": column = "date"; bucket = new JsonObject { ["kind"] = "month", ["width"] = 1 }; break;
            default: throw new ArgumentOutOfRangeException(nameof(boundary));
        }
        foreach (var pivotMode in new[] { false, true }) {
            var root = Intent(); var level = Level(column); level["bucket"] = bucket?.DeepClone();
            if (pivotMode) { var pivot = Pivot(); root["pivot"] = pivot; pivot["rows"] = new JsonArray(level); }
            else root["query"] = GroupQuery(level);
            Reject(root);
        }
    }

    [Fact]
    public void CalendarBucketRejectsUnknownTimeZoneThroughCanonicalFactory() {
        var root = Intent(); root["query"] = GroupQuery(Level("date", new JsonObject { ["kind"] = "day", ["timeZone"] = "CanopyX/NotAZone" }));
        Assert.Throws<TimeZoneNotFoundException>(() => CanopyViewIntentValidator.Validate(root.ToJsonString(), View()));
    }

    [Fact]
    public void BucketFiltersAndCorrelatedTuplesRoundTripIncludingNullsAndRawDates() {
        var tuple = Tuple();
        tuple["columns"] = new JsonArray(new JsonObject { ["column"] = "name" }, new JsonObject { ["column"] = "date", ["bucket"] = new JsonObject { ["kind"] = "month", ["timeZone"] = "UTC", ["firstWeekday"] = 1 } }, new JsonObject { ["column"] = "date" });
        tuple["values"] = new JsonArray(new JsonArray("West", 24309, "2026-10-25T07:30:00.123Z"), new JsonArray("East", null, null));
        tuple["exclude"] = true;
        var root = Intent(); root["pivot"] = Pivot();
        root["query"] = new JsonObject {
            ["filters"] = new JsonArray(Filter("date", new JsonObject { ["kind"] = "month" }, 24309)),
            ["filterGroup"] = new JsonObject { ["operator"] = "and", ["filters"] = new JsonArray(Filter("amount", new JsonObject { ["kind"] = "width", ["width"] = 10 }, 2)), ["groups"] = new JsonArray() },
            ["tupleFilters"] = new JsonArray(tuple)
        };

        var snapshot = JsonNode.Parse(Accept(root).ToJson())!;

        Assert.True(JsonNode.DeepEquals(root["query"], snapshot["query"]));
        Assert.True(snapshot["query"]!["tupleFilters"]![0]!["exclude"]!.GetValue<bool>());
        Assert.Null(snapshot["query"]!["tupleFilters"]![0]!["values"]![1]![1]);
    }

    [Fact]
    public void EmptyTupleArrayExplicitlyClearsAndOmissionPreservesTupleFilters() {
        var root = Intent(); root["query"] = new JsonObject { ["tupleFilters"] = new JsonArray() };
        Assert.Empty(JsonNode.Parse(Accept(root).ToJson())!["query"]!["tupleFilters"]!.AsArray());
        root["query"] = new JsonObject { ["search"] = "preserve scope" };
        Assert.False(JsonNode.Parse(Accept(root).ToJson())!["query"]!.AsObject().ContainsKey("tupleFilters"));
    }

    [Theory]
    [InlineData("tuples", 8, true)]
    [InlineData("tuples", 9, false)]
    [InlineData("fields", 0, false)]
    [InlineData("fields", 1, true)]
    [InlineData("fields", 6, true)]
    [InlineData("fields", 7, false)]
    [InlineData("rows", 0, false)]
    [InlineData("rows", 1, true)]
    [InlineData("rows", 200, true)]
    [InlineData("rows", 201, false)]
    public void TupleCountsFieldsAndRowsEnforceCanonicalBounds(string boundary, int count, bool valid) {
        var root = Intent(); var tuple = Tuple(); var tuples = new JsonArray();
        if (boundary == "fields") {
            var ids = new[] { "name", "region", "amount", "date", "flag", "other", "unsortable" };
            tuple["columns"] = new JsonArray(ids.Take(count).Select(id => (JsonNode)new JsonObject { ["column"] = id }).ToArray());
            tuple["values"] = new JsonArray(new JsonArray(Enumerable.Range(0, count).Select(_ => (JsonNode?)null).ToArray()));
        } else if (boundary == "rows") tuple["values"] = new JsonArray(Enumerable.Range(0, count).Select(_ => (JsonNode)new JsonArray("West", 2)).ToArray());
        for (var index = 0; index < (boundary == "tuples" ? count : 1); index++) tuples.Add(tuple.DeepClone());
        root["query"] = new JsonObject { ["tupleFilters"] = tuples };

        if (valid) Accept(root); else Reject(root);
    }

    [Theory]
    [InlineData("short-row")]
    [InlineData("wide-row")]
    [InlineData("unknown-column")]
    [InlineData("blocked-column")]
    [InlineData("raw-number-kind")]
    [InlineData("raw-date-kind")]
    [InlineData("invalid-date")]
    [InlineData("bucket-key-kind")]
    [InlineData("bucket-column-kind")]
    [InlineData("unknown-tuple-field")]
    [InlineData("unknown-column-field")]
    [InlineData("bad-exclude-kind")]
    [InlineData("null-tuples")]
    [InlineData("null-row")]
    [InlineData("missing-fields")]
    [InlineData("missing-values")]
    public void RejectsInvalidCorrelatedTuplesBeforeProducingSnapshot(string boundary) {
        var root = Intent(); var tuple = Tuple(); var query = new JsonObject { ["tupleFilters"] = new JsonArray(tuple) }; root["query"] = query;
        switch (boundary) {
            case "short-row": tuple["values"] = new JsonArray(new JsonArray("West")); break;
            case "wide-row": tuple["values"] = new JsonArray(new JsonArray("West", 2, 3)); break;
            case "unknown-column": tuple["columns"]![0]!["column"] = "missing"; break;
            case "blocked-column": tuple["columns"]![0]!["column"] = "secret"; break;
            case "raw-number-kind": tuple["values"]![0]![1] = "2"; break;
            case "raw-date-kind": tuple["columns"]![1]!["column"] = "date"; break;
            case "invalid-date": tuple["columns"]![1]!["column"] = "date"; tuple["values"]![0]![1] = "2026-02-30T00:00:00Z"; break;
            case "bucket-key-kind": tuple["columns"]![1]!["column"] = "date"; tuple["columns"]![1]!["bucket"] = new JsonObject { ["kind"] = "month" }; tuple["values"]![0]![1] = "2026-10-25T00:00:00Z"; break;
            case "bucket-column-kind": tuple["columns"]![0]!["bucket"] = new JsonObject { ["kind"] = "width", ["width"] = 10 }; break;
            case "unknown-tuple-field": tuple["endpoint"] = "/data"; break;
            case "unknown-column-field": tuple["columns"]![0]!["render"] = "code"; break;
            case "bad-exclude-kind": tuple["exclude"] = "true"; break;
            case "null-tuples": query["tupleFilters"] = null; break;
            case "null-row": tuple["values"] = new JsonArray((JsonNode?)null); break;
            case "missing-fields": tuple.Remove("columns"); break;
            case "missing-values": tuple.Remove("values"); break;
            default: throw new ArgumentOutOfRangeException(nameof(boundary));
        }
        Reject(root);
    }

    [Theory]
    [InlineData("key-string")]
    [InlineData("key-boolean")]
    [InlineData("key-null")]
    [InlineData("wrong-column-kind")]
    [InlineData("text-operator")]
    [InlineData("unknown-option")]
    public void BucketFiltersRejectNonNumericKeysAndInvalidBindings(string boundary) {
        var filter = Filter("date", new JsonObject { ["kind"] = "month" }, 24309);
        switch (boundary) {
            case "key-string": filter["values"]![0] = "2026-10-01T00:00:00Z"; break;
            case "key-boolean": filter["values"]![0] = true; break;
            case "key-null": filter["values"]![0] = null; break;
            case "wrong-column-kind": filter["column"] = "name"; break;
            case "text-operator": filter["operator"] = "contains"; break;
            case "unknown-option": filter["bucket"]!["callback"] = "code"; break;
            default: throw new ArgumentOutOfRangeException(nameof(boundary));
        }
        var root = Intent(); root["query"] = new JsonObject { ["filters"] = new JsonArray(filter) };
        Assert.Throws<InvalidOperationException>(() => CanopyViewIntentValidator.Validate(root.ToJsonString(), View()));
    }

    private static CanopyViewIntent Accept(JsonObject root, CanopyDataGridView? view = null) {
        view ??= View();
        var before = view.ToJson();
        var accepted = CanopyViewIntentValidator.Validate(root.ToJsonString(), view);
        Assert.True(Evaluate(accepted.ToJson()));
        Assert.True(JsonNode.DeepEquals(root, JsonNode.Parse(accepted.ToJson())));
        Assert.Equal(accepted.ToJson(), CanopyViewIntentValidator.Validate(accepted.ToJson(), view).ToJson());
        Assert.Equal(before, view.ToJson());
        return accepted;
    }

    private static void Reject(JsonObject root, CanopyDataGridView? view = null) {
        var error = Record.Exception(() => CanopyViewIntentValidator.Validate(root.ToJsonString(), view ?? View()));
        Assert.NotNull(error);
        Assert.True(error is InvalidOperationException or ArgumentException, "Expected contract rejection, got " + error.GetType().Name);
    }

    private static bool Evaluate(string json) {
        using var document = JsonDocument.Parse(json);
        return Schema.Evaluate(document.RootElement).IsValid;
    }

    private static JsonObject Intent() => new() { ["protocol"] = "canopyx/2", ["type"] = "viewIntent", ["version"] = 1, ["view"] = "inventory" };
    private static JsonObject Pivot() => new() { ["rows"] = new JsonArray(Level("name")), ["columns"] = new JsonArray(Level("region")), ["values"] = new JsonArray("total") };
    private static JsonObject Level(string column, JsonNode? bucket = null, string? aggregate = null) {
        var level = new JsonObject { ["column"] = column, ["direction"] = "asc" };
        if (bucket != null) level["bucket"] = bucket;
        if (aggregate != null) level["aggregate"] = aggregate;
        return level;
    }
    private static JsonObject GroupQuery(params JsonObject[] levels) => new() { ["groupBy"] = new JsonArray(levels.Cast<JsonNode>().ToArray()) };
    private static JsonObject EdgeBucket(params double[] edges) => new() { ["kind"] = "edges", ["edges"] = new JsonArray(edges.Select(edge => (JsonNode)JsonValue.Create(edge)!).ToArray()) };
    private static JsonObject Tuple() => new() { ["columns"] = new JsonArray(new JsonObject { ["column"] = "name" }, new JsonObject { ["column"] = "amount" }), ["values"] = new JsonArray(new JsonArray("West", 2)) };
    private static JsonObject Filter(string column, JsonObject bucket, int value) => new() { ["column"] = column, ["operator"] = "eq", ["values"] = new JsonArray(value), ["bucket"] = bucket };
    private static CanopyGridPivot ConfiguredPivot() {
        var pivot = new CanopyGridPivot(); pivot.Rows.Add(new CanopyGridGroupLevel("region")); pivot.Values.Add("count"); return pivot;
    }
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("inventory", "Inventory") { Reporting = new CanopyGridReporting { Groupable = true, Pivotable = true } };
        foreach (var id in new[] { "name", "region", "flag", "other" }) view.Columns.Add(new CanopyColumn(id, id) { Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("date", "Date") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("secret", "Secret") { Sortable = true, Filterable = false });
        view.Columns.Add(new CanopyColumn("unsortable", "Unsortable"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("total", "amount", CanopyGridAggregateOperation.Sum, "Total"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("count", "name", CanopyGridAggregateOperation.Count, "Count"));
        return view;
    }
}
