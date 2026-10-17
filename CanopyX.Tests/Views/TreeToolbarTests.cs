using System.Text.Json.Nodes;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Views;

/// <summary>
/// Tree views carry the flat grid's toolbar switches, export format choices, auto height and column layout to the browser,
/// and validate what only flat grids support.
/// </summary>
public sealed class TreeToolbarTests {
    private static CanopyTreeView View() {
        var view = new CanopyTreeView("org", "Organisation");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("title", "Title") { Sizing = CanopyColumnSizing.Preferred(180) });
        view.Roots.Add(new CanopyNode("ceo", "Chief"));
        return view;
    }

    [Fact]
    public void DefaultView_WritesNoToolbarExportFormatsOrAutoHeight() {
        var json = JsonNode.Parse(View().ToJson())!;

        Assert.Null(json["toolbar"]);
        Assert.Null(json["exportFormats"]);
        Assert.Null(json["autoHeight"]);
    }

    [Fact]
    public void SwitchedOffControls_ExportFormatsAndAutoHeight_AreWrittenAndMatchTheSchema() {
        var view = View();
        view.Toolbar.Columns = false;
        view.Toolbar.Export = false;
        view.Toolbar.Filters = false;
        view.Toolbar.Views = false;
        view.Toolbar.More = false;
        view.ExportFormats.Add("xlsx");
        view.ExportFormats.Add("pdf");
        view.AutoHeight = false;

        var text = view.ToJson();
        var json = JsonNode.Parse(text)!;

        Assert.Equal("{\"filters\":false,\"columns\":false,\"views\":false,\"export\":false,\"more\":false}", json["toolbar"]!.ToJsonString());
        Assert.Equal("[\"xlsx\",\"pdf\"]", json["exportFormats"]!.ToJsonString());
        Assert.False(json["autoHeight"]!.GetValue<bool>());
        ProtocolSchema.AssertValid(text, "tree toolbar options");
    }

    [Theory]
    [InlineData("csv")]
    [InlineData("Excel")]
    [InlineData("")]
    public void InvalidExportFormats_AreRejected(string format) {
        var view = View();
        view.ExportFormats.Add(format);

        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void DuplicateExportFormats_AreRejected() {
        var view = View();
        view.ExportFormats.Add("xlsx");
        view.ExportFormats.Add("xlsx");

        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void TreeColumns_WriteContentSizingPrioritiesAndTheTreeColumnPin() {
        var view = View();
        view.Columns[0].Pinned = CanopyGridColumnPin.None;
        view.Columns.Add(new CanopyColumn("email", "Email") { ResponsivePriority = 10000, AlwaysVisible = true });
        view.Columns.Add(new CanopyColumn("notes", "Notes") { Sizing = CanopyColumnSizing.Flex(2, maximum: 600) });
        view.Columns.Add(new CanopyColumn("id", "Id") { Sizing = CanopyColumnSizing.Fixed(90) });

        var text = view.ToJson();
        var columns = JsonNode.Parse(text)!["columns"]!.AsArray();

        // Content-sized columns measure their rows; a declared width stays preferred; the tree column can be unpinned.
        Assert.True(columns[0]!["autoWidth"]!.GetValue<bool>());
        Assert.Equal(160, columns[0]!["width"]!.GetValue<int>());
        Assert.True(columns[0]!.AsObject().ContainsKey("pinned"));
        Assert.Null(columns[0]!["pinned"]);
        Assert.Null(columns[1]!["autoWidth"]);
        Assert.Equal(180, columns[1]!["width"]!.GetValue<int>());
        Assert.Equal(10000, columns[2]!["priority"]!.GetValue<int>());
        Assert.True(columns[2]!["alwaysVisible"]!.GetValue<bool>());
        Assert.Equal(2, columns[3]!["flex"]!.GetValue<double>());
        Assert.True(columns[4]!["fixed"]!.GetValue<bool>());
        Assert.Null(columns[0]!["rowHeader"]);
        ProtocolSchema.AssertValid(text, "tree column layout");
    }

    [Fact]
    public void TreePins_FollowTheTreeColumnAndTheEdges() {
        // The tree column pins left or scrolls; it cannot pin right.
        var right = View();
        right.Columns[0].Pinned = CanopyGridColumnPin.Right;
        Assert.Throws<InvalidOperationException>(() => right.ToJson());

        // Other columns pin left (after the tree column) or right, as on a flat grid; None is the default for them.
        var other = View();
        other.Columns[1].Pinned = CanopyGridColumnPin.Right;
        var json = other.ToJson();
        ProtocolSchema.AssertValid(json, "tree pins");
        Assert.Contains("\"pinned\":\"right\"", json);
        other.Columns[1].Pinned = CanopyGridColumnPin.Left;
        Assert.Contains("\"pinned\":\"left\"", other.ToJson());
        other.Columns[1].Pinned = CanopyGridColumnPin.None;
        Assert.Throws<InvalidOperationException>(() => other.ToJson());
    }

    [Fact]
    public void RowHeader_IsAFlatGridOption() {
        var view = View();
        view.Columns[1].RowHeader = true;

        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }
}
