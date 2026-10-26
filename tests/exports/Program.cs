using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using DocumentFormat.OpenXml.Validation;
using OfficeIMO.Excel;
using OfficeIMO.Pdf;

var reports = new List<object>();
// The build always uses full validation. Record-only mode isolates reader regressions from an unfinished writer's styles.
bool recordsOnly = args.Skip(1).Contains("--records-only", StringComparer.Ordinal);
void Require(bool condition, string message) { if (!condition) throw new InvalidDataException(message); }
foreach (var sidecar in Directory.EnumerateFiles(args[0], "*.json", SearchOption.AllDirectories).Where(file => file.EndsWith(".xlsx.json") || file.EndsWith(".pdf.json"))) {
    var file = sidecar[..^5];
    using var expected = JsonDocument.Parse(File.ReadAllText(file + ".json"));
    var contract = expected.RootElement;
    int count = contract.GetProperty("expectedCount").GetInt32();
    if (file.EndsWith(".xlsx")) {
        using var sdk = SpreadsheetDocument.Open(file, false);
        var errors = new OpenXmlValidator().Validate(sdk).ToArray();
        if (errors.Length > 0) throw new InvalidDataException(string.Join("; ", errors.Select(error => error.Description)));
        using var model = ExcelDocument.Load(file, new ExcelLoadOptions { AccessMode = OfficeIMO.DocumentAccessMode.ReadOnly });
        using var reader = ExcelDocument.OpenDataReader(file, new ExcelReadOptions { HasHeaderRow = true });
        var columns = contract.GetProperty("columns").EnumerateArray().ToArray();
        int dataOffset = contract.TryGetProperty("grouping", out _) ? 1 : 0;
        if (reader.FieldCount != columns.Length + dataOffset) throw new InvalidDataException("Column count differs.");
        for (int ordinal = 0; ordinal < columns.Length; ordinal++)
            Require(reader.GetName(ordinal + dataOffset) == columns[ordinal].GetProperty("title").GetString(), "Workbook header differs: " + ordinal);
        var expectedRows = contract.GetProperty("rows").EnumerateArray().ToArray();
        var workbook = sdk.WorkbookPart ?? throw new InvalidDataException("Workbook is missing.");
        var workbookRoot = workbook.Workbook ?? throw new InvalidDataException("Workbook root is missing.");
        var sheetPart = (WorksheetPart)workbook.GetPartById(workbookRoot.Sheets!.Elements<Sheet>().First().Id!);
        var sheet = sheetPart.Worksheet ?? throw new InvalidDataException("Worksheet is missing.");
        var structural = new WorkbookRecordProof(contract, columns);
        var xmlRows = sheet.GetFirstChild<SheetData>()!.Elements<Row>().ToDictionary(row => row.RowIndex!.Value);
        var detailRows = new HashSet<uint>();
        int rowIndex = 0; uint worksheetRow = 1;
        while (reader.Read()) {
            worksheetRow++;
            var values = new object[reader.FieldCount]; reader.GetValues(values);
            var identity = rowIndex < expectedRows.Length ? expectedRows[rowIndex].GetProperty("cells")
                .GetProperty(columns[0].GetProperty("id").GetString()!).GetProperty("value").GetString() : null;
            if (rowIndex >= expectedRows.Length || !Equals(values[dataOffset], identity)) {
                structural.AcceptStructuralRow(values, xmlRows.GetValueOrDefault(worksheetRow), rowIndex);
                continue;
            }
            detailRows.Add(worksheetRow);
            var row = expectedRows[rowIndex];
            for (int index = 0; index < columns.Length; index++) {
                var column = columns[index];
                var wanted = row.GetProperty("cells").GetProperty(column.GetProperty("id").GetString()!).GetProperty("value");
                object actual = reader.GetValue(index + dataOffset);
                bool equal = wanted.ValueKind switch {
                    JsonValueKind.Null => actual is DBNull,
                    JsonValueKind.Number => Math.Abs(Convert.ToDouble(actual, CultureInfo.InvariantCulture) - wanted.GetDouble()) < 0.000001,
                    JsonValueKind.String when column.GetProperty("kind").GetString() == "datetime" => actual is DateTime date && date == DateTime.Parse(wanted.GetString()!, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal),
                    JsonValueKind.String => Equals(actual, wanted.GetString()),
                    _ => Equals(actual, wanted.GetBoolean())
                };
                if (!equal) throw new InvalidDataException($"Cell {rowIndex}/{index} differs: {actual} versus {wanted}.");
            }
            rowIndex++;
        }
        if (rowIndex != count) throw new InvalidDataException("Record count differs.");
        structural.Complete();
        if (recordsOnly) {
            reports.Add(new { file = Path.GetFileName(file), mode = "records", rows = rowIndex, columns = reader.FieldCount, schemaErrors = errors.Length });
            continue;
        }
        var requirements = contract.GetProperty("requirements");
        bool metadata = requirements.TryGetProperty("metadata", out var metadataFlag) && metadataFlag.GetBoolean();
        Require(workbookRoot.Sheets!.Elements<Sheet>().Any(item => item.Name == "About") == metadata,
            "The optional metadata worksheet does not match the export request.");
        if (metadata) {
            var about = (WorksheetPart)workbook.GetPartById(workbookRoot.Sheets!.Elements<Sheet>().Single(item => item.Name == "About").Id!);
            string CellText(Cell cell) => cell.InlineString?.InnerText ?? cell.CellValue?.Text ?? "";
            var fields = about.Worksheet!.Descendants<Row>().Skip(1).Select(row => row.Elements<Cell>().ToArray())
                .ToDictionary(cells => CellText(cells[0]), cells => CellText(cells[1]), StringComparer.Ordinal);
            foreach (string name in new[] { "scope", "revision", "recordCount", "total", "matched", "generatedAt" })
                Require(fields.GetValueOrDefault(name) == contract.GetProperty(name).ToString(), "Captured metadata differs: " + name);
            using var query = JsonDocument.Parse(fields["query"]);
            Require(JsonElement.DeepEquals(query.RootElement, contract.GetProperty("query")), "The metadata query differs from the accepted export query.");
        }
        var pane = sheet.Descendants<Pane>().SingleOrDefault();
        Require(pane != null && pane.VerticalSplit?.Value >= 1, "The workbook does not freeze its header.");
        Require(pane!.HorizontalSplit?.Value >= requirements.GetProperty("leadingPinnedColumns").GetInt32() + dataOffset, "The workbook does not freeze its leading pinned columns.");
        var widths = sheet.Descendants<Column>().ToArray();
        for (int index = 0; index < columns.Length; index++) {
            var actual = widths.SingleOrDefault(column => column.Min?.Value <= index + dataOffset + 1 && column.Max?.Value >= index + dataOffset + 1)?.Width?.Value;
            var pixels = columns[index].GetProperty("width").GetProperty("preferred").GetDouble();
            Require(actual.HasValue && Math.Abs(actual.Value * 7 + 5 - pixels) <= 14, "Fitted column width was lost: " + index);
        }
        var numberFormats = workbook.WorkbookStylesPart?.Stylesheet?.NumberingFormats?.Elements<NumberingFormat>() ?? [];
        Require(numberFormats.Any(format => format.FormatCode?.Value?.Contains("$", StringComparison.Ordinal) == true), "The declared currency number format was lost.");
        Require(sheet.Descendants<DataBar>().Any(), "The native data-bar rule was lost.");
        Require(sheet.Descendants<ColorScale>().Any(), "The native colour-scale rule was lost.");
        Require(sheet.Descendants<ConditionalFormattingRule>().Any(rule => rule.Type?.Value == ConditionalFormatValues.Expression), "The native row-tone rule was lost.");
        Require(sheet.Descendants<Hyperlink>().Count() == count, "Exported hyperlinks were lost.");
        foreach (var rule in sheet.Descendants<ConditionalFormatting>()) {
            foreach (string range in (rule.SequenceOfReferences?.InnerText ?? throw new InvalidDataException("A conditional rule has no range.")).Split(' ', StringSplitOptions.RemoveEmptyEntries)) {
                var ends = range.Split(':');
                uint first = uint.Parse(Regex.Match(ends[0], @"\d+$").Value, CultureInfo.InvariantCulture);
                uint last = uint.Parse(Regex.Match(ends[^1], @"\d+$").Value, CultureInfo.InvariantCulture);
                Require(first <= last && last <= xmlRows.Keys.Max(), "A conditional rule has an invalid row range.");
                for (uint number = first; number <= last; number++) Require(detailRows.Contains(number), "A conditional rule includes generated summaries.");
            }
        }
        foreach (var link in sheet.Descendants<Hyperlink>()) {
            uint number = uint.Parse(Regex.Match(link.Reference!.Value!, @"\d+$").Value, CultureInfo.InvariantCulture);
            int ordinal = detailRows.Order().ToList().IndexOf(number);
            Require(ordinal >= 0, "A hyperlink targets a generated row.");
            string target = expectedRows[ordinal].GetProperty("cells").GetProperty(columns[0].GetProperty("id").GetString()!)
                .GetProperty("link").GetProperty("target").GetString()!;
            Require(sheetPart.GetReferenceRelationship(link.Id!).Uri.AbsoluteUri == target, "A captured hyperlink target differs.");
        }
        if (requirements.GetProperty("outlineAndSummary").GetBoolean()) {
            Require(sheet.Descendants<Row>().Any(row => row.OutlineLevel?.Value > 0), "The group outline was lost.");
            Require(sheet.Descendants<CellFormula>().Count() >= 2, "Group or summary aggregate formulas were lost.");
        }
        reports.Add(new { file = Path.GetFileName(file), rows = rowIndex, columns = reader.FieldCount, schemaErrors = errors.Length,
            widths = sheet.Descendants<Column>().Select(column => column.Width?.Value).ToArray(),
            frozenPanes = sheet.Descendants<Pane>().Count(), outlines = sheet.Descendants<Row>().Count(row => row.OutlineLevel?.Value > 0),
            conditionalRules = sheet.Descendants<ConditionalFormatting>().Count(), formulas = sheet.Descendants<CellFormula>().Count() });
    } else {
        var pdf = PdfReadDocument.Open(file);
        if (pdf.RepairReport.HasRepairs) throw new InvalidDataException("PDF requires repair.");
        var columns = contract.GetProperty("columns").EnumerateArray().ToArray();
        string identityPattern = contract.GetProperty("requirements").GetProperty("recordIdentityPattern").GetString()!;
        foreach (var page in pdf.Pages) {
            string text = string.Concat(page.GetTextSpans().Select(span => span.Text));
            // Grouped reports may end with a separate summary table. Every page containing details repeats all headers.
            if (!Regex.IsMatch(text, identityPattern, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100))) continue;
            foreach (var column in columns) if (!text.Contains(column.GetProperty("title").GetString()!, StringComparison.Ordinal))
                throw new InvalidDataException("A PDF page lost a repeating header.");
        }
        string Normalize(string value) => Regex.Replace(value, @"\s+", " ").Trim();
        // The fixture is a left-to-right table. Use page geometry, since late page-count spans may be emitted last.
        string content = Normalize(string.Join(" ", pdf.Pages.SelectMany(page => page.GetTextSpans()
            .OrderByDescending(span => Math.Round(span.Y, 1)).ThenBy(span => span.X)).Select(span => span.Text)));
        var pattern = new Regex(identityPattern, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
        var records = pattern.Matches(content).Cast<Match>().ToArray();
        var expectedRows = contract.GetProperty("rows").EnumerateArray().ToArray();
        var identities = expectedRows.Select(row => Normalize(row.GetProperty("cells").GetProperty(columns[0].GetProperty("id").GetString()!).GetProperty("text").GetString()!)).ToArray();
        Require(records.Select(match => Normalize(match.Value)).SequenceEqual(identities), "PDF record content, count or order differs from the captured scope.");
        var groupText = new HashSet<string>(StringComparer.Ordinal);
        if (contract.TryGetProperty("grouping", out var pdfGrouping)) {
            groupText.UnionWith(["Group", "Grand", "total"]);
            void GroupTokens(JsonElement groups) {
                foreach (var group in groups.EnumerateArray()) {
                    groupText.Add(group.GetProperty("text").GetString()!);
                    foreach (var value in group.GetProperty("aggregates").EnumerateObject()) groupText.Add(value.Value.ToString());
                    if (group.TryGetProperty("groups", out var children)) GroupTokens(children);
                }
            }
            GroupTokens(pdfGrouping.GetProperty("groups"));
            foreach (var value in pdfGrouping.GetProperty("totals").EnumerateObject()) groupText.Add(value.Value.ToString());
            foreach (var aggregate in pdfGrouping.GetProperty("aggregates").EnumerateArray())
                groupText.Add(aggregate.GetProperty("label").GetString()!);
            Require(content.Contains("Grand total", StringComparison.Ordinal), "The PDF grand total is missing.");
        }
        void StructureOnly(string text) {
            string remainder = Regex.Replace(text, @"\bPage \d+ of(?: \d+)?\b", "");
            remainder = remainder.Replace(string.Join(" ", columns.Select(column => column.GetProperty("title").GetString())), "", StringComparison.Ordinal);
            foreach (var item in groupText.OrderByDescending(item => item.Length))
                remainder = Regex.Replace(remainder, @"(?<![\p{L}\p{N}])" + Regex.Escape(item) + @"(?![\p{L}\p{N}])", "",
                    RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
            if (contract.GetProperty("requirements").TryGetProperty("structuralText", out var allowed))
                foreach (var item in allowed.EnumerateArray().Select(item => item.GetString()!).OrderByDescending(item => item.Length))
                    remainder = remainder.Replace(item, "", StringComparison.Ordinal);
            Require(string.IsNullOrWhiteSpace(remainder), "PDF contains unaccounted record text: " + remainder.Trim());
        }
        if (records.Length > 0) StructureOnly(content[..records[0].Index]);
        for (int row = 0; row < records.Length; row++) {
            int start = records[row].Index + records[row].Length, end = row + 1 < records.Length ? records[row + 1].Index : content.Length;
            string body = content[start..end]; int cursor = 0;
            foreach (var column in columns.Skip(1)) {
                string text = Normalize(expectedRows[row].GetProperty("cells").GetProperty(column.GetProperty("id").GetString()!).GetProperty("text").GetString()!);
                if (text.Length == 0) continue;
                var token = new Regex(@"(?<![\p{L}\p{N}])" + Regex.Escape(text) + @"(?![\p{L}\p{N}])", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
                var match = token.Match(body, cursor);
                Require(match.Success, "PDF record lost a captured cell: " + row + "/" + column.GetProperty("id").GetString());
                StructureOnly(body[cursor..match.Index]);
                cursor = match.Index + match.Length;
            }
            StructureOnly(body[cursor..]);
        }
        if (!recordsOnly && contract.GetProperty("requirements").GetProperty("landscape").GetBoolean()) {
            var size = pdf.Pages[0].GetPageSize();
            Require(size.Width > size.Height, "A wide PDF table must use landscape pages.");
        }
        reports.Add(new { file = Path.GetFileName(file), mode = recordsOnly ? "records" : "full", rows = records.Length, pages = pdf.Pages.Count, repeatedHeader = true, repairs = 0 });
    }
}
if (reports.Count == 0) throw new InvalidDataException("No export artifacts found.");
Console.WriteLine(JsonSerializer.Serialize(reports, new JsonSerializerOptions { WriteIndented = true }));
