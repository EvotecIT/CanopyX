using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class ExportFileNameTests {
    [Theory]
    [InlineData("CON", "_CON")]
    [InlineData("nul.txt", "_nul.txt")]
    [InlineData("CON .txt", "_CON .txt")]
    [InlineData("nul .backup.txt", "_nul .backup.txt")]
    [InlineData("PrN", "_PrN")]
    [InlineData("aux.backup.txt", "_aux.backup.txt")]
    [InlineData("COM1", "_COM1")]
    [InlineData("com9.txt", "_com9.txt")]
    [InlineData("LPT1", "_LPT1")]
    [InlineData("lpt9.csv", "_lpt9.csv")]
    [InlineData(" .CON. ", "_CON")]
    public async Task ReservedDeviceNames_AreNeutralizedBeforeCreatingExportJobs(string supplied, string expected) {
        var harness = new Harness(Array.Empty<Host>(), ProviderKind.Reference);
        var json = "{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{},\"fileName\":" + JsonSerializer.Serialize(supplied) + "}";
        var parsed = CanopyRequestParser.ParseExport(json, harness.Schema);
        Assert.Equal(expected, parsed.FileName);
        var job = await harness.Handler.PrepareExportAsync(json, "csv");
        Assert.Equal(expected, job.Request.FileName);
        Assert.Equal(expected + ".csv", job.FileName);
    }

    [Theory]
    [InlineData("Inventory 2026")]
    [InlineData("CONSOLE")]
    [InlineData("com0.txt")]
    [InlineData("LPT10")]
    [InlineData("nul report.txt")]
    public void AllowedBasenames_ArePreserved(string supplied) {
        var schema = new Harness(Array.Empty<Host>(), ProviderKind.Reference).Schema;
        var json = "{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{},\"fileName\":" + JsonSerializer.Serialize(supplied) + "}";
        Assert.Equal(supplied, CanopyRequestParser.ParseExport(json, schema).FileName);
    }

    [Fact]
    public void ReservedViewFallback_IsNeutralized() {
        var view = new CanopyDataGridView("CON", "Devices");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var schema = new CanopyDataSchema(view);
        Assert.Equal("_CON", CanopyRequestParser.ParseExport("{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{}}", schema).FileName);
    }

    [Fact]
    public void ReservedDevicePrefix_StaysWithinTheBasenameLimit() {
        var schema = new Harness(Array.Empty<Host>(), ProviderKind.Reference).Schema;
        var supplied = "nul." + new string('a', 96);
        var json = "{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{},\"fileName\":" + JsonSerializer.Serialize(supplied) + "}";
        Assert.Equal("_" + supplied.Substring(0, 99), CanopyRequestParser.ParseExport(json, schema).FileName);
        supplied = "nul." + new string('a', 94) + ".x";
        json = "{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{},\"fileName\":" + JsonSerializer.Serialize(supplied) + "}";
        Assert.Equal("_nul." + new string('a', 94), CanopyRequestParser.ParseExport(json, schema).FileName);
    }
}
