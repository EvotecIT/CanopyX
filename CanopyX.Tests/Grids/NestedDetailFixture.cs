using System;

namespace CanopyX.Tests.Grids;

/// <summary>Representative nested grid, recursive grid and tree payloads shared by definition-aware writer tests.</summary>
internal static class NestedDetailFixture {
    internal static (CanopyDataGridView View, CanopyGridRow Row, Action Invalidate) Create(string detail) {
        var view = new CanopyDataGridView("parents", "Parents") {
            Reporting = new CanopyGridReporting(),
            Record = new CanopyRecordPanel { Source = CanopyRecordSource.Sidecar("records/", 1) }
        };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var row = new CanopyGridRow("parent");
        row.Cells["name"] = "Parent";
        Action invalidate;
        if (detail == "tree") {
            var tree = new CanopyTreeView("children", "Children");
            tree.Columns.Add(new CanopyColumn("label", "Label"));
            view.Reporting.Detail = new CanopyGridDetail { TreeView = tree };
            var child = new CanopyNode("child", "Child");
            child.Cells["label"] = "Nested";
            row.Detail = new CanopyTreeDetail { Roots = { child } };
            invalidate = () => child.Cells["undeclared"] = "Invalid";
        } else {
            var nested = new CanopyDataGridView("children", "Children");
            nested.Columns.Add(new CanopyColumn("quantity", "Quantity") { Kind = CanopyColumnKind.Number });
            view.Reporting.Detail = new CanopyGridDetail { View = nested };
            var child = new CanopyGridRow("child");
            child.Cells["quantity"] = 7;
            row.Detail = new CanopyGridRowsDetail { Rows = { child } };
            if (detail == "deepGrid") {
                var leafView = new CanopyDataGridView("leaves", "Leaves");
                leafView.Columns.Add(new CanopyColumn("quantity", "Quantity") { Kind = CanopyColumnKind.Number });
                nested.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = leafView } };
                var leaf = new CanopyGridRow("leaf");
                leaf.Cells["quantity"] = 9;
                child.Detail = new CanopyGridRowsDetail { Rows = { leaf } };
                invalidate = () => leaf.Cells["undeclared"] = "Invalid";
            } else invalidate = () => child.Cells["undeclared"] = "Invalid";
        }
        return (view, row, invalidate);
    }
}
