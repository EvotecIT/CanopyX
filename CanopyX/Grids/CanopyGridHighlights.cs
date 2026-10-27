using System;
using System.Collections.Generic;
using System.Text;
using CanopyX.Bundles;

namespace CanopyX;

/// <summary>Raw predicate semantics for script-free highlight rendering; mirrors the shared browser filter evaluator.</summary>
internal static class CanopyGridHighlights {
    internal static CanopyGridHighlightRule? Find(CanopyDataGridView view, CanopyGridRow row, string? cellColumn) {
        foreach (var rule in view.HighlightRules) {
            if (cellColumn == null ? rule.Target != CanopyGridHighlightTarget.Row :
                rule.Target != CanopyGridHighlightTarget.Cell || rule.Condition.Column != cellColumn) continue;
            CanopyColumn? column = null;
            foreach (var declared in view.Columns) if (declared.Id == rule.Condition.Column) column = declared;
            row.Cells.TryGetValue(rule.Condition.Column, out var cell);
            if (Matches(rule.Condition, cell?.Value, column!)) return rule;
        }
        return null;
    }
    private static bool Matches(CanopyGridFilter filter, object? raw, CanopyColumn column) {
        if (filter.Bucket != null) {
            raw = filter.Bucket.Key(raw);
            column = new CanopyColumn(column.Id, column.Title) { Kind = CanopyColumnKind.Number };
        }
        var value = Scalar(raw, column); var op = filter.Operator;
        if (op == CanopyGridFilterOperator.IsNull) return value == null;
        if (op == CanopyGridFilterOperator.IsNotNull) return value != null;
        if (value == null) return false;
        var operand = Scalar(filter.Values[0].Value, column);
        if (op == CanopyGridFilterOperator.In) {
            foreach (var item in filter.Values) if (Equals(value, Scalar(item.Value, column))) return true;
            return false;
        }
        if (op == CanopyGridFilterOperator.Equal) return Equals(value, operand);
        if (op == CanopyGridFilterOperator.NotEqual) return !Equals(value, operand);
        if (op == CanopyGridFilterOperator.Contains || op == CanopyGridFilterOperator.StartsWith) {
            var text = value is bool boolean ? boolean ? "true" : "false" : (string)value;
            return op == CanopyGridFilterOperator.Contains ? text.IndexOf((string)operand!, StringComparison.Ordinal) >= 0 :
                text.StartsWith((string)operand!, StringComparison.Ordinal);
        }
        var comparison = ((IComparable)value).CompareTo(operand);
        return op == CanopyGridFilterOperator.GreaterThan ? comparison > 0 : op == CanopyGridFilterOperator.GreaterThanOrEqual ? comparison >= 0 :
            op == CanopyGridFilterOperator.LessThan ? comparison < 0 : comparison <= 0;
    }
    private static object? Scalar(object? value, CanopyColumn column) {
        if (value is double real && (double.IsNaN(real) || double.IsInfinity(real))) return null;
        if (value is string text) {
            if (column.ExactCategoryTokens) return text;
            var folded = new StringBuilder(text.Length);
            foreach (var unit in text) folded.Append(CanopySearchFolding.Fold(unit));
            return folded.ToString();
        }
        if (column.Kind == CanopyColumnKind.Number && value != null) return CanopyNumericValues.ToDouble(value);
        if (value is DateTime date) return date.Ticks / TimeSpan.TicksPerMillisecond;
        return value;
    }
}
