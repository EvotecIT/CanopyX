using System.Text;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class CsvProtectionTests {
    [Theory]
    [InlineData("all", false)]
    [InlineData("all", true)]
    [InlineData("filtered", false)]
    [InlineData("filtered", true)]
    [InlineData("selected", false)]
    [InlineData("selected", true)]
    [InlineData("query-selection", false)]
    [InlineData("query-selection", true)]
    public async Task Csv_TextAndTitles_AreProtectedInEveryScope(string scope, bool raw) {
        var cases = new (string Id, string Text, string Expected)[] {
            ("safe", "safe", "safe"),
            ("quoted", "comma,semicolon;tab\t\"quote\"\r\nline", "comma,semicolon;tab\t\"quote\"\r\nline"),
            ("already-text", "'=1", "'=1"),
            ("ascii-equals", "=1+1", "'=1+1"),
            ("ascii-plus", "+1", "'+1"),
            ("ascii-minus", "-1", "'-1"),
            ("ascii-at", "@name", "'@name"),
            ("spaces-ascii", "  =1", "'  =1"),
            ("bom-ascii", "\uFEFF=1", "'\uFEFF=1"),
            ("fullwidth-equals", "\uFF1D1+1", "'\uFF1D1+1"),
            ("fullwidth-plus", "\uFF0B1", "'\uFF0B1"),
            ("fullwidth-minus", "\uFF0D1", "'\uFF0D1"),
            ("fullwidth-at", "\uFF20name", "'\uFF20name"),
            ("spaces-fullwidth", " \uFF1D1", "' \uFF1D1"),
            ("bom-fullwidth", "\uFEFF\uFF1D1", "'\uFEFF\uFF1D1"),
            ("tab", "\tplain", "'\tplain"),
            ("carriage-return", "\rplain", "'\rplain"),
            ("line-feed-text", "\nplain", "\nplain")
        };
        foreach (var delimiter in new[] { ',', ';', '\t' }) {
            foreach (var item in cases) {
                var view = new CanopyDataGridView("csv", "CSV protection") { Source = CanopyGridSource.HostedOffset(), Selection = CanopySelectionMode.Multiple };
                view.Columns.Add(new CanopyColumn("text", item.Text));
                view.Columns.Add(new CanopyColumn("number", "Number") { Kind = CanopyColumnKind.Number });
                var map = new CanopyColumnMap<CsvRow>(view).Key(row => row.Id).Column("text", row => row.Text).Column("number", row => row.Number);
                var rows = new[] { new CsvRow { Id = 1, Text = item.Text, Number = -2 } };
                var options = new CanopyRemoteOptions();
                options.ExportFormats.Clear();
                options.ExportFormats.Add(new CanopyCsvExportFormat(delimiter));
                var handler = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<CsvRow>(rows.AsQueryable(), map), options);
                var query = new { };
                var request = JsonSerializer.Serialize(new {
                    scope = scope == "query-selection" ? "selected" : scope,
                    revision = "live", query, selection = new[] { "1" },
                    querySelection = scope == "query-selection" ? new { kind = "query", revision = "live", query, excludedIds = Array.Empty<string>() } : null,
                    columns = new[] { "text", "number" }, values = raw ? "raw" : "display"
                });
                var job = await handler.PrepareExportAsync(request, "csv");
                using var stream = new MemoryStream();
                await job.WriteAsync(stream);
                var field = Quoted(item.Expected, delimiter);
                var expected = "\uFEFF" + field + delimiter + "Number\r\n" + field + delimiter + (raw ? "-2" : "'-2") + "\r\n";
                Assert.True(Encoding.UTF8.GetBytes(expected).SequenceEqual(stream.ToArray()), "Unexpected CSV bytes for " + item.Id + ", delimiter " + (int)delimiter + ".");
            }
        }
    }

    private static string Quoted(string text, char delimiter) => text.IndexOf(delimiter) >= 0 || text.IndexOf('"') >= 0 || text.IndexOf('\r') >= 0 || text.IndexOf('\n') >= 0
        ? "\"" + text.Replace("\"", "\"\"") + "\"" : text;

    private sealed class CsvRow {
        public int Id { get; set; }
        public string Text { get; set; } = string.Empty;
        public double Number { get; set; }
    }
}
