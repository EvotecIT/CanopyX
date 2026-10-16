using System;
using Xunit;

namespace CanopyX.Tests.Records;

/// <summary>Collection payloads continue the enclosing cell depth before shape validation or writing recurses.</summary>
public sealed class CollectionDepthTests {
    [Theory]
    [InlineData("row-cell")]
    [InlineData("row-field")]
    [InlineData("node-cell")]
    [InlineData("node-field")]
    [InlineData("row-properties")]
    [InlineData("node-properties")]
    [InlineData("row-table")]
    [InlineData("node-table")]
    [InlineData("row-grid")]
    [InlineData("node-grid")]
    [InlineData("row-tree")]
    [InlineData("node-tree")]
    public void CollectionValues_KeepTheDepthLimitAcrossCellsFieldsAndDetails(string location) {
        CanopyCell value = "leaf";
        var step = location.EndsWith("grid", StringComparison.Ordinal) || location.EndsWith("tree", StringComparison.Ordinal) ? 2 : 1;
        for (var depth = 0; depth < CanopyCell.MaxStructureDepth; depth += step) value = Wrap(value, location);
        Assert.Contains("leaf", View(value).ToJson());
        var tooDeep = View(Wrap(value, location));
        Assert.Throws<InvalidOperationException>(() => tooDeep.Validate());
        Assert.Throws<InvalidOperationException>(() => tooDeep.ToJson());
    }

    [Theory]
    [InlineData("row-cell")]
    [InlineData("row-field")]
    [InlineData("node-cell")]
    [InlineData("node-field")]
    [InlineData("row-properties")]
    [InlineData("node-properties")]
    [InlineData("row-table")]
    [InlineData("node-table")]
    [InlineData("row-grid")]
    [InlineData("node-grid")]
    [InlineData("row-tree")]
    [InlineData("node-tree")]
    public void CollectionCycles_AreRejectedBeforeTheWriterRecurses(string location) {
        var value = new CanopyCell();
        value.Records = Wrap(value, location).Records;
        // The finite-depth cases first establish the bound used here: no writer runs before validation rejects it.
        var error = Assert.Throws<InvalidOperationException>(() => View(value).Validate());
        Assert.Contains("Structured values nest at most", error.Message);
        var record = new CanopyGridRecord("one") { Row = new CanopyGridRow("one") { Cells = { ["value"] = value } } };
        Assert.Throws<InvalidOperationException>(() => record.ToJson(Definition()));
    }

    [Fact]
    public void NestedTreeProperties_KeepTheSurroundingValidationWriterIntact() {
        var properties = new CanopyPropertiesDetail().Add("Leaf", "content");
        var tree = new CanopyTreeDetail { Roots = { new CanopyNode("nested", "Nested") { Detail = properties } } };
        var page = new CanopyPage("parent");
        page.Items.Add(new CanopyNode("outer", "Outer") { Detail = tree });
        var json = page.ToJson();
        Assert.Contains("\"type\":\"tree\",\"roots\":[{\"id\":\"nested\"", json);
        Assert.Contains("\"type\":\"properties\",\"items\":[{\"name\":\"Leaf\",\"value\":\"content\"}]", json);
    }

    [Fact]
    public void TreeHierarchy_DoesNotConsumeTheStructuredCellDepth() {
        var list = new CanopyRecordList();
        list.Columns.Add(new CanopyColumn("value", "Value"));
        var node = new CanopyNode("n0", "Root");
        list.Roots.Add(node);
        for (var depth = 1; depth < 300; depth++) {
            var child = new CanopyNode("n" + depth, "Node " + depth);
            node.Children.Add(child);
            node = child;
        }
        node.Cells["value"] = "leaf";
        CanopyCell value = CanopyCell.Collection(list);
        for (var depth = 1; depth < CanopyCell.MaxStructureDepth; depth++) value = Wrap(value, "row-cell");
        var json = View(value).ToJson();
        Assert.Contains("\"id\":\"n299\"", json);
        Assert.Contains("leaf", json);
    }

    private static CanopyCell Wrap(CanopyCell value, string location) {
        var list = new CanopyRecordList();
        list.Columns.Add(new CanopyColumn("value", "Value"));
        if (location.StartsWith("node-", StringComparison.Ordinal)) {
            var node = new CanopyNode("one", "One");
            switch (location) {
                case "node-cell": node.Cells["value"] = value; break;
                case "node-field": node.Fields["next"] = value; break;
                default: node.Detail = Detail(value, location.Substring(5)); break;
            }
            list.Roots.Add(node);
        } else {
            var row = new CanopyGridRow("one");
            switch (location) {
                case "row-cell": row.Cells["value"] = value; break;
                case "row-field": row.Fields["next"] = value; break;
                default: row.Detail = Detail(value, location.Substring(4)); break;
            }
            list.Rows.Add(row);
        }
        return CanopyCell.Collection(list);
    }

    private static CanopyDetail Detail(CanopyCell value, string kind) {
        switch (kind) {
            case "properties": return new CanopyPropertiesDetail().Add("Next", value);
            case "table": return new CanopyTableDetail().AddColumns("Next").AddRow(value);
            case "grid": return new CanopyGridRowsDetail { Rows = { new CanopyGridRow("nested") { Cells = { ["value"] = value } } } };
            case "tree": return new CanopyTreeDetail { Roots = { new CanopyNode("nested", "Nested") { Cells = { ["value"] = value } } } };
            default: throw new ArgumentException("Unknown detail kind.", nameof(kind));
        }
    }

    private static CanopyDataGridView Definition() {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("value", "Value"));
        return view;
    }

    private static CanopyDataGridView View(CanopyCell value) {
        var view = Definition();
        view.Rows.Add(new CanopyGridRow("one") { Cells = { ["value"] = value } });
        return view;
    }
}
