using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CanopyX.Data;

/// <summary>Parses and validates remote grid requests from their JSON documents or a query string.</summary>
/// <remarks>
/// Parsing never trusts the client: every column must be on the schema's allow-list, operators must fit the column kind,
/// operands are converted to typed values, and all safety limits are enforced. Violations throw
/// <see cref="CanopyRequestException"/> with a client-safe message. Unknown additive fields are ignored, as the protocol requires.
/// </remarks>
public static partial class CanopyRequestParser {
    private const string Protocol = "canopyx/2";
    private const double SafeInteger = 9007199254740991d;
    private static readonly DateTime MinimumInstant = new DateTime(2, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime MaximumInstant = new DateTime(9998, 12, 31, 23, 59, 59, DateTimeKind.Utc);
    private static readonly Regex IsoInstant = new Regex(@"^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$", RegexOptions.CultureInvariant);
    private static readonly JsonDocumentOptions DocumentOptions = new JsonDocumentOptions { MaxDepth = 64, CommentHandling = JsonCommentHandling.Disallow, AllowTrailingCommas = false };

    /// <summary>Parses a <c>gridQuery</c> document.</summary>
    /// <param name="json">The document.</param>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="limits">Safety limits; null uses the defaults.</param>
    /// <returns>The validated request.</returns>
    /// <exception cref="CanopyRequestException">The request is invalid or exceeds a limit.</exception>
    public static CanopyDataRequest ParseQuery(string json, CanopyDataSchema schema, CanopyRemoteLimits? limits = null) {
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        limits ??= new CanopyRemoteLimits();
        using var document = Open(json, limits);
        return Query(document.RootElement, schema, limits, false);
    }

    /// <summary>Parses a query from query-string parameters.</summary>
    /// <param name="parameters">The decoded parameters. <c>q</c> carries a complete <c>gridQuery</c> document; otherwise
    /// <c>offset</c>, <c>limit</c>, <c>search</c>, <c>searchMode</c>, <c>revision</c>, repeatable <c>sort</c>
    /// (<c>column</c>, <c>column:desc</c> or <c>-column</c>), <c>filters</c> (a JSON array), <c>filterGroup</c> (a JSON object)
    /// and <c>groupBy</c> (a JSON array of levels) are read.</param>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="limits">Safety limits; null uses the defaults.</param>
    /// <returns>The validated request.</returns>
    /// <exception cref="CanopyRequestException">The request is invalid or exceeds a limit.</exception>
    public static CanopyDataRequest ParseQuery(IEnumerable<KeyValuePair<string, string?>> parameters, CanopyDataSchema schema, CanopyRemoteLimits? limits = null) {
        if (parameters == null) throw new ArgumentNullException(nameof(parameters));
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        limits ??= new CanopyRemoteLimits();
        var values = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        long bytes = 0;
        foreach (var pair in parameters) {
            if (pair.Key == null || pair.Value == null) continue;
            // UTF-16 length is a lower bound on UTF-8 bytes; reject oversized inputs before scanning them.
            if (bytes + pair.Key.Length + pair.Value.Length > limits.MaxRequestBytes) throw CanopyRequestException.Limit("The query string is too long.");
            bytes += Encoding.UTF8.GetByteCount(pair.Key) + (long)Encoding.UTF8.GetByteCount(pair.Value);
            if (bytes > limits.MaxRequestBytes) throw CanopyRequestException.Limit("The query string is too long.");
            if (!values.TryGetValue(pair.Key, out var list)) values[pair.Key] = list = new List<string>();
            list.Add(pair.Value);
        }
        if (values.TryGetValue("q", out var whole)) {
            if (whole.Count != 1) throw CanopyRequestException.Document("Give the query document once.");
            return ParseQuery(whole[0], schema, limits);
        }
        // The decoded parameters already spent the transport budget. Internal JSON escaping adds no client input.
        using var document = ReadDocument(FlatToJson(values, schema));
        return Query(document.RootElement, schema, limits, false);
    }

    /// <summary>Parses a <c>gridQuery</c> document that requests a complete-query summary; it must carry its accepted revision.</summary>
    /// <param name="json">The document.</param>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="limits">Safety limits; null uses the defaults.</param>
    /// <returns>The validated summary request.</returns>
    /// <exception cref="CanopyRequestException">The request is invalid, has no revision, or the view declares no summary.</exception>
    public static CanopySummaryRequest ParseSummary(string json, CanopyDataSchema schema, CanopyRemoteLimits? limits = null) {
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        if (!schema.HasSummary) throw new CanopyRequestException(CanopyRequestError.Unsupported, "This view declares no grouping or aggregates.");
        limits ??= new CanopyRemoteLimits();
        using var document = Open(json, limits);
        var query = Query(document.RootElement, schema, limits, true);
        if (query.Revision == null) throw CanopyRequestException.Document("A summary request needs its accepted revision.");
        return new CanopySummaryRequest(query);
    }

    /// <summary>Parses a <c>gridFacetQuery</c> document.</summary>
    /// <param name="json">The document.</param>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="limits">Safety limits; null uses the defaults.</param>
    /// <returns>The validated value-list request, with the effective filter applied to its query.</returns>
    /// <exception cref="CanopyRequestException">The request is invalid, exceeds a limit, or the column has no value list.</exception>
    public static CanopyFacetRequest ParseFacet(string json, CanopyDataSchema schema, CanopyRemoteLimits? limits = null) {
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        limits ??= new CanopyRemoteLimits();
        using var document = Open(json, limits);
        var root = RequireObject(document.RootElement, "facet request");
        Envelope(root, "gridFacetQuery");
        var column = schema.GetColumn(RequireString(root, "column"));
        if (!column.Facetable) throw new CanopyRequestException(CanopyRequestError.NotFacetable, "The view declares no value list for this column.");
        var search = OptionalString(root, "search") ?? string.Empty;
        if (search.Length > Math.Min(16384, limits.MaxSearchLength)) throw CanopyRequestException.Limit("The value search is too long.");
        var limit = OptionalInteger(root, "limit") ?? 100;
        if (limit < 1 || limit > 200) throw CanopyRequestException.Document("A value list returns 1 to 200 values.");
        if (limit > limits.MaxValueListSize) throw CanopyRequestException.Limit("The value list is larger than this endpoint allows.");
        var include = OptionalBoolean(root, "includeCurrentFilter") ?? true;
        if (!root.TryGetProperty("query", out var queryElement)) throw CanopyRequestException.Document("A value list needs its accepted query.");
        var query = Query(queryElement, schema, limits, true);
        if (query.Revision == null) throw CanopyRequestException.Document("A value list needs the accepted revision.");
        if (!include) query = query.WithFilter(CanopyFilters.WithoutColumn(query.Filter, column.Id)).WithTupleFilters(query.TupleFilters.Where(tuple => !tuple.Columns.Any(field => field.Id == column.Id)));
        return new CanopyFacetRequest(query, column, search, limit, include, CanopyBucketParser.Read(root, column.Definition));
    }

    /// <summary>Validates a typed query built in C#, applying the same allow-list and limits as wire requests.</summary>
    /// <param name="query">The typed query.</param>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="limits">Safety limits; null uses the defaults.</param>
    /// <returns>The validated request.</returns>
    /// <remarks>The query is written to its wire form with <see cref="CanopyGridQuery.ToJson(CanopyDataGridView)"/> and parsed back.</remarks>
    public static CanopyDataRequest FromQuery(CanopyGridQuery query, CanopyDataSchema schema, CanopyRemoteLimits? limits = null) {
        if (query == null) throw new ArgumentNullException(nameof(query));
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        return ParseQuery(query.ToJson(schema.ProtocolView), schema, limits);
    }

    internal static JsonDocument Open(string json, CanopyRemoteLimits limits) {
        if (json == null) throw new ArgumentNullException(nameof(json));
        if (json.Length > limits.MaxRequestBytes || Encoding.UTF8.GetByteCount(json) > limits.MaxRequestBytes)
            throw CanopyRequestException.Limit("The request is too large.");
        return ReadDocument(json);
    }

    private static JsonDocument ReadDocument(string json) {
        try {
            return JsonDocument.Parse(json, DocumentOptions);
        } catch (JsonException) {
            throw new CanopyRequestException(CanopyRequestError.InvalidJson, "The request is not valid JSON or is nested too deeply.");
        }
    }

    private static CanopyDataRequest Query(JsonElement element, CanopyDataSchema schema, CanopyRemoteLimits limits, bool nested) {
        var root = RequireObject(element, "query");
        if (root.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "gridCursorQuery")
            throw new CanopyRequestException(CanopyRequestError.Unsupported, "This endpoint serves offset navigation, not cursors.");
        Envelope(root, "gridQuery");
        var view = OptionalString(root, "view");
        if (view != null && view != schema.ViewId) throw CanopyRequestException.Document("The query targets another view.");
        if (root.TryGetProperty("cursor", out var cursor) && cursor.ValueKind != JsonValueKind.Null)
            throw new CanopyRequestException(CanopyRequestError.Unsupported, "This endpoint serves offset navigation, not cursors.");
        var offset = OptionalInteger(root, "offset") ?? 0;
        if (offset < 0) throw CanopyRequestException.Document("The offset must not be negative.");
        var limit = OptionalInteger(root, "limit") ?? Math.Min(schema.ProtocolView.PageSize, limits.MaxPageSize);
        if (limit < 1 || limit > 10000) throw CanopyRequestException.Document("A page holds 1 to 10,000 rows.");
        if (limit > limits.MaxPageSize && !nested) throw CanopyRequestException.Limit("The page is larger than this endpoint allows.");
        var search = OptionalString(root, "search") ?? string.Empty;
        if (search.Length > limits.MaxSearchLength) throw CanopyRequestException.Limit("The search text is too long.");
        var mode = CanopyGridSearchMode.Substring;
        var modeText = OptionalString(root, "searchMode");
        if (modeText == "words") mode = CanopyGridSearchMode.Words;
        else if (modeText == "regex") {
            if (!schema.AllowRegexSearch) throw CanopyRequestException.Document("This grid does not allow regex search.");
            mode = CanopyGridSearchMode.Regex;
            try { if (search.Length != 0) _ = new CanopyGridRegexSearch(search); }
            catch (Exception error) when (error is ArgumentException || error is InvalidOperationException) {
                throw CanopyRequestException.Document("The regex search pattern is invalid: " + error.Message);
            }
        }
        else if (modeText != null && modeText != "substring") throw CanopyRequestException.Document("The search mode is substring, words or regex.");
        var revision = OptionalString(root, "revision");
        if (revision != null) RequireIdentifier(revision, "revision");
        var sort = Sorts(root, schema);
        var levels = GroupLevels(root, schema, sort);
        var budget = new Budget();
        var children = new List<CanopyFilterNode>();
        if (root.TryGetProperty("filters", out var filters) && filters.ValueKind != JsonValueKind.Null) {
            if (filters.ValueKind != JsonValueKind.Array) throw CanopyRequestException.Document("Filters must be an array.");
            foreach (var filter in filters.EnumerateArray()) children.Add(Condition(filter, schema, limits, budget));
        }
        if (root.TryGetProperty("filterGroup", out var group) && group.ValueKind != JsonValueKind.Null) children.Add(Group(group, schema, limits, budget, 1));
        if (CanopyDataRequest.SplitTerms(search, mode).Count > limits.MaxSearchTerms) throw CanopyRequestException.Limit("The search has too many words.");
        var request = new CanopyDataRequest(schema, children.Count == 0 ? null : children.Count == 1 ? children[0] : new CanopyFilterGroup(CanopyGridFilterJunction.All, children),
            sort, search, mode, offset, limit, revision, levels, TupleFilters(root, schema, limits));
        return request.WithRaw(root.GetRawText());
    }

    /// <summary>
    /// Reads the runtime grouping levels (<c>groupBy</c>) of a view that groups at runtime and normalizes the sort the way the
    /// browser does: a sort entry for a column grouped by value turns that level around, and the levels' columns lead the
    /// sort (ascending for a level ordered by an aggregate). Views with a fixed grouping or none reject <c>groupBy</c>.
    /// </summary>
    private static IReadOnlyList<CanopySummaryLevel>? GroupLevels(JsonElement root, CanopyDataSchema schema, List<CanopySortKey> sort) {
        var present = root.TryGetProperty("groupBy", out var element) && element.ValueKind != JsonValueKind.Null;
        if (!schema.DynamicGrouping) {
            if (present) throw new CanopyRequestException(CanopyRequestError.InvalidGroupBy, "This view does not group at runtime.");
            return null;
        }
        var levels = new List<CanopySummaryLevel>();
        if (!present) {
            foreach (var declared in schema.GroupBy)
                levels.Add(new CanopySummaryLevel(schema.GetColumn(declared.Column), declared.Descending, declared.Aggregate == null ? null : schema.FindAggregate(declared.Aggregate), declared.Bucket));
        } else {
            if (element.ValueKind != JsonValueKind.Array) throw new CanopyRequestException(CanopyRequestError.InvalidGroupBy, "groupBy must be an array of levels.");
            if (element.GetArrayLength() > 4) throw new CanopyRequestException(CanopyRequestError.InvalidGroupBy, "groupBy lists at most four levels.");
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in element.EnumerateArray()) {
                if (item.ValueKind != JsonValueKind.Object) throw new CanopyRequestException(CanopyRequestError.InvalidGroupBy, "A grouping level must be a JSON object.");
                var column = schema.GetColumn(RequireString(item, "column"));
                if (!column.Sortable) throw new CanopyRequestException(CanopyRequestError.InvalidGroupBy, "A grouping level needs a sortable column.");
                if (!seen.Add(column.Id)) throw new CanopyRequestException(CanopyRequestError.InvalidGroupBy, "A column can lead one grouping level only.");
                var direction = OptionalString(item, "direction");
                if (direction != "asc" && direction != "desc") throw new CanopyRequestException(CanopyRequestError.InvalidGroupBy, "A grouping level direction is asc or desc.");
                var aggregateId = OptionalString(item, "aggregate");
                CanopySummaryAggregate? aggregate = null;
                if (aggregateId != null && (aggregate = schema.FindAggregate(aggregateId)) == null)
                    throw new CanopyRequestException(CanopyRequestError.InvalidGroupBy, "A grouping level orders by a declared aggregate.");
                levels.Add(new CanopySummaryLevel(column, direction == "desc", aggregate, CanopyBucketParser.Read(item, schema.ProtocolView.GetColumn(column.Id), schema.GroupBy.FirstOrDefault(level => level.Column == column.Id)?.Bucket)));
            }
        }
        for (var i = 0; i < levels.Count; i++) {
            var level = levels[i];
            if (level.Aggregate != null) continue;
            var key = sort.Find(item => item.Column.Id == level.Column.Id);
            if (key != null && key.Descending != level.Descending) levels[i] = new CanopySummaryLevel(level.Column, key.Descending, bucket: level.Bucket);
        }
        sort.RemoveAll(key => levels.Exists(level => level.Column.Id == key.Column.Id));
        sort.InsertRange(0, levels.ConvertAll(level => new CanopySortKey(level.Column, level.Aggregate == null && level.Descending)));
        return levels;
    }

    private static List<CanopySortKey> Sorts(JsonElement root, CanopyDataSchema schema) {
        var keys = new List<CanopySortKey>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        if (root.TryGetProperty("sort", out var sort) && sort.ValueKind != JsonValueKind.Null) {
            if (sort.ValueKind != JsonValueKind.Array) throw CanopyRequestException.Document("Sort must be an array.");
            foreach (var item in sort.EnumerateArray()) {
                var key = RequireObject(item, "sort key");
                var column = schema.GetColumn(RequireString(key, "column"));
                var direction = OptionalString(key, "direction") ?? "asc";
                if (direction != "asc" && direction != "desc") throw new CanopyRequestException(CanopyRequestError.InvalidSort, "A sort direction is asc or desc.");
                if (!column.Sortable) throw new CanopyRequestException(CanopyRequestError.InvalidSort, "The column is not sortable.");
                if (!seen.Add(column.Id)) throw new CanopyRequestException(CanopyRequestError.InvalidSort, "A column can be sorted only once.");
                keys.Add(new CanopySortKey(column, direction == "desc"));
            }
        }
        var grouping = schema.Grouping;
        if (grouping != null) {
            // The grouping column leads every query, in the declared direction, so pages follow the group order.
            keys.RemoveAll(key => key.Column.Id == grouping.Column);
            keys.Insert(0, new CanopySortKey(schema.GetColumn(grouping.Column), grouping.Descending));
        }
        return keys;
    }

    private static CanopyFilterGroup Group(JsonElement element, CanopyDataSchema schema, CanopyRemoteLimits limits, Budget budget, int depth) {
        if (depth > limits.MaxFilterDepth) throw CanopyRequestException.Limit("The filter is nested too deeply.");
        if (++budget.Groups > limits.MaxFilterGroups) throw CanopyRequestException.Limit("The filter has too many groups.");
        var group = RequireObject(element, "filter group");
        var junction = RequireString(group, "operator") switch {
            "and" => CanopyGridFilterJunction.All,
            "or" => CanopyGridFilterJunction.Any,
            _ => throw new CanopyRequestException(CanopyRequestError.InvalidOperator, "A filter group operator is and or or.")
        };
        var children = new List<CanopyFilterNode>();
        if (group.TryGetProperty("filters", out var filters) && filters.ValueKind != JsonValueKind.Null) {
            if (filters.ValueKind != JsonValueKind.Array) throw CanopyRequestException.Document("Group filters must be an array.");
            foreach (var filter in filters.EnumerateArray()) children.Add(Condition(filter, schema, limits, budget));
        }
        if (group.TryGetProperty("groups", out var groups) && groups.ValueKind != JsonValueKind.Null) {
            if (groups.ValueKind != JsonValueKind.Array) throw CanopyRequestException.Document("Nested groups must be an array.");
            foreach (var child in groups.EnumerateArray()) children.Add(Group(child, schema, limits, budget, depth + 1));
        }
        if (children.Count == 0) throw CanopyRequestException.Document("A filter group cannot be empty.");
        return new CanopyFilterGroup(junction, children);
    }

    private static CanopyFilterCondition Condition(JsonElement element, CanopyDataSchema schema, CanopyRemoteLimits limits, Budget budget) {
        if (++budget.Terms > limits.MaxFilterTerms) throw CanopyRequestException.Limit("The filter has too many conditions.");
        var filter = RequireObject(element, "filter");
        var column = schema.GetColumn(RequireString(filter, "column"));
        if (!column.Filterable) throw new CanopyRequestException(CanopyRequestError.ColumnNotFilterable, "The column cannot be filtered.");
        var name = RequireString(filter, "operator");
        var custom = System.Linq.Enumerable.Contains(schema.CustomFilterOperators, name);
        var op = custom ? CanopyGridFilterOperator.Custom : Operator(name);
        var bucket = CanopyBucketParser.Read(filter, column.Definition);
        var textMatch = op == CanopyGridFilterOperator.Contains || op == CanopyGridFilterOperator.StartsWith;
        var range = op == CanopyGridFilterOperator.GreaterThan || op == CanopyGridFilterOperator.GreaterThanOrEqual
            || op == CanopyGridFilterOperator.LessThan || op == CanopyGridFilterOperator.LessThanOrEqual;
        if (textMatch && column.Kind != CanopyColumnKind.Text) throw new CanopyRequestException(CanopyRequestError.InvalidOperator, "Text matching needs a text column.");
        if (range && column.Kind == CanopyColumnKind.Text) throw new CanopyRequestException(CanopyRequestError.InvalidOperator, "Range comparisons need a number or date column.");
        if (!filter.TryGetProperty("values", out var values) || values.ValueKind != JsonValueKind.Array) throw CanopyRequestException.Operand("A filter needs a values array.");
        var count = values.GetArrayLength();
        var nullTest = op == CanopyGridFilterOperator.IsNull || op == CanopyGridFilterOperator.IsNotNull;
        if (op == CanopyGridFilterOperator.In && count > limits.MaxInValues && count <= 1000) throw CanopyRequestException.Limit("The membership test has too many values.");
        if (nullTest ? count != 0 : op == CanopyGridFilterOperator.In ? count < 1 || count > 1000 : count != 1)
            throw CanopyRequestException.Operand("Null tests take no values, membership takes 1 to 1,000, and other operators take one.");
        var operands = new List<object>(count);
        foreach (var value in values.EnumerateArray()) {
            var operand = bucket == null ? Operand(value, column, limits) : value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && CanopyBucket.Finite(number) ? (object)number : throw CanopyRequestException.Operand("A bucket operand must be a finite number.");
            if (textMatch && !(operand is string)) throw CanopyRequestException.Operand("Text matching needs a text operand.");
            operands.Add(operand);
        }
        if (bucket != null && (textMatch || custom)) throw new CanopyRequestException(CanopyRequestError.InvalidOperator, "Buckets use built-in numeric comparisons.");
        return custom ? new CanopyFilterCondition(column, name, operands) : new CanopyFilterCondition(column, op, operands, bucket);
    }

    private static CanopyGridFilterOperator Operator(string text) => text switch {
        "eq" => CanopyGridFilterOperator.Equal,
        "ne" => CanopyGridFilterOperator.NotEqual,
        "contains" => CanopyGridFilterOperator.Contains,
        "startsWith" => CanopyGridFilterOperator.StartsWith,
        "in" => CanopyGridFilterOperator.In,
        "gt" => CanopyGridFilterOperator.GreaterThan,
        "ge" => CanopyGridFilterOperator.GreaterThanOrEqual,
        "lt" => CanopyGridFilterOperator.LessThan,
        "le" => CanopyGridFilterOperator.LessThanOrEqual,
        "isNull" => CanopyGridFilterOperator.IsNull,
        "isNotNull" => CanopyGridFilterOperator.IsNotNull,
        _ => throw new CanopyRequestException(CanopyRequestError.InvalidOperator, "The filter operator is not supported.")
    };

    private static object Operand(JsonElement value, CanopyDataColumn column, CanopyRemoteLimits limits) {
        switch (column.Kind) {
            case CanopyColumnKind.Number:
                if (value.ValueKind != JsonValueKind.Number || !TryNumber(value, out var number) || double.IsNaN(number) || double.IsInfinity(number) || Math.Abs(number) > SafeInteger)
                    throw CanopyRequestException.Operand("A number column needs finite numeric operands within the safe integer magnitude.");
                return number;
            case CanopyColumnKind.DateTime:
                var text = value.ValueKind == JsonValueKind.String ? value.GetString()! : null;
                if (text == null || text.Length > 64 || !IsoInstant.IsMatch(text) ||
                    !DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var instant))
                    throw CanopyRequestException.Operand("A date column needs ISO 8601 operands with an explicit time zone.");
                if (instant.UtcDateTime < MinimumInstant || instant.UtcDateTime > MaximumInstant)
                    throw CanopyRequestException.Operand("A date operand must fall between the years 0002 and 9998.");
                return CanopyDataValues.TruncateToMilliseconds(instant.UtcDateTime);
            default:
                if (value.ValueKind == JsonValueKind.True) return true;
                if (value.ValueKind == JsonValueKind.False) return false;
                if (value.ValueKind != JsonValueKind.String) throw CanopyRequestException.Operand("A text column needs text or boolean operands.");
                var operand = value.GetString()!;
                if (operand.Length > limits.MaxOperandLength) throw CanopyRequestException.Limit("A text operand is too long.");
                return operand;
        }
    }

    private static string FlatToJson(Dictionary<string, List<string>> values, CanopyDataSchema schema) {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) {
            writer.WriteStartObject();
            writer.WriteString("view", schema.ViewId);
            WriteInteger(writer, values, "offset");
            WriteInteger(writer, values, "limit");
            foreach (var name in new[] { "search", "searchMode", "revision" }) {
                var text = Single(values, name);
                if (text != null) writer.WriteString(name, text);
            }
            if (values.TryGetValue("sort", out var sorts)) {
                writer.WriteStartArray("sort");
                foreach (var entry in sorts) foreach (var part in entry.Split(',')) {
                    var key = part.Trim();
                    if (key.Length == 0) continue;
                    var descending = key.StartsWith("-", StringComparison.Ordinal) || key.EndsWith(":desc", StringComparison.Ordinal);
                    var id = key.TrimStart('-');
                    var colon = id.LastIndexOf(':');
                    if (colon >= 0) {
                        var direction = id.Substring(colon + 1);
                        if (direction != "asc" && direction != "desc") throw new CanopyRequestException(CanopyRequestError.InvalidSort, "A sort direction is asc or desc.");
                        id = id.Substring(0, colon);
                    }
                    writer.WriteStartObject();
                    writer.WriteString("column", id);
                    writer.WriteString("direction", descending ? "desc" : "asc");
                    writer.WriteEndObject();
                }
                writer.WriteEndArray();
            }
            WriteJson(writer, values, "filters", JsonValueKind.Array);
            WriteJson(writer, values, "filterGroup", JsonValueKind.Object);
            WriteJson(writer, values, "tupleFilters", JsonValueKind.Array);
            WriteJson(writer, values, "groupBy", JsonValueKind.Array);
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    private static void WriteInteger(Utf8JsonWriter writer, Dictionary<string, List<string>> values, string name) {
        var text = Single(values, name);
        if (text == null) return;
        if (!int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var number)) throw CanopyRequestException.Document("The " + name + " parameter must be a nonnegative integer.");
        writer.WriteNumber(name, number);
    }

    private static void WriteJson(Utf8JsonWriter writer, Dictionary<string, List<string>> values, string name, JsonValueKind kind) {
        var text = Single(values, name);
        if (text == null) return;
        try {
            using var parsed = JsonDocument.Parse(text, DocumentOptions);
            if (parsed.RootElement.ValueKind != kind) throw CanopyRequestException.Document("The " + name + " parameter has the wrong JSON shape.");
            writer.WritePropertyName(name);
            parsed.RootElement.WriteTo(writer);
        } catch (JsonException) {
            throw new CanopyRequestException(CanopyRequestError.InvalidJson, "The " + name + " parameter is not valid JSON.");
        }
    }

    private static string? Single(Dictionary<string, List<string>> values, string name) {
        if (!values.TryGetValue(name, out var list)) return null;
        if (list.Count != 1) throw CanopyRequestException.Document("Give the " + name + " parameter once.");
        return list[0];
    }

    private sealed class Budget {
        internal int Terms;
        internal int Groups;
    }
}
