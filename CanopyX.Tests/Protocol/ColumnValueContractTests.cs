using System.Text.Json.Nodes;
using CanopyX.Rendering;

namespace CanopyX.Tests.Protocol;

public sealed class ColumnValueContractTests {
    [Fact]
    public void HeaderDescription_UsesAnOptionalSharedTreeAndGridContract() {
        const string description = "Time of the last successful verification";
        var column = new CanopyColumn("last", "Last verified") { HeaderDescription = description };
        var grid = new CanopyDataGridView("headers", "Headers") { Columns = { column } };
        var tree = new CanopyTreeView("headers", "Headers") { Columns = { column } };
        foreach (var json in new[] { grid.ToJson(), tree.ToJson() }) {
            ProtocolSchema.AssertValid(json, "Header description");
            Assert.Equal(description, (string?)JsonNode.Parse(json)!["columns"]![0]!["headerDescription"]);
            var invalid = ProtocolSchema.Mutate(json, root => root["columns"]![0]!["headerDescription"] = 42);
            Assert.False(ProtocolSchema.Evaluate(invalid).IsValid);
        }
        column.HeaderDescription = null;
        Assert.DoesNotContain("headerDescription", grid.ToJson());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ExplicitEmptyDisplayText_PreservesBlankStaticCellsAndRawValues(bool presented) {
        var view = new CanopyDataGridView("blank", "Blank cells") {
            Columns = { new CanopyColumn("name", "Name"), new CanopyColumn("value", "Value") { Presenter = presented ? CanopyGridPresenter.LongText() : null } }
        };
        view.Rows.Add(new CanopyGridRow("empty") { Cells = { ["name"] = "Explicit", ["value"] = new CanopyCell(null) { Text = string.Empty } } });
        view.Rows.Add(new CanopyGridRow("missing") { Cells = { ["name"] = "Missing", ["value"] = new CanopyCell(null) } });
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Equal(string.Empty, result.Rows[0][1]);
        Assert.Equal("—", result.Rows[1][1]);
        Assert.Null(view.Rows[0].Cells["value"].Value);
        Assert.Equal(string.Empty, view.Rows[0].Cells["value"].Text);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void CategoryLabel_PrecedesExplicitEmptyDisplayTextInStaticGrid(bool presented) {
        var column = new CanopyColumn("state", "State") { Presenter = presented ? CanopyGridPresenter.State() : null };
        column.ValueLabels.Add("fail", "Needs review");
        var view = new CanopyDataGridView("labels", "Labels") { Columns = { column } };
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["state"] = new CanopyCell("fail") { Text = string.Empty } } });
        Assert.Equal("Needs review", CanopyStaticHtml.RenderGridWithResult(view).Rows[0][0]);
        Assert.Equal("fail", view.Rows[0].Cells["state"].Value);
    }

    [Fact]
    public void StaticTree_UsesResolvedCategoryLabelsAndKeepsExplicitNullBlank() {
        var column = new CanopyColumn("state", "State"); column.ValueLabels.Add("fail", "Needs review");
        var view = new CanopyTreeView("labels", "Labels") { Columns = { new CanopyColumn("name", "Name"), column } };
        view.Roots.Add(new CanopyNode("a", "Record") { Cells = { ["state"] = new CanopyCell("fail") { Text = string.Empty } } });
        view.Roots.Add(new CanopyNode("blank", "Blank") { Cells = { ["state"] = new CanopyCell(null) { Text = string.Empty } } });
        var result = CanopyStaticHtml.RenderWithResult(view);
        Assert.Equal("Needs review", result.Rows[0][1]); Assert.Equal(string.Empty, result.Rows[1][1]);
    }

    [Fact]
    public void RecordField_NonDefaultLineLimitIsSerializedAndCheckedBySchema() {
        var field = new CanopyColumn("notes", "Notes") { Wrap = true, MaxLines = 3 };
        var view = new CanopyDataGridView("record", "Record") { Columns = { new CanopyColumn("name", "Name") }, Record = new CanopyRecordPanel { Fields = { field } } };
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "Three-line record field");
        Assert.Equal(3, (int?)JsonNode.Parse(json)!["record"]!["fields"]![0]!["maxLines"]);
        var invalid = ProtocolSchema.Mutate(json, root => root["record"]!["fields"]![0]!["maxLines"] = 13);
        Assert.False(ProtocolSchema.Evaluate(invalid).IsValid);
        field.MaxLines = 2; Assert.DoesNotContain("maxLines", view.ToJson());
    }

    [Fact]
    public void CategoryMetadataTargetsStringTokensWithoutCapturingBooleans() {
        var column = new CanopyColumn("state", "State") { Sortable = true };
        column.ValueLabels.Add("true", "String true"); column.ValueTones.Add("true", CanopyTone.Danger);
        column.ValueOrder.Add("true"); column.ValueOrder.Add("false");
        var view = new CanopyDataGridView("typed", "Typed categories") { Columns = { column } };
        view.Rows.Add(new CanopyGridRow("boolean") { Cells = { ["state"] = true } });
        view.Rows.Add(new CanopyGridRow("string") { Cells = { ["state"] = "true" } });
        var html = CanopyStaticHtml.RenderGrid(view);
        Assert.Contains(">Yes<", html); Assert.Contains(">String true<", html);
        var compare = new CanopyGridGrouping("state").CreateComparer(view);
        Assert.True(compare.Compare(new CanopyCell("true"), new CanopyCell(true)) < 0);
        Assert.True(compare.Compare(new CanopyCell(true), new CanopyCell("unknown")) < 0);
    }
    [Fact]
    public void ColumnDeclarationsRoundTripThroughSchemaAndKeepRawCells() {
        var state = new CanopyColumn("state", "State") { Sortable = true, Wrap = true, MaxLines = 3 };
        state.ValueLabels.Add("fail", "Needs review");
        state.ValueOrder.Add("fail"); state.ValueOrder.Add("pass");
        state.ValueTones.Add("fail", CanopyTone.Warning);
        var days = new CanopyColumn("days", "Days") { Kind = CanopyColumnKind.Number };
        days.NumericTones.Add(new(CanopyNumericToneOperator.Below, 0, CanopyTone.Danger, "Overdue"));
        days.NumericTones.Add(new(CanopyNumericToneOperator.AtMost, 14, CanopyTone.Warning, "Review soon"));
        var view = new CanopyDataGridView("values", "Review queue") { Columns = { state, days } };
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["state"] = new CanopyCell("fail"), ["days"] = new CanopyCell(-1) } });
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "Column labels, order, numeric tones and wrapping");
        var parsed = JsonNode.Parse(json)!;
        Assert.Equal("Needs review", (string?)parsed["columns"]![0]!["valueLabels"]!["fail"]);
        Assert.Equal("below", (string?)parsed["columns"]![1]!["numericTones"]![0]!["operator"]);
        Assert.Equal("fail", (string?)parsed["rows"]![0]!["cells"]!["state"]);
        var html = CanopyStaticHtml.RenderGrid(view);
        Assert.Contains("Needs review", html); Assert.Contains("Overdue", html); Assert.DoesNotContain(">fail<", html);
    }

    [Fact]
    public void CategoryComparerUsesDeclaredTokensThenUnknownOrdinalTextAndNullLast() {
        var state = new CanopyColumn("state", "State") { Sortable = true };
        state.ValueOrder.Add("z"); state.ValueOrder.Add("a");
        state.ValueLabels.Add("z", "First label");
        var view = new CanopyDataGridView("values", "Values") { Columns = { state } };
        var compare = new CanopyGridGrouping("state").CreateComparer(view);
        Assert.True(compare.Compare(new CanopyCell("z"), new CanopyCell("a")) < 0);
        Assert.True(compare.Compare(new CanopyCell("a"), new CanopyCell("A")) < 0);
        Assert.True(compare.Compare(new CanopyCell("A"), new CanopyCell("b")) < 0);
        Assert.True(compare.Compare(new CanopyCell("b"), new CanopyCell(null)) < 0);
    }

    [Theory]
    [InlineData(CanopyNumericToneOperator.AtMost, 14, true)]
    [InlineData(CanopyNumericToneOperator.AtMost, 15, false)]
    [InlineData(CanopyNumericToneOperator.AtLeast, 14, true)]
    [InlineData(CanopyNumericToneOperator.AtLeast, 13, false)]
    [InlineData(CanopyNumericToneOperator.Below, 14, false)]
    [InlineData(CanopyNumericToneOperator.Below, -1, true)]
    [InlineData(CanopyNumericToneOperator.Above, 14, false)]
    [InlineData(CanopyNumericToneOperator.Above, 15, true)]
    public void NumericComparisonsKeepInclusiveAndExclusiveBoundaries(CanopyNumericToneOperator op, double value, bool matches) {
        var rule = new CanopyNumericToneRule(op, 14, CanopyTone.Warning, "Threshold");
        Assert.Equal(matches, rule.Matches(value)); Assert.False(rule.Matches(double.NaN));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(13)]
    public void LineLimitsRejectOutsideSharedRangeInApiAndSchema(int lines) {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyColumn("name", "Name") { MaxLines = lines });
        var view = new CanopyDataGridView("values", "Values") { Columns = { new CanopyColumn("name", "Name") } };
        var json = ProtocolSchema.Mutate(view.ToJson(), root => root["columns"]![0]!["maxLines"] = lines);
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
        Assert.Equal(2, view.Columns[0].MaxLines);
    }
}
