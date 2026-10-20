using System;
using System.Collections;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>The canonical values of records fields (rows of typed cells) and pick fields (chosen records as <c>{ id, label }</c>).</summary>
internal static class CanopyFlowRecordValues {
    private const int MaxCellText = 4096;

    /// <summary>A records answer: at most 1,000 rows, each an object of the field's columns (every column, in column order).</summary>
    internal static object? Canonical(CanopyFlowField field, object value, out string? error) {
        error = null;
        if (value is string || !(value is IEnumerable rows)) { error = "must be a list of rows."; return null; }
        var result = new List<object>();
        var cells = new Dictionary<string, CanopyFlowField>(StringComparer.Ordinal);
        foreach (var column in field.Columns) cells[column.Id] = column.CellField();
        foreach (var row in rows) {
            if (!(Entries(row) is IEnumerable<KeyValuePair<string, object?>> entries)) { error = "must be a list of rows, each an object of its columns."; return null; }
            var record = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var entry in entries) {
                if (!cells.TryGetValue(entry.Key, out var cell)) { error = "has a row with the unknown column '" + entry.Key + "'."; return null; }
                if (entry.Value == null) continue;
                var canonical = CanopyFlowValues.TryCanonical(cell, entry.Value, out var problem);
                if (problem != null) { error = "has a row whose " + entry.Key + " " + problem; return null; }
                // Text cells hold at most 4,096 characters, as the browser's records editor accepts.
                if (canonical is string text && cell.Kind == CanopyFlowFieldKind.Text && text.Length > MaxCellText) { error = "has a row whose " + entry.Key + " is longer than 4096 characters."; return null; }
                record[entry.Key] = canonical;
            }

            var ordered = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var column in field.Columns) ordered[column.Id] = record.TryGetValue(column.Id, out var cellValue) ? cellValue : null;
            result.Add(ordered);
            if (result.Count > CanopyFlowValues.MaxItems) { error = "holds at most 1000 rows."; return null; }
        }

        return result;
    }

    /// <summary>A pick answer: at most 1,000 distinct records, each <c>{ id, label }</c>.</summary>
    internal static object? CanonicalPick(object value, out string? error) {
        error = null;
        if (value is string || !(value is IEnumerable items)) { error = "must be a list of chosen records."; return null; }
        var result = new List<object>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in items) {
            string? id = null, label = null;
            var other = false;
            if (Entries(item) is IEnumerable<KeyValuePair<string, object?>> entries) {
                foreach (var entry in entries) {
                    if (entry.Key == "id") id = entry.Value as string;
                    else if (entry.Key == "label") label = entry.Value as string;
                    else other = true;
                }
            }

            if (other || id == null || id.Length == 0 || id.Length > 256 || label == null || label.Length > 400 || !ids.Add(id)) { error = "must be distinct records of { id, label }."; return null; }
            result.Add(new Dictionary<string, object?>(StringComparer.Ordinal) { ["id"] = id, ["label"] = label });
            if (result.Count > CanopyFlowValues.MaxItems) { error = "holds at most 1000 records."; return null; }
        }

        return result;
    }

    /// <summary>The ids of a canonical pick answer, as conditions read it.</summary>
    internal static List<object?> PickIds(object? canonical) {
        var ids = new List<object?>();
        if (canonical is IEnumerable items) foreach (var item in items) if (item is IDictionary<string, object?> record && record.TryGetValue("id", out var id)) ids.Add(id);
        return ids;
    }

    private static IEnumerable<KeyValuePair<string, object?>>? Entries(object? row) {
        switch (row) {
            case IDictionary<string, object?> map: return map;
            case IReadOnlyDictionary<string, object?> map: return map;
            case IDictionary<string, string> texts: { var list = new List<KeyValuePair<string, object?>>(); foreach (var entry in texts) list.Add(new KeyValuePair<string, object?>(entry.Key, entry.Value)); return list; }
            default: return null;
        }
    }
}