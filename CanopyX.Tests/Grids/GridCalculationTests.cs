using System.Text.Json;
using System.Xml.Linq;
using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Tests.Grids;

public sealed class GridCalculationTests {
    [Fact]
    public void Apply_OrdersDependenciesAndCapturesProgramsWithoutMutatingHostRows() {
        var total = Number("total", "[subtotal] * 2");
        var subtotal = Number("subtotal", "[amount] + 1");
        var columns = new[] { total, new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number }, subtotal };
        var set = new CanopyCalculationSet(columns);
        total.Calculation = CanopyCalculation.Parse("999");
        total.Kind = CanopyColumnKind.Text;
        subtotal.Calculation = null;
        var detail = new CanopyPropertiesDetail();
        var input = new CanopyGridRow("r") { Tone = CanopyTone.Warning, ClassName = "source", Detail = detail };
        var amount = new CanopyCell(4L) { Text = "four" };
        input.Cells["amount"] = amount;
        input.Cells["total"] = 123;
        input.Fields["record"] = "record value";

        var result = set.Apply(input);

        Assert.NotSame(input, result);
        Assert.Equal("r", result.Id);
        Assert.Equal(input.Tone, result.Tone);
        Assert.Equal("source", result.ClassName);
        Assert.Same(detail, result.Detail);
        Assert.Same(input.Fields["record"], result.Fields["record"]);
        Assert.Same(amount, result.Cells["amount"]);
        Assert.Equal(5d, result.Cells["subtotal"].Value);
        Assert.Equal(10d, result.Cells["total"].Value);
        Assert.Equal(123L, input.Cells["total"].Value);
        Assert.False(input.Cells.ContainsKey("subtotal"));
        amount.Text = "host still owns this";
        Assert.Equal("host still owns this", result.Cells["amount"].Text);
    }

    [Theory]
    [InlineData("[missing]", "1", "undeclared")]
    [InlineData("[second]", "[first]", "cycle")]
    [InlineData("[first]", "1", "cycle")]
    public void Definition_RejectsMissingReferencesAndCycles(string first, string second, string diagnostic) {
        var view = new CanopyDataGridView("grid", "Grid");
        view.Columns.Add(Number("first", first));
        view.Columns.Add(Number("second", second));
        Assert.Contains(diagnostic, Assert.Throws<InvalidOperationException>(view.Validate).Message);
    }

    [Fact]
    public void Definition_EnforcesCalculationLimitAndEditabilityWithoutBlockingHostedFormulas() {
        var view = new CanopyDataGridView("grid", "Grid");
        for (var i = 0; i < 32; i++) view.Columns.Add(Number("c" + i, "1"));
        view.Validate();
        view.Columns.Add(Number("overflow", "1"));
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Columns.RemoveAt(32);
        view.Columns[0].Editable = true;
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Columns[0].Editable = false;
        view.Source = CanopyGridSource.HostedOffset();
        view.Validate();
        view.CalculatedColumnsEditable = true;
        Assert.Throws<InvalidOperationException>(view.Validate);
    }

    [Fact]
    public void Apply_PropagatesErrorsButStillCalculatesIndependentAndLazyColumns() {
        var set = new CanopyCalculationSet(new[] {
            Number("upstream", "1 / 0"), Number("dependent", "[upstream] + 1"),
            Number("independent", "7 * 3"), Number("lazy", "IF(false, [upstream], 42)")
        });
        var labels = new CanopyLabels { GridCalculationError = "Failed: {error}" };
        var result = set.Apply(new CanopyGridRow("row"), labels);
        foreach (var id in new[] { "upstream", "dependent" }) {
            Assert.Null(result.Cells[id].Value);
            Assert.Equal("#DIV/0", result.Cells[id].Text);
            Assert.Equal(CanopyTone.Danger, result.Cells[id].Tone);
            Assert.Contains("Failed: Division by zero", result.Cells[id].Title);
            Assert.StartsWith(id + " (", result.Cells[id].Title);
        }
        Assert.Equal(21d, result.Cells["independent"].Value);
        Assert.Equal(42d, result.Cells["lazy"].Value);
    }

    [Fact]
    public void StaticErrorsIncludeVisibleReasonsWithoutRequiringTooltips() {
        var view = new CanopyDataGridView("calculations", "Calculated values");
        view.Columns.Add(new CanopyColumn("quantity", "Quantity") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(Number("ratio", "1 / [quantity]"));
        view.Rows.Add(new CanopyGridRow("first"));
        view.Rows.Add(new CanopyGridRow("second"));
        foreach (var row in view.Rows) row.Cells["quantity"] = new CanopyCell(0d);
        var html = CanopyX.Rendering.CanopyStaticHtml.RenderGrid(view);
        const string reason = "<li>#DIV/0: ratio (1 / [quantity]): Calculation error: Division by zero</li>";
        Assert.Contains(reason, html);
        Assert.Equal(html.IndexOf(reason, StringComparison.Ordinal), html.LastIndexOf(reason, StringComparison.Ordinal));
        Assert.DoesNotContain("<script", html);
        var healthy = new CanopyGridRow("healthy"); healthy.Cells["quantity"] = new CanopyCell(1d); view.Rows.Insert(0, healthy);
        var bounded = CanopyX.Rendering.CanopyStaticHtml.RenderGrid(view, options: new CanopyX.Rendering.CanopyStaticHtmlOptions { MaxRows = 1 });
        Assert.DoesNotContain("<li>#DIV/0:", bounded);
    }

    [Theory]
    [InlineData(CanopyColumnKind.Number, "\"12\"", "type")]
    [InlineData(CanopyColumnKind.Text, "12", "type")]
    [InlineData(CanopyColumnKind.DateTime, "\"2026-02-30\"", "date")]
    [InlineData(CanopyColumnKind.DateTime, "\"10/25/2026\"", "date")]
    [InlineData(CanopyColumnKind.DateTime, "12", "date")]
    public void Apply_ReportsResultKindErrorsAsMissingCells(CanopyColumnKind kind, string expression, string error) {
        var set = new CanopyCalculationSet(new[] { new CanopyColumn("value", "Value") { Kind = kind, Calculation = CanopyCalculation.Parse(expression) } });
        var cell = set.Apply(new CanopyGridRow("row")).Cells["value"];
        Assert.Null(cell.Value);
        Assert.Equal("#ERROR", cell.Text);
        Assert.Equal("Value (" + expression + "): Calculation error: " + error, cell.Title);
    }

    [Fact]
    public void Apply_NormalizesDateResultsAndKeepsMissingInputsMissing() {
        var set = new CanopyCalculationSet(new[] {
            new CanopyColumn("input", "Input") { Kind = CanopyColumnKind.Number },
            Number("missing", "[input] * 2"),
            new CanopyColumn("date", "Date") { Kind = CanopyColumnKind.DateTime, Calculation = CanopyCalculation.Parse("\"2026-10-25T01:30:00+02:00\"") },
            new CanopyColumn("flag", "Flag") { Calculation = CanopyCalculation.Parse("true") }
        });
        var result = set.Apply(new CanopyGridRow("row"));
        Assert.Null(result.Cells["missing"].Value);
        Assert.Null(result.Cells["missing"].Text);
        Assert.Equal(new DateTime(2026, 10, 24, 23, 30, 0, DateTimeKind.Utc), result.Cells["date"].Value);
        Assert.Equal(true, result.Cells["flag"].Value);
    }

    [Theory]
    [InlineData("2026-10-25T01:30:00.1Z", 100)]
    [InlineData("2026-10-25T01:30:00.12Z", 120)]
    [InlineData("2026-10-25T01:30:00.123Z", 123)]
    [InlineData("2026-10-25T01:30:00.1234Z", 123)]
    [InlineData("2026-10-25T01:30:00.12345Z", 123)]
    [InlineData("2026-10-25T01:30:00.123456Z", 123)]
    [InlineData("2026-10-25T01:30:00.1234567Z", 123)]
    [InlineData("2026-10-25T03:30:00.9999999+02:00", 999)]
    public void Apply_DateResultsUseStrictIsoAndTruncateSubmillisecondDigits(string text, int milliseconds) {
        var set = new CanopyCalculationSet(new[] { new CanopyColumn("date", "Date") {
            Kind = CanopyColumnKind.DateTime, Calculation = CanopyCalculation.Parse(JsonSerializer.Serialize(text))
        } });
        var cell = set.Apply(new CanopyGridRow("row")).Cells["date"];
        Assert.Null(cell.Text);
        Assert.Equal(new DateTime(2026, 10, 25, 1, 30, 0, milliseconds, DateTimeKind.Utc), cell.Value);
    }

    [Fact]
    public void Apply_DateReferencesUseUtcMillisecondsWithoutChangingSourcePrecision() {
        var set = new CanopyCalculationSet(new[] {
            new CanopyColumn("source", "Source") { Kind = CanopyColumnKind.DateTime },
            new CanopyColumn("date", "Date") { Kind = CanopyColumnKind.DateTime, Calculation = CanopyCalculation.Parse("[source]") }
        });
        var expected = new DateTime(2026, 10, 25, 1, 30, 0, 123, DateTimeKind.Utc);
        var precise = expected.AddTicks(9876);
        foreach (var source in new[] { new CanopyCell(precise), new CanopyCell(DateTime.SpecifyKind(precise, DateTimeKind.Unspecified)),
            new CanopyCell(new DateTimeOffset(precise).ToOffset(TimeSpan.FromHours(2))) }) {
            var row = new CanopyGridRow("row"); row.Cells["source"] = source;
            var result = set.Apply(row);
            Assert.Equal(expected, result.Cells["date"].Value);
            Assert.Equal(precise, source.Value);
            Assert.Same(source, result.Cells["source"]);
        }
    }

    [Fact]
    public void InlineSerializationAndStaticOutput_UseComputedValuesWithoutScriptsOrHostMutation() {
        var view = View();
        view.CalculatedColumnsEditable = true;
        var row = new CanopyGridRow("row"); row.Cells["amount"] = 3; view.Rows.Add(row);
        using var document = JsonDocument.Parse(view.ToJson());
        Assert.True(document.RootElement.GetProperty("calculatedColumnsEditable").GetBoolean());
        Assert.Equal("[amount] * 2", document.RootElement.GetProperty("columns")[1].GetProperty("calculation").GetString());
        Assert.Equal(6d, document.RootElement.GetProperty("rows")[0].GetProperty("cells").GetProperty("double").GetDouble());
        var rendered = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Equal(new[] { "3", "6" }, Assert.Single(rendered.Rows));
        Assert.DoesNotContain("<script", rendered.Html, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("table", XDocument.Parse(rendered.Html).Root!.Name.LocalName);
        Assert.False(row.Cells.ContainsKey("double"));
    }

    [Fact]
    public void HostedStaticOutput_PreservesServerCalculatedCells() {
        var view = View(); view.Source = CanopyGridSource.HostedOffset();
        var page = new CanopyGridPage(view.Id, "r1", 0, 1, 1);
        var row = new CanopyGridRow("row"); row.Cells["amount"] = 3; row.Cells["double"] = 99;
        page.Rows.Add(row);
        Assert.Equal(new[] { "3", "99" }, Assert.Single(CanopyStaticHtml.RenderGridWithResult(view, page).Rows));
    }

    [Fact]
    public void StaticOutput_PreservesCalculationErrorsAndEscapesTranslatedTooltips() {
        var view = View();
        view.GetColumn("double").Calculation = CanopyCalculation.Parse("[amount] / 0");
        view.Labels.GridCalculationError = "Failure <{error}>";
        var row = new CanopyGridRow("row"); row.Cells["amount"] = 3; view.Rows.Add(row);
        var rendered = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Equal(new[] { "3", "#DIV/0" }, Assert.Single(rendered.Rows));
        var table = XDocument.Parse(rendered.Html);
        var error = table.Descendants("td").Single(cell => cell.Value == "#DIV/0");
        Assert.Contains("[amount] / 0", error.Attribute("title")!.Value);
        Assert.Contains("Failure <Division by zero>", error.Attribute("title")!.Value);
        Assert.DoesNotContain("<script", rendered.Html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void InlinePivot_CalculatesRawInputsBeforeAggregating() {
        var view = View();
        view.Reporting = new CanopyGridReporting { Pivotable = true };
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("sum", "double", CanopyGridAggregateOperation.Sum, "Sum"));
        var definition = new CanopyGridPivot(); definition.Values.Add("sum");
        foreach (var value in new[] { 3, 5 }) { var row = new CanopyGridRow("r" + value); row.Cells["amount"] = value; view.Rows.Add(row); }
        var result = CanopyPivot.Compute(view, definition, view.Rows);
        Assert.Equal(16d, result.GetCell(Assert.Single(result.Rows).Key, Assert.Single(result.Columns).Key).Aggregates["sum"]);
        Assert.All(view.Rows, row => Assert.False(row.Cells.ContainsKey("double")));
    }

    [Fact]
    public void TreeSerializationAndStaticOutput_RejectCalculatedColumns() {
        var tree = new CanopyTreeView("tree", "Tree"); tree.Columns.Add(Number("value", "1"));
        Assert.Throws<InvalidOperationException>(() => tree.ToJson());
        Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.Render(tree));
    }

    private static CanopyColumn Number(string id, string expression) => new CanopyColumn(id, id) { Kind = CanopyColumnKind.Number, Calculation = CanopyCalculation.Parse(expression), Sortable = true };
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("grid", "Grid");
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(Number("double", "[amount] * 2"));
        return view;
    }
}
