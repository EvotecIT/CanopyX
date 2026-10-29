using System.Text.Json;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

public sealed class CalculationPartAssetsTests {
    [Fact]
    public void ExpressionsStayInTheOptionalPartAndOnlyNeededFragmentsCarryIt() {
        var view = View();
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "calculations");
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.DoesNotContain("function calculationParse(", script);
            Assert.DoesNotContain("class CalculationFailure", script);
        }
        view.CalculatedColumnsEditable = true;
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "calculations");
        Assert.Contains("application/x-canopyx-calculations", view.ToHtmlFragment());
        view.CalculatedColumnsEditable = false;
        view.Columns.Add(new CanopyColumn("total", "Total") { Kind = CanopyColumnKind.Number, Calculation = CanopyCalculation.Parse("[quantity] * 3") });
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "calculations");
    }

    [Fact]
    public void CompactBundleCapturesCalculatedValuesAndErrorTooltipsWithoutMutatingRows() {
        var view = View();
        view.Columns.Add(new CanopyColumn("total", "Total") { Kind = CanopyColumnKind.Number, Calculation = CanopyCalculation.Parse("[quantity] * 3") });
        view.Columns.Add(new CanopyColumn("broken", "Broken") { Kind = CanopyColumnKind.Number, Calculation = CanopyCalculation.Parse("1/0") });
        var row = new CanopyGridRow("a"); row.Cells["quantity"] = 4; view.Rows.Add(row);
        var data = new CanopyGridRowData(view, new CanopyRowDataOptions { Format = CanopyRowFormat.Compact });
        var captured = data.GetChunk(0);
        using var chunk = JsonDocument.Parse(captured);
        Assert.Equal(12, chunk.RootElement[0][2].GetDouble());
        Assert.Equal("#DIV/0", chunk.RootElement[0][3].GetProperty("text").GetString());
        Assert.Contains("Division by zero", chunk.RootElement[0][3].GetProperty("title").GetString());
        Assert.Single(row.Cells);
        row.Cells["quantity"] = 9;
        Assert.Equal(captured, data.GetChunk(0));
    }

    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("calculation-assets", "Calculations");
        view.Columns.Add(new CanopyColumn("quantity", "Quantity") { Kind = CanopyColumnKind.Number });
        return view;
    }
}
