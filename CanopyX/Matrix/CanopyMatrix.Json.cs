using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyMatrix {
    private const string StateDigits = "0123456789abcdefghijklmnopqrstuvwxyz";

    /// <summary>
    /// Writes the HTML-safe <c>matrix</c> document (<c>{ "protocol": "canopyx/2", "type": "matrix" }</c>, see "Matrix" in
    /// docs/data-protocol.md). Cells travel as one string per row, a character per column naming the state (<c>.</c> for no
    /// data), so a 400 by 400 matrix is about 160 KB; values, texts and details follow as a sparse list.
    /// </summary>
    /// <returns>The document.</returns>
    /// <exception cref="InvalidOperationException">The matrix is not valid.</exception>
    public string ToJson() {
        Validate();
        var rows = CanopyMatrixValidator.Index(Rows);
        var columns = Square ? rows : CanopyMatrixValidator.Index(Columns);
        var stateIndex = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var i = 0; i < States.Count; i++) stateIndex[States[i].Id] = i;
        var grid = new char[rows.Count][];
        for (var r = 0; r < grid.Length; r++) { grid[r] = new char[columns.Count]; for (var c = 0; c < columns.Count; c++) grid[r][c] = '.'; }
        var notes = new List<(int Row, int Column, CanopyMatrixCell Cell)>();
        foreach (var cell in Cells) {
            int r = rows[cell.Row], c = columns[cell.Column];
            if (Square && Diagonal == CanopyMatrixDiagonal.Self && r == c) continue;
            grid[r][c] = StateDigits[stateIndex[cell.State]];
            if (cell.Value.HasValue || cell.Text != null || cell.Title != null || cell.Details.Count > 0) notes.Add((r, c, cell));
        }

        notes.Sort((a, b) => a.Row != b.Row ? a.Row.CompareTo(b.Row) : a.Column.CompareTo(b.Column));
        var writer = new CanopyJsonWriter(256 + grid.Length * (columns.Count + 4));
        writer.BeginObject().Envelope("matrix").Property("id", Id).Property("label", Label);
        writer.Name("rows"); WriteAxis(writer, Rows);
        if (Square) writer.Property("square", true).OptionalProperty("columnTitle", Columns.Title); else { writer.Name("columns"); WriteAxis(writer, Columns); }
        if (Diagonal == CanopyMatrixDiagonal.Data) writer.Property("diagonal", "data");
        writer.Name("states").BeginArray();
        foreach (var state in States) {
            writer.BeginObject().Property("id", state.Id).Property("label", state.Label).OptionalProperty("tone", state.Tone.Name);
            writer.Property("symbol", SymbolName(state.Symbol));
            if (state.Attention) writer.Property("attention", true);
            writer.EndObject();
        }

        writer.EndArray().Name("cells").BeginArray();
        foreach (var row in grid) writer.String(new string(row));
        writer.EndArray();
        if (notes.Count > 0) {
            writer.Name("notes").BeginArray();
            foreach (var (row, column, cell) in notes) WriteNote(writer, row, column, cell);
            writer.EndArray();
        }

        if (TotalStates.Count > 0 || !RowTotals || !ColumnTotals) {
            writer.Name("totals").BeginObject();
            if (TotalStates.Count > 0) writer.StringArray("states", TotalStates);
            if (!RowTotals) writer.Property("rows", false);
            if (!ColumnTotals) writer.Property("columns", false);
            writer.EndObject();
        }

        if (AttentionOnly) writer.Property("attentionOnly", true);
        writer.OptionalProperty("cellWidth", CellWidth);
        if (Density.HasValue) writer.Property("density", Density.Value == CanopyGridDensity.Compact ? "compact" : Density.Value == CanopyGridDensity.Comfortable ? "comfortable" : "normal");
        if (Details == CanopyMatrixDetails.Host) writer.Property("details", "host");
        if (Phone == CanopyMatrixPhoneLayout.Cards) writer.Property("phone", "cards");
        if (!Legend) writer.Property("legend", false);
        if (Labels != null && Labels.HasMatrixLabels) { writer.Name("labels"); Labels.WriteMatrixJson(writer); }
        return writer.EndObject().ToString();
    }

    private static void WriteAxis(CanopyJsonWriter writer, CanopyMatrixAxis axis) {
        writer.BeginObject().OptionalProperty("title", axis.Title).OptionalProperty("noun", axis.Noun);
        if (axis.Attributes.Count > 0) {
            writer.Name("attributes").BeginArray();
            foreach (var attribute in axis.Attributes) {
                writer.BeginObject().Property("id", attribute.Id).Property("title", attribute.Title);
                writer.Property("kind", attribute.Kind == CanopyColumnKind.Number ? "number" : attribute.Kind == CanopyColumnKind.DateTime ? "datetime" : "text");
                if (attribute.Facet) writer.Property("facet", true);
                writer.EndObject();
            }

            writer.EndArray();
        }

        writer.Name("items").BeginArray();
        foreach (var item in axis.Items) {
            writer.BeginObject().Property("id", item.Id).Property("label", item.Label).OptionalProperty("secondary", item.Secondary).OptionalProperty("href", item.Href);
            if (item.Values.Count > 0) {
                writer.Name("values").BeginObject();
                foreach (var attribute in axis.Attributes) {
                    if (item.Values.TryGetValue(attribute.Id, out var value) && value != null) { writer.Name(attribute.Id); value.WriteJson(writer); }
                }

                writer.EndObject();
            }

            writer.EndObject();
        }

        writer.EndArray().OptionalProperty("groupBy", axis.GroupBy);
        if (axis.SortBy != null) writer.Name("sort").BeginObject().Property("by", axis.SortBy).Property("direction", axis.SortDescending ? "desc" : "asc").EndObject();
        writer.EndObject();
    }

    private static void WriteNote(CanopyJsonWriter writer, int row, int column, CanopyMatrixCell cell) {
        writer.BeginArray().Number(row).Number(column);
        var last = cell.Details.Count > 0 ? 4 : cell.Title != null ? 3 : cell.Text != null ? 2 : 1;
        if (cell.Value.HasValue) writer.Number(cell.Value.Value); else writer.Null();
        if (last >= 2) writer.String(cell.Text);
        if (last >= 3) writer.String(cell.Title);
        if (last >= 4) {
            writer.BeginArray();
            foreach (var detail in cell.Details) writer.BeginArray().String(detail.Key).String(detail.Value).EndArray();
            writer.EndArray();
        }

        writer.EndArray();
    }

    private static string SymbolName(CanopyMatrixSymbol symbol) => symbol.ToString().ToLowerInvariant();

    /// <summary>Reads a matrix document.</summary>
    /// <param name="json">The document, as <see cref="ToJson"/> writes it.</param>
    /// <returns>The matrix.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="json"/> is null.</exception>
    /// <exception cref="FormatException">The text is not valid JSON, nests deeper than 64 levels or is longer than 4 MiB.</exception>
    /// <exception cref="InvalidOperationException">The document is not a valid matrix: another type, an unknown property, or any rule <see cref="Validate"/> checks.</exception>
    public static CanopyMatrix FromJson(string json) {
        const string what = "The matrix document";
        var map = CanopyFlowContract.Object(CanopyJsonReader.Parse(json), what, "protocol", "type", "id", "label", "rows", "columns", "square", "columnTitle", "diagonal", "states",
            "cells", "notes", "totals", "attentionOnly", "cellWidth", "density", "details", "phone", "legend", "labels");
        if (CanopyFlowContract.Text(map, "protocol", what) != CanopyProtocol.Version || CanopyFlowContract.Text(map, "type", what) != "matrix")
            throw new InvalidOperationException(what + " must have protocol " + CanopyProtocol.Version + " and type \"matrix\".");
        var id = CanopyFlowContract.RequiredText(map, "id", what);
        CanopyMatrix matrix;
        try { matrix = new CanopyMatrix(id, CanopyFlowContract.RequiredText(map, "label", what)); } catch (ArgumentException error) { throw new InvalidOperationException(error.Message, error); }
        matrix.Square = CanopyFlowContract.Boolean(map, "square", what) ?? false;
        ReadAxis(map.TryGetValue("rows", out var rows) ? rows : throw new InvalidOperationException(what + " needs 'rows'."), matrix.Rows, what + " (rows)");
        if (map.TryGetValue("columns", out var columns)) {
            if (matrix.Square) throw new InvalidOperationException("A square matrix document has no 'columns'.");
            ReadAxis(columns, matrix.Columns, what + " (columns)");
        } else if (!matrix.Square) throw new InvalidOperationException(what + " needs 'columns' or square.");
        var columnTitle = CanopyFlowContract.Text(map, "columnTitle", what);
        if (columnTitle != null && !matrix.Square) throw new InvalidOperationException("Only a square matrix document has 'columnTitle'.");
        if (matrix.Square) matrix.Columns.Title = columnTitle;
        var diagonal = CanopyFlowContract.Text(map, "diagonal", what);
        if (diagonal != null && !matrix.Square) throw new InvalidOperationException("Only a square matrix document has a diagonal.");
        if (diagonal != null) matrix.Diagonal = CanopyFlowContract.Choose(diagonal, what, "diagonal", ("self", CanopyMatrixDiagonal.Self), ("data", CanopyMatrixDiagonal.Data));
        foreach (var node in CanopyFlowContract.Items(map, "states", what, MaxStates)) {
            var state = CanopyFlowContract.Object(node, what + " (state)", "id", "label", "tone", "symbol", "attention");
            var symbol = CanopyFlowContract.Text(state, "symbol", what);
            CanopyMatrixState item;
            try {
                item = new CanopyMatrixState(CanopyFlowContract.RequiredText(state, "id", what), CanopyFlowContract.RequiredText(state, "label", what),
                    CanopyFlowContract.Text(state, "tone", what) is string tone ? CanopyTone.Named(tone) : default, CanopyMatrixSymbol.Dot) {
                    Attention = CanopyFlowContract.Boolean(state, "attention", what) ?? false
                };
            } catch (ArgumentException error) { throw new InvalidOperationException(error.Message, error); }
            if (symbol == null || !Enum.TryParse(symbol, true, out CanopyMatrixSymbol parsed) || SymbolName(parsed) != symbol || !Enum.IsDefined(typeof(CanopyMatrixSymbol), parsed))
                throw new InvalidOperationException(what + " needs a known symbol for each state, not '" + symbol + "'.");
            item.Symbol = parsed;

            matrix.States.Add(item);
        }

        ReadCells(map, matrix, what);
        if (map.TryGetValue("totals", out var totals)) {
            var totalMap = CanopyFlowContract.Object(totals, what + " (totals)", "states", "rows", "columns");
            foreach (var state in CanopyFlowContract.Items(totalMap, "states", what, MaxStates)) matrix.TotalStates.Add(state as string ?? throw new InvalidOperationException(what + " lists a total state that is not text."));
            matrix.RowTotals = CanopyFlowContract.Boolean(totalMap, "rows", what) ?? true;
            matrix.ColumnTotals = CanopyFlowContract.Boolean(totalMap, "columns", what) ?? true;
        }

        matrix.AttentionOnly = CanopyFlowContract.Boolean(map, "attentionOnly", what) ?? false;
        matrix.CellWidth = CanopyFlowContract.Integer(map, "cellWidth", what);
        var density = CanopyFlowContract.Text(map, "density", what);
        if (density != null) matrix.Density = CanopyFlowContract.Choose(density, what, "density", ("compact", CanopyGridDensity.Compact), ("normal", CanopyGridDensity.Default), ("comfortable", CanopyGridDensity.Comfortable));
        var details = CanopyFlowContract.Text(map, "details", what);
        if (details != null) matrix.Details = CanopyFlowContract.Choose(details, what, "details", ("dialog", CanopyMatrixDetails.Dialog), ("host", CanopyMatrixDetails.Host));
        var phone = CanopyFlowContract.Text(map, "phone", what);
        if (phone != null) matrix.Phone = CanopyFlowContract.Choose(phone, what, "phone", ("scroll", CanopyMatrixPhoneLayout.Scroll), ("cards", CanopyMatrixPhoneLayout.Cards));
        matrix.Legend = CanopyFlowContract.Boolean(map, "legend", what) ?? true;
        if (map.TryGetValue("labels", out var labels)) matrix.Labels = CanopyLabels.ReadMatrixLabels(labels);
        matrix.Validate();
        return matrix;
    }

    private static void ReadAxis(object? node, CanopyMatrixAxis axis, string what) {
        var map = CanopyFlowContract.Object(node, what, "title", "noun", "attributes", "items", "groupBy", "sort");
        axis.Title = CanopyFlowContract.Text(map, "title", what);
        axis.Noun = CanopyFlowContract.Text(map, "noun", what);
        var kinds = new Dictionary<string, CanopyColumnKind>(StringComparer.Ordinal);
        foreach (var entry in CanopyFlowContract.Items(map, "attributes", what, 32)) {
            var attribute = CanopyFlowContract.Object(entry, what + " (attribute)", "id", "title", "kind", "facet");
            var kind = CanopyFlowContract.Choose(CanopyFlowContract.Text(attribute, "kind", what) ?? "text", what, "kind",
                ("text", CanopyColumnKind.Text), ("number", CanopyColumnKind.Number), ("datetime", CanopyColumnKind.DateTime));
            try {
                var item = new CanopyMatrixAttribute(CanopyFlowContract.RequiredText(attribute, "id", what), CanopyFlowContract.RequiredText(attribute, "title", what), kind) {
                    Facet = CanopyFlowContract.Boolean(attribute, "facet", what) ?? false
                };
                axis.Attributes.Add(item);
                kinds[item.Id] = kind;
            } catch (ArgumentException error) { throw new InvalidOperationException(error.Message, error); }
        }

        foreach (var entry in CanopyFlowContract.Items(map, "items", what, MaxItems)) {
            var item = CanopyFlowContract.Object(entry, what + " (item)", "id", "label", "secondary", "href", "values");
            CanopyMatrixItem read;
            try { read = new CanopyMatrixItem(CanopyFlowContract.RequiredText(item, "id", what), CanopyFlowContract.RequiredText(item, "label", what)); } catch (ArgumentException error) { throw new InvalidOperationException(error.Message, error); }
            read.Secondary = CanopyFlowContract.Text(item, "secondary", what);
            read.Href = CanopyFlowContract.Text(item, "href", what);
            if (item.TryGetValue("values", out var values)) {
                if (!(values is Dictionary<string, object?> valueMap)) throw new InvalidOperationException(what + " needs an object in 'values'.");
                foreach (var value in valueMap) read.Values[value.Key] = ReadValue(value.Value, kinds.TryGetValue(value.Key, out var kind) ? kind : CanopyColumnKind.Text, what);
            }

            axis.Items.Add(read);
        }

        axis.GroupBy = CanopyFlowContract.Text(map, "groupBy", what);
        if (map.TryGetValue("sort", out var sort)) {
            var sortMap = CanopyFlowContract.Object(sort, what + " (sort)", "by", "direction");
            axis.SortBy = CanopyFlowContract.RequiredText(sortMap, "by", what);
            axis.SortDescending = CanopyFlowContract.Choose(CanopyFlowContract.Text(sortMap, "direction", what) ?? "asc", what, "direction", ("asc", false), ("desc", true));
        }
    }

    private static CanopyCell ReadValue(object? node, CanopyColumnKind kind, string what) {
        string? text = null;
        if (node is Dictionary<string, object?> map) {
            var cell = CanopyFlowContract.Object(map, what + " (value)", "value", "text");
            text = CanopyFlowContract.Text(cell, "text", what);
            map.TryGetValue("value", out node);
        }

        CanopyCell result = node switch {
            null => new CanopyCell(),
            bool flag => new CanopyCell(flag),
            long whole => new CanopyCell(whole),
            double real => new CanopyCell(real),
            string date when kind == CanopyColumnKind.DateTime && DateTime.TryParse(date, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var moment) => new CanopyCell(moment),
            string plain => new CanopyCell(plain),
            _ => throw new InvalidOperationException(what + " has a value that is not text, a number or true or false.")
        };
        result.Text = text;
        return result;
    }

    private static void ReadCells(Dictionary<string, object?> map, CanopyMatrix matrix, string what) {
        var rows = matrix.Rows.Items;
        var columns = matrix.Square ? matrix.Rows.Items : matrix.Columns.Items;
        var lines = CanopyFlowContract.Items(map, "cells", what, MaxItems);
        if (lines.Count != rows.Count) throw new InvalidOperationException(what + " needs one 'cells' string per row.");
        var placed = new Dictionary<long, CanopyMatrixCell>();
        for (var r = 0; r < lines.Count; r++) {
            if (!(lines[r] is string line) || line.Length != columns.Count) throw new InvalidOperationException(what + " needs a 'cells' string of one character per column for each row.");
            for (var c = 0; c < line.Length; c++) {
                if (line[c] == '.') continue;
                var index = StateDigits.IndexOf(line[c]);
                if (index < 0 || index >= matrix.States.Count) throw new InvalidOperationException(what + " names an undeclared state in 'cells'.");
                // A self cell of a square matrix holds no state, as the browser reads it, but its character is still checked.
                if (matrix.Square && matrix.Diagonal == CanopyMatrixDiagonal.Self && r == c) continue;
                placed[(long)r * columns.Count + c] = matrix.Set(rows[r].Id, columns[c].Id, matrix.States[index].Id);
            }
        }

        var noted = new HashSet<long>();
        foreach (var node in CanopyFlowContract.Items(map, "notes", what, MaxCells)) {
            if (!(node is List<object?> note) || note.Count < 3 || note.Count > 6 || !(note[0] is long r) || !(note[1] is long c) || r < 0 || c < 0 || r >= rows.Count || c >= columns.Count ||
                !placed.TryGetValue(r * columns.Count + c, out var cell) || !noted.Add(r * columns.Count + c)) throw new InvalidOperationException(what + " has a note that names no cell, or a cell twice.");
            cell.Value = note[2] switch { null => null, long whole => whole, double real => real, _ => throw new InvalidOperationException(what + " has a note value that is not a number.") };
            cell.Text = note.Count > 3 ? note[3] as string ?? (note[3] == null ? null : throw new InvalidOperationException(what + " has a note text that is not text.")) : null;
            cell.Title = note.Count > 4 ? note[4] as string ?? (note[4] == null ? null : throw new InvalidOperationException(what + " has a note title that is not text.")) : null;
            if (note.Count > 5 && note[5] != null) {
                if (!(note[5] is List<object?> details)) throw new InvalidOperationException(what + " has note details that are not a list.");
                foreach (var detail in details) {
                    if (!(detail is List<object?> pair) || pair.Count != 2 || !(pair[0] is string label) || !(pair[1] is string value)) throw new InvalidOperationException(what + " has a note detail that is not a label and a value.");
                    cell.Detail(label, value);
                }
            }
        }
    }
}
