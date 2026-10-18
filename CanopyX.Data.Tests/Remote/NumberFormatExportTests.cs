using System.Text;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class NumberFormatExportTests {
    [Fact]
    public void SchemaSnapshot_PreservesTheDeclaredImmutableFormatAcrossDetachedCopies() {
        var view = View();
        var original = view.Columns[0].Format;
        var schema = new CanopyDataSchema(view);
        view.Columns[0].Format = CanopyGridNumberFormat.Fixed(0, suffix: " changed");
        var copy = schema.GetColumn("amount").Definition;
        Assert.Same(original, copy.Format);
        copy.Format = null;
        Assert.Same(original, schema.GetColumn("amount").Definition.Format);
        Assert.Contains("\"suffix\":\"%\"", schema.ToJson());
    }

    [Theory]
    [InlineData(false, "de-DE", "Amount\r\n\"1.234,50%\"\r\nHost text\r\n")]
    [InlineData(true, "de-DE", "Amount\r\n1234.5\r\n2.675\r\n")]
    public async Task ServerCsv_UsesCapturedDisplayFormatsAndHostTextButRetainsRawValues(bool raw, string locale, string expected) {
        var view = View();
        var schema = new CanopyDataSchema(view);
        var rows = new[] { new CanopyGridRow("one") { Cells = { ["amount"] = 1234.5 } },
            new CanopyGridRow("two") { Cells = { ["amount"] = new CanopyCell(2.675) { Text = "Host text" } } } };
        var provider = new CanopyInMemoryProvider<CanopyGridRow>(schema, () => rows, row => row.Id,
            new Dictionary<string, Func<CanopyGridRow, object?>> { ["amount"] = row => row.Cells["amount"] }, () => "r1");
        var handler = new CanopyRemoteHandler(schema, provider);
        view.Columns[0].Format = CanopyGridNumberFormat.Fixed(0, suffix: " changed");
        var json = "{\"revision\":\"r1\",\"query\":{},\"locale\":\"" + locale + "\",\"values\":\"" + (raw ? "raw" : "display") + "\"}";
        var job = await handler.PrepareExportAsync(json, "csv");
        using var stream = new MemoryStream();
        await job.WriteAsync(stream);
        var bytes = stream.ToArray();
        Assert.Equal(expected, Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3));
    }

    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("formatted", "Formatted") { Source = CanopyGridSource.HostedOffset() };
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Format = CanopyGridNumberFormat.Fixed(2, suffix: "%") });
        return view;
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public async Task ServerCsv_ProtectsFormulaPrefixesIntroducedByDisplayFormats(int kind) {
        var prefix = kind == 0 ? "=SUM(A1)+" : kind == 1 ? "＋" : kind == 2 ? "\t" : "\r";
        var view = View(); view.Columns[0].Format = CanopyGridNumberFormat.Fixed(0, prefix: prefix);
        var schema = new CanopyDataSchema(view);
        var provider = new CanopyInMemoryProvider<int>(schema, () => new[] { 5 }, value => "one",
            new Dictionary<string, Func<int, object?>> { ["amount"] = value => value }, () => "r1");
        var handler = new CanopyRemoteHandler(schema, provider);
        var job = await handler.PrepareExportAsync("{\"revision\":\"r1\",\"query\":{}}", "csv");
        using var stream = new MemoryStream(); await job.WriteAsync(stream);
        var bytes = stream.ToArray();
        Assert.Contains("'" + prefix + "5", Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3));
    }
}
