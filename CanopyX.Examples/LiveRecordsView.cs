namespace CanopyX.Examples;

/// <summary>Defines the records used by the reload and saved-view example.</summary>
internal static class LiveRecordsView {
    internal static CanopyView Create() {
        var view = new CanopyView("live-records", "Records") {
            PageSize = 4,
            Selection = CanopySelectionMode.Multiple,
            StateKey = "live-records",
            Search = new CanopySearchOptions { Placeholder = "Search records" }
        };
        view.Columns.Add(new CanopyColumn("name", "Name") { Width = 360, Sortable = true });
        view.Columns.Add(new CanopyColumn("value", "Value") { Width = 120, Kind = CanopyColumnKind.Number, Sortable = true });
        for (var group = 1; group <= 3; group++) {
            var parent = new CanopyNode("group-" + group, "Group " + group) { Expanded = group == 1 };
            for (var number = 1; number <= 8; number++) {
                var record = new CanopyNode("record-" + group + "-" + number, "Record " + group + "." + number);
                record.Cells["value"] = new CanopyCell(group * 100 + number);
                parent.Children.Add(record);
            }
            view.Roots.Add(parent);
        }
        return view;
    }
}
