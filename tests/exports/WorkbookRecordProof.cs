using System.Globalization;
using System.Text.Json;
using DocumentFormat.OpenXml.Spreadsheet;

/// <summary>Recognizes the fixture's group and total rows without allowing extra data records.</summary>
internal sealed class WorkbookRecordProof {
    private readonly JsonElement _contract;
    private readonly JsonElement[] _columns;
    private readonly HashSet<string> _identities;
    private readonly List<(int Offset, string[] Labels, JsonElement Totals)> _groups = [];
    private bool _summary;

    internal WorkbookRecordProof(JsonElement contract, JsonElement[] columns) {
        _contract = contract; _columns = columns;
        _identities = contract.GetProperty("rows").EnumerateArray().Select(row => row.GetProperty("cells")
            .GetProperty(columns[0].GetProperty("id").GetString()!).GetProperty("value").GetString()!).ToHashSet(StringComparer.Ordinal);
        if (contract.TryGetProperty("grouping", out var grouping)) Collect(grouping.GetProperty("groups"), grouping.GetProperty("levels"), 0);
    }

    private void Collect(JsonElement groups, JsonElement levels, int depth) {
        foreach (var group in groups.EnumerateArray()) {
            string text = group.GetProperty("text").GetString()!, title = levels[depth].GetProperty("title").GetString()!;
            _groups.Add((group.GetProperty("offset").GetInt32(), [text, title + ": " + text], group.GetProperty("aggregates")));
            if (group.TryGetProperty("groups", out var children)) Collect(children, levels, depth + 1);
        }
    }

    internal void AcceptStructuralRow(object[] values, Row? xml, int recordsRead) {
        string first = Convert.ToString(values[0], CultureInfo.InvariantCulture)?.Trim() ?? "";
        if (_identities.Contains(first)) throw new InvalidDataException("Duplicate or out-of-order workbook record: " + first);
        if (values.All(value => value is DBNull) && xml?.Elements<Cell>().Any(cell => cell.CellFormula != null) != true) return;
        var index = _groups.FindIndex(group => group.Offset == recordsRead && group.Labels.Contains(first, StringComparer.Ordinal));
        if (index >= 0) { ValidateAggregates(values, xml, _groups[index].Totals); _groups.RemoveAt(index); return; }
        if (!_summary && recordsRead == _contract.GetProperty("expectedCount").GetInt32() &&
            _contract.TryGetProperty("grouping", out var grouping) &&
            new[] { "Total", "Totals", "Query totals", "Grand total", "Summary" }.Contains(first, StringComparer.OrdinalIgnoreCase)) {
            ValidateAggregates(values, xml, grouping.GetProperty("totals")); _summary = true; return;
        }
        throw new InvalidDataException("Unexpected workbook row: " + first);
    }

    private void ValidateAggregates(object[] values, Row? xml, JsonElement totals) {
        var aggregates = _contract.GetProperty("grouping").GetProperty("aggregates").EnumerateArray().ToArray();
        for (int ordinal = 1; ordinal < _columns.Length; ordinal++) {
            var matches = aggregates.Where(aggregate => aggregate.GetProperty("column").GetString() == _columns[ordinal].GetProperty("id").GetString()).ToArray();
            if (matches.Length == 0) {
                if (values[ordinal] is not DBNull) throw new InvalidDataException("A structural row contains unexpected record data.");
                continue;
            }
            if (matches.Length != 1) throw new InvalidDataException("The fixture needs one aggregate per exported column.");
            var cell = xml?.Elements<Cell>().SingleOrDefault(cell => ColumnOrdinal(cell.CellReference?.Value) == ordinal);
            if (cell?.CellFormula == null) throw new InvalidDataException("A group or summary aggregate is not a formula.");
            var expected = totals.GetProperty(matches[0].GetProperty("id").GetString()!);
            if (values[ordinal] is not DBNull && (expected.ValueKind != JsonValueKind.Number ||
                Math.Abs(Convert.ToDouble(values[ordinal], CultureInfo.InvariantCulture) - expected.GetDouble()) > 0.000001))
                throw new InvalidDataException("A structural aggregate has the wrong cached value.");
        }
    }

    internal void Complete() {
        if (_contract.GetProperty("requirements").GetProperty("outlineAndSummary").GetBoolean() && (_groups.Count != 0 || !_summary))
            throw new InvalidDataException("Declared group headings or the summary row are missing.");
    }

    private static int ColumnOrdinal(string? reference) {
        int value = 0;
        foreach (char letter in reference ?? "") { if (letter is < 'A' or > 'Z') break; value = value * 26 + letter - 'A' + 1; }
        return value - 1;
    }
}
