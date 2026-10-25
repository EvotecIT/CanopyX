using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace CanopyX.Data;

public static partial class CanopyRequestParser {
    private static IReadOnlyList<CanopyTupleFilter> TupleFilters(JsonElement root, CanopyDataSchema schema, CanopyRemoteLimits limits) {
        if (!root.TryGetProperty("tupleFilters", out var input) || input.ValueKind == JsonValueKind.Null) return Array.Empty<CanopyTupleFilter>();
        if (input.ValueKind != JsonValueKind.Array || input.GetArrayLength() > 8) throw CanopyRequestException.Document("A query has at most eight tuple predicates.");
        var result = new List<CanopyTupleFilter>();
        foreach (var tuple in input.EnumerateArray()) {
            RequireObject(tuple, "tuple filter");
            if (tuple.EnumerateObject().Any(field => field.Name != "columns" && field.Name != "values" && field.Name != "exclude")) throw CanopyRequestException.Document("Unknown tuple predicate field.");
            if (!tuple.TryGetProperty("columns", out var columns) || columns.ValueKind != JsonValueKind.Array || columns.GetArrayLength() < 1 || columns.GetArrayLength() > 6)
                throw CanopyRequestException.Document("A tuple has one to six fields.");
            var fields = new List<CanopyGridTupleColumn>(); var allowed = new List<CanopyDataColumn>();
            foreach (var field in columns.EnumerateArray()) {
                RequireObject(field, "tuple column");
                if (field.EnumerateObject().Any(item => item.Name != "column" && item.Name != "bucket")) throw CanopyRequestException.Document("Unknown tuple column field.");
                var column = schema.GetColumn(RequireString(field, "column"));
                if (!column.Filterable) throw new CanopyRequestException(CanopyRequestError.ColumnNotFilterable, "A tuple field is not filterable.");
                fields.Add(new CanopyGridTupleColumn(column.Id, CanopyBucketParser.Read(field, column.Definition))); allowed.Add(column);
            }
            if (!tuple.TryGetProperty("values", out var values) || values.ValueKind != JsonValueKind.Array || values.GetArrayLength() < 1 || values.GetArrayLength() > 200)
                throw CanopyRequestException.Document("A tuple predicate has one to 200 operand tuples.");
            var rows = new List<IEnumerable<CanopyCell?>>();
            foreach (var row in values.EnumerateArray()) {
                if (row.ValueKind != JsonValueKind.Array || row.GetArrayLength() != fields.Count) throw CanopyRequestException.Document("Tuple widths must match their fields.");
                var cells = new List<CanopyCell?>(); var index = 0;
                foreach (var cell in row.EnumerateArray()) {
                    object? value = null;
                    if (cell.ValueKind != JsonValueKind.Null) {
                        if (fields[index].Bucket == null) value = Operand(cell, allowed[index], limits);
                        else if (cell.ValueKind == JsonValueKind.Number && cell.TryGetDouble(out var number) && CanopyBucket.Finite(number)) value = number;
                        else throw CanopyRequestException.Operand("A bucket tuple operand is a finite number or null.");
                    }
                    cells.Add(CanopyDataValues.ToCell(value)); index++;
                }
                rows.Add(cells);
            }
            result.Add(new CanopyTupleFilter(schema, new CanopyGridTupleFilter(fields, rows, OptionalBoolean(tuple, "exclude") ?? false)));
        }
        return result;
    }
}
