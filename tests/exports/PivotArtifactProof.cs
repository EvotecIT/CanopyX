using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using DocumentFormat.OpenXml.Validation;
using OfficeIMO.Pdf;

internal static class PivotArtifactProof {
    internal static object Validate(string path, JsonElement contract) {
        var columns = contract.GetProperty("columns").EnumerateArray().ToArray();
        var rows = contract.GetProperty("rows").EnumerateArray().ToArray();
        return path.EndsWith(".xlsx", StringComparison.Ordinal) ? Workbook(path, columns, rows) : Pdf(path, columns, rows);
    }

    private static void Require(bool condition, string message) {
        if (!condition) throw new InvalidDataException(message);
    }

    private static object Workbook(string path, JsonElement[] columns, JsonElement[] expected) {
        using var document = SpreadsheetDocument.Open(path, false);
        var errors = new OpenXmlValidator().Validate(document).ToArray();
        Require(errors.Length == 0, "Pivot workbook schema errors: " + string.Join(", ", errors.Select(error => error.Description)));
        var workbook = document.WorkbookPart ?? throw new InvalidDataException("Missing workbook.");
        var root = workbook.Workbook ?? throw new InvalidDataException("Missing workbook root.");
        var sheetId = root.Sheets!.Elements<Sheet>().Single().Id!.Value!;
        var sheet = ((WorksheetPart)workbook.GetPartById(sheetId)).Worksheet ?? throw new InvalidDataException("Missing worksheet.");
        var rows = sheet.GetFirstChild<SheetData>()!.Elements<Row>().ToArray();
        Require(rows.Length == expected.Length + 1, "Pivot workbook must preserve every captured row exactly once.");
        var outline = sheet.GetFirstChild<SheetProperties>()?.OutlineProperties;
        Require(outline?.SummaryBelow?.Value == false && outline.SummaryRight?.Value == false,
            "Pivot summaries must precede their descendants on both axes.");
        for (int column = 0; column < columns.Length; column++) {
            var metadata = columns[column];
            Require(ReadCell(rows[0], column) == metadata.GetProperty("title").GetString(), "Pivot header differs.");
            if (!metadata.TryGetProperty("axisKey", out _)) continue;
            var native = sheet.Descendants<Column>().Single(item => item.Min!.Value <= column + 1 && item.Max!.Value >= column + 1);
            Require((native.OutlineLevel?.Value ?? 0) == metadata.GetProperty("outlineLevel").GetInt32(), "Pivot column outline differs.");
            Require((native.Hidden?.Value ?? false) == metadata.GetProperty("hidden").GetBoolean(), "Pivot hidden column differs.");
            Require((native.Collapsed?.Value ?? false) == metadata.GetProperty("collapsed").GetBoolean(), "Pivot collapsed column differs.");
        }
        var styles = workbook.WorkbookStylesPart?.Stylesheet ?? throw new InvalidDataException("Missing pivot styles.");
        var formats = styles.CellFormats!.Elements<CellFormat>().ToArray();
        for (int row = 0; row < expected.Length; row++) {
            var native = rows[row + 1];
            Require((native.OutlineLevel?.Value ?? 0) == expected[row].GetProperty("outlineLevel").GetInt32(), "Pivot row outline differs.");
            Require((native.Hidden?.Value ?? false) == expected[row].GetProperty("hidden").GetBoolean(), "Pivot hidden row differs.");
            Require((native.Collapsed?.Value ?? false) == expected[row].GetProperty("collapsed").GetBoolean(), "Pivot collapsed row differs.");
            for (int column = 0; column < columns.Length; column++) {
                var wanted = expected[row].GetProperty("cells").GetProperty(columns[column].GetProperty("id").GetString()!);
                var value = wanted.GetProperty("value");
                var cell = FindCell(native, column);
                var content = ReadCell(native, column);
                if (value.ValueKind == JsonValueKind.Number) {
                    Require(cell?.DataType is null || cell.DataType.Value == CellValues.Number, "Pivot numeric cell became text.");
                    Require(double.TryParse(content, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) &&
                        number == value.GetDouble(), "Pivot number was recomputed, lost or moved.");
                    if (wanted.TryGetProperty("numberFormat", out var numberFormat) && numberFormat.GetString() == "0.00") {
                        var id = formats[(int)(cell?.StyleIndex?.Value ?? 0)].NumberFormatId?.Value ?? 0;
                        Require(id == 2 || styles.NumberingFormats?.Elements<NumberingFormat>().Any(format =>
                            format.NumberFormatId?.Value == id && format.FormatCode?.Value == "0.00") == true, "Pivot number format differs.");
                    }
                } else if (value.ValueKind == JsonValueKind.Null) Require(content.Length == 0, "Missing pivot value became a value.");
                else Require(content == value.GetString(), "Pivot label was lost or moved.");
            }
        }
        Require(!sheet.Descendants<CellFormula>().Any(), "Frozen pivot values must not become recalculating formulas.");
        return new { file = Path.GetFileName(path), rows = expected.Length, columns = columns.Length, schemaErrors = 0,
            nativeRowOutlines = true, nativeColumnOutlines = true, typedValues = true };
    }

    private static Cell? FindCell(Row row, int column) {
        return row.Elements<Cell>().SingleOrDefault(cell => ColumnIndex(cell.CellReference?.Value ?? "") == column);
    }

    private static int ColumnIndex(string reference) {
        int value = 0;
        foreach (char character in reference.TakeWhile(char.IsLetter)) value = checked(value * 26 + character - 'A' + 1);
        return value - 1;
    }

    private static string ReadCell(Row row, int column) {
        var cell = FindCell(row, column);
        return cell?.DataType?.Value == CellValues.InlineString ? cell.InlineString?.InnerText ?? "" : cell?.CellValue?.Text ?? "";
    }

    private static object Pdf(string path, JsonElement[] columns, JsonElement[] rows) {
        var document = PdfReadDocument.Open(path);
        Require(!document.RepairReport.HasRepairs, "Pivot PDF requires repair.");
        static string Normalize(string value) => Regex.Replace(value, @"\s+", " ").Trim();
        string content = Normalize(string.Join(" ", document.Pages.SelectMany(page => page.GetTextSpans()).Select(span => span.Text)));
        File.WriteAllText(path + ".readback.txt", content);
        var pattern = new Regex(@"Customer\s+10\d{2}", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
        var records = pattern.Matches(content).ToArray();
        var expected = rows.Where(row => !row.GetProperty("summary").GetBoolean()).ToArray();
        var ids = expected.Select(row => row.GetProperty("cells").GetProperty("axis").GetProperty("text").GetString()!).ToArray();
        Require(records.Select(match => Normalize(match.Value)).SequenceEqual(ids), "Pivot PDF detail identity/count/order differs.");
        foreach (var page in document.Pages) {
            var text = Normalize(string.Join(" ", page.GetTextSpans().Select(span => span.Text)));
            if (!pattern.IsMatch(text)) continue;
            Require(page.GetPageSize().Width > page.GetPageSize().Height, "Pivot PDF must retain readable landscape layout.");
            foreach (var column in columns) {
                var title = column.GetProperty("title").GetString()!;
                Require(Regex.Replace(text, @"\s+", "").Contains(Regex.Replace(title, @"\s+", ""), StringComparison.Ordinal),
                    "Pivot PDF lost a repeated column heading: " + title);
            }
        }
        for (int row = 0; row < expected.Length; row++) {
            int end = row + 1 < records.Length ? records[row + 1].Index : content.Length;
            var body = content.Substring(records[row].Index + records[row].Length, end - records[row].Index - records[row].Length);
            int cursor = 0;
            foreach (var column in columns.Skip(1)) {
                var cell = expected[row].GetProperty("cells").GetProperty(column.GetProperty("id").GetString()!);
                var text = cell.GetProperty("text").GetString()!;
                // The native 0.00 format has no grouping separator, even when the screen's text uses grouping.
                if (cell.GetProperty("value").ValueKind == JsonValueKind.Number &&
                    cell.TryGetProperty("numberFormat", out var format) && format.GetString() == "0.00")
                    text = cell.GetProperty("value").GetDouble().ToString("F2", CultureInfo.InvariantCulture);
                if (text.Length == 0) continue;
                var match = Regex.Match(body[cursor..], @"(?<![\p{L}\p{N}])" + Regex.Escape(text) + @"(?![\p{L}\p{N}])",
                    RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
                Require(match.Success, "Pivot PDF lost or reordered a captured numeric cell: " + ids[row] + "/" + column.GetProperty("id").GetString());
                cursor += match.Index + match.Length;
            }
        }
        Require(content.Contains("Grand total", StringComparison.Ordinal), "Pivot PDF lost its grand total context.");
        return new { file = Path.GetFileName(path), rows = expected.Length, pages = document.Pages.Count, repairs = 0,
            repeatedHeadings = true, capturedValues = true };
    }
}
