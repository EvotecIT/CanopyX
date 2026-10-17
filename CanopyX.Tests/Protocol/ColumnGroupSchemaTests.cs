using System.Text.Json;
using CanopyX.Tests.Grids;

namespace CanopyX.Tests.Protocol;

/// <summary>The wire document of column groups, cell ranges and clipboard settings, checked against the schema.</summary>
public sealed class ColumnGroupSchemaTests {
    private static CanopyDataGridView Budget() => GridColumnGroupTests.Budget();

    [Fact]
    public void ToJson_ColumnGroups_WritesNestedGroupsTheirColumnsAndPin() {
        var json = Budget().ToJson();
        ProtocolSchema.AssertValid(json, "column groups");
        using var document = JsonDocument.Parse(json);
        var group = document.RootElement.GetProperty("columnGroups")[0];
        Assert.Equal("h1", group.GetProperty("id").GetString());
        Assert.Equal("left", group.GetProperty("pinned").GetString());
        Assert.False(group.TryGetProperty("columns", out _));
        Assert.Equal(new[] { "jan", "feb", "mar" }, group.GetProperty("groups")[0].GetProperty("columns").EnumerateArray().Select(item => item.GetString()));
    }

    [Fact]
    public void ToJson_WithoutGroupsOrRanges_WritesNeitherProperty() {
        var grid = new CanopyDataGridView("plain", "Plain");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        var json = grid.ToJson();
        Assert.DoesNotContain("columnGroups", json);
        Assert.DoesNotContain("rangeSelection", json);
        Assert.DoesNotContain("clipboard", json);
    }

    [Fact]
    public void ToJson_RangeSelectionAndClipboard_WriteOnlyWhatDiffersFromTheDefaults() {
        var grid = Budget();
        grid.RangeSelection = new CanopyGridRangeSelection();
        using (var document = JsonDocument.Parse(grid.ToJson())) {
            Assert.Equal(JsonValueKind.True, document.RootElement.GetProperty("rangeSelection").ValueKind);
            Assert.False(document.RootElement.TryGetProperty("clipboard", out _));
        }
        grid.RangeSelection = new CanopyGridRangeSelection { Enabled = false };
        using (var off = JsonDocument.Parse(grid.ToJson())) Assert.Equal("{\"enabled\":false}", off.RootElement.GetProperty("rangeSelection").GetRawText());
        grid.RangeSelection = new CanopyGridRangeSelection { MultipleRanges = false, FillHandle = true };
        grid.Clipboard.CopyHeaders = true;
        grid.Clipboard.CopyValues = CanopyGridClipboardValues.Raw;
        grid.Clipboard.Paste = false;
        var json = grid.ToJson();
        ProtocolSchema.AssertValid(json, "cell ranges");
        using var written = JsonDocument.Parse(json);
        Assert.Equal("{\"multiple\":false,\"fillHandle\":true}", written.RootElement.GetProperty("rangeSelection").GetRawText());
        Assert.Equal("{\"copyHeaders\":true,\"copyValues\":\"raw\",\"paste\":false}", written.RootElement.GetProperty("clipboard").GetRawText());
    }

    [Theory]
    [InlineData("empty columns")]
    [InlineData("blank title")]
    public void Schema_RejectsColumnGroupsTheWritersRefuse(string problem) {
        var json = ProtocolSchema.Mutate(Budget().ToJson(), document => {
            var group = document["columnGroups"]![0]!.AsObject();
            if (problem == "empty columns") group["columns"] = new System.Text.Json.Nodes.JsonArray();
            else group["title"] = "   ";
        });
        Assert.False(ProtocolSchema.Evaluate(json).IsValid, problem);
    }
}