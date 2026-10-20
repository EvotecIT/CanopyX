using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>The checks a matrix passes before it is written: the browser's matrix part applies the same rules to its document.</summary>
internal static class CanopyMatrixValidator {
    internal static void Validate(CanopyMatrix matrix) {
        Text(matrix.Label, "The matrix label", 200, false);
        if (matrix.States.Count == 0 || matrix.States.Count > CanopyMatrix.MaxStates) throw new InvalidOperationException("A matrix declares 1 to " + CanopyMatrix.MaxStates + " states.");
        var states = new HashSet<string>(StringComparer.Ordinal);
        foreach (var state in matrix.States) {
            if (state == null) throw new InvalidOperationException("A matrix has no null states.");
            if (!states.Add(state.Id)) throw new InvalidOperationException("The state '" + state.Id + "' is declared twice.");
            Text(state.Label, "The label of state '" + state.Id + "'", 200, false);
            if (!Enum.IsDefined(typeof(CanopyMatrixSymbol), state.Symbol)) throw new InvalidOperationException("The state '" + state.Id + "' needs one of the symbols.");
        }

        foreach (var id in matrix.TotalStates) if (id == null || !states.Contains(id)) throw new InvalidOperationException("The totals count the undeclared state '" + id + "'.");
        Axis(matrix.Rows, "row");
        if (matrix.Square) {
            if (matrix.Columns.Items.Count > 0 || matrix.Columns.Attributes.Count > 0 || matrix.Columns.GroupBy != null || matrix.Columns.SortBy != null || matrix.Columns.Noun != null)
                throw new InvalidOperationException("A square matrix takes its columns from its rows; set only Columns.Title.");
            Text(matrix.Columns.Title, "The column title", 200, true);
        } else {
            Axis(matrix.Columns, "column");
            if (matrix.Diagonal != CanopyMatrixDiagonal.Self) throw new InvalidOperationException("Only a square matrix has a diagonal.");
        }

        var rows = Index(matrix.Rows);
        var columns = matrix.Square ? rows : Index(matrix.Columns);
        if ((long)rows.Count * columns.Count > CanopyMatrix.MaxCells) throw new InvalidOperationException("A matrix holds at most " + CanopyMatrix.MaxCells + " cells (rows times columns).");
        if (matrix.CellWidth.HasValue && (matrix.CellWidth < 24 || matrix.CellWidth > 120)) throw new InvalidOperationException("A matrix cell is 24 to 120 pixels wide.");
        if (!Enum.IsDefined(typeof(CanopyMatrixDiagonal), matrix.Diagonal) || !Enum.IsDefined(typeof(CanopyMatrixDetails), matrix.Details) ||
            !Enum.IsDefined(typeof(CanopyMatrixPhoneLayout), matrix.Phone)) throw new InvalidOperationException("The matrix has an unknown option value.");
        var seen = new HashSet<long>();
        foreach (var cell in matrix.Cells) {
            if (cell == null) throw new InvalidOperationException("A matrix has no null cells.");
            if (cell.Row == null || !rows.TryGetValue(cell.Row, out var row)) throw new InvalidOperationException("A cell names the unknown row '" + cell.Row + "'.");
            if (cell.Column == null || !columns.TryGetValue(cell.Column, out var column)) throw new InvalidOperationException("A cell names the unknown column '" + cell.Column + "'.");
            if (cell.State == null || !states.Contains(cell.State)) throw new InvalidOperationException("The cell of '" + cell.Row + "' and '" + cell.Column + "' names the undeclared state '" + cell.State + "'.");
            if (!seen.Add((long)row * columns.Count + column)) throw new InvalidOperationException("The cell of '" + cell.Row + "' and '" + cell.Column + "' is set twice.");
            if (cell.Value.HasValue && (double.IsNaN(cell.Value.Value) || double.IsInfinity(cell.Value.Value) || Math.Abs(cell.Value.Value) > 9007199254740991d))
                throw new InvalidOperationException("A cell value is a finite number within the safe-integer magnitude.");
            Text(cell.Text, "A cell's text", 64, true);
            Text(cell.Title, "A cell's title", 1000, true);
            if (cell.Details.Count > 16) throw new InvalidOperationException("A cell lists at most 16 details.");
            foreach (var detail in cell.Details) {
                Text(detail.Key, "A detail label", 200, false);
                if (detail.Value == null || detail.Value.Length > 1000) throw new InvalidOperationException("A detail value is text of at most 1,000 characters.");
            }
        }

    }

    /// <summary>The axis's item positions by id.</summary>
    internal static Dictionary<string, int> Index(CanopyMatrixAxis axis) {
        var index = new Dictionary<string, int>(axis.Items.Count, StringComparer.Ordinal);
        for (var i = 0; i < axis.Items.Count; i++) index[axis.Items[i].Id] = i;
        return index;
    }

    private static void Axis(CanopyMatrixAxis axis, string name) {
        Text(axis.Title, "The " + name + " title", 200, true);
        if (axis.Noun != null && (!CanopyFlowValues.HasVisibleText(axis.Noun) || axis.Noun.Length > 64)) throw new InvalidOperationException("The " + name + " noun is visible text of at most 64 characters.");
        if (axis.Attributes.Count > 32) throw new InvalidOperationException("A matrix axis has at most 32 attributes.");
        var attributes = new Dictionary<string, CanopyMatrixAttribute>(StringComparer.Ordinal);
        foreach (var attribute in axis.Attributes) {
            if (attribute == null) throw new InvalidOperationException("A matrix axis has no null attributes.");
            if (attribute.Id.Length > 256 || attribute.Id[0] == '#') throw new InvalidOperationException("The attribute '" + attribute.Id + "' needs an id of at most 256 characters that does not start with #.");
            if (!attributes.ContainsKey(attribute.Id)) attributes.Add(attribute.Id, attribute); else throw new InvalidOperationException("The attribute '" + attribute.Id + "' is declared twice.");
            Text(attribute.Title, "The title of attribute '" + attribute.Id + "'", 200, false);
            if (!Enum.IsDefined(typeof(CanopyColumnKind), attribute.Kind)) throw new InvalidOperationException("The attribute '" + attribute.Id + "' has an unknown kind.");
        }

        if (axis.Items.Count == 0 || axis.Items.Count > CanopyMatrix.MaxItems) throw new InvalidOperationException("A matrix " + name + " axis has 1 to " + CanopyMatrix.MaxItems + " items.");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in axis.Items) {
            if (item == null) throw new InvalidOperationException("A matrix axis has no null items.");
            if (item.Id.Length > 256 || !ids.Add(item.Id)) throw new InvalidOperationException("The " + name + " '" + item.Id + "' needs a unique id of at most 256 characters.");
            Text(item.Label, "The label of " + name + " '" + item.Id + "'", 200, false);
            Text(item.Secondary, "The secondary text of " + name + " '" + item.Id + "'", 200, true);
            if (item.Href != null && !SafeHref(item.Href)) throw new InvalidOperationException("The link of " + name + " '" + item.Id + "' is not an http, https, mailto or relative address.");
            foreach (var value in item.Values) {
                if (!attributes.TryGetValue(value.Key, out var attribute)) throw new InvalidOperationException("The " + name + " '" + item.Id + "' has a value for the undeclared attribute '" + value.Key + "'.");
                if (value.Value == null) continue;
                var cell = value.Value;
                // An attribute value is a value and its display text; tones, badges, histories and structures have no place in a matrix.
                if (cell.Tone != default || cell.Title != null || cell.Secondary != null || cell.SearchText != null || cell.SortKey != null || cell.HasBadges || cell.HasSeries ||
                    cell.IsStructured || cell.Ref != null)
                    throw new InvalidOperationException("The value of attribute '" + value.Key + "' of " + name + " '" + item.Id + "' carries more than a value and its text.");
                var raw = cell.Value;
                var fits = raw == null || attribute.Kind switch {
                    CanopyColumnKind.Number => raw is long || raw is double || raw is decimal,
                    CanopyColumnKind.DateTime => raw is DateTime,
                    _ => raw is string || raw is bool
                };
                if (!fits) throw new InvalidOperationException("The value of attribute '" + value.Key + "' of " + name + " '" + item.Id + "' does not fit its kind.");
            }
        }

        if (axis.GroupBy != null && !attributes.ContainsKey(axis.GroupBy)) throw new InvalidOperationException("The " + name + " axis groups by the undeclared attribute '" + axis.GroupBy + "'.");
        if (axis.SortBy != null && axis.SortBy != CanopyMatrix.SortByLabel && axis.SortBy != CanopyMatrix.SortByTotal && !attributes.ContainsKey(axis.SortBy))
            throw new InvalidOperationException("The " + name + " axis sorts by '" + axis.SortBy + "', which is neither #label, #total nor an attribute.");
    }

    private static void Text(string? value, string what, int max, bool optional) {
        if (value == null) {
            if (optional) return;
            throw new InvalidOperationException(what + " is required.");
        }

        if (!CanopyFlowValues.HasVisibleText(value) || value.Length > max) throw new InvalidOperationException(what + " is visible text of at most " + max + " characters.");
    }

    /// <summary>An http, https or mailto address, or a relative one; never a protocol-relative <c>//host</c>, control characters or backslashes.</summary>
    internal static bool SafeHref(string url) {
        if (url.Length == 0 || url.Length > 2048 || url.StartsWith("//", StringComparison.Ordinal)) return false;
        foreach (var ch in url) if (ch <= ' ' || ch == '\\' || ch == '\u007f') return false;
        var colon = url.IndexOf(':');
        var boundary = url.IndexOfAny(new[] { '/', '?', '#' });
        if (colon < 0 || boundary >= 0 && boundary < colon) return true;
        var scheme = url.Substring(0, colon);
        return scheme.Equals("https", StringComparison.OrdinalIgnoreCase) || scheme.Equals("http", StringComparison.OrdinalIgnoreCase) ||
            scheme.Equals("mailto", StringComparison.OrdinalIgnoreCase);
    }
}
