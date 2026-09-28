using CanopyX;

namespace CanopyX.Examples;

/// <summary>The view definition shared by the example pages: columns, icons, search, filter, and behavior.</summary>
internal static class ExampleViews {
    private const string ShareIcon = "<svg viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M2 3h12v4H2V3Zm0 6h12v4H2V9Zm2-5v2h2V4H4Zm0 6v2h2v-2H4Z\"/></svg>";
    private const string FolderIcon = "<svg viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M1 3h5l1.5 1.5H15V13H1V3Zm1.5 1.5v7h11V6H6.9L5.4 4.5H2.5Z\"/></svg>";
    private const string FileIcon = "<svg viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M3 1h7l3 3v11H3V1Zm1.5 1.5v11h7V5H9V2.5H4.5Z\"/></svg>";
    private const string HistoryIcon = "<svg viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M8 1.5a6.5 6.5 0 1 1-6.1 8.7l1.4-.5A5 5 0 1 0 4.5 4.4L6 6H1.5V1.5l1.9 1.9A6.5 6.5 0 0 1 8 1.5Zm-.75 3h1.5v3.2l2.3 1.4-.8 1.3-3-1.8V4.5Z\"/></svg>";

    /// <summary>Creates the file shares view over the given roots.</summary>
    internal static CanopyView FileShares(string id, IEnumerable<CanopyNode> roots) {
        var view = new CanopyView(id, "File shares") {
            PageSize = 100,
            Selection = CanopySelectionMode.Multiple,
            Search = new CanopySearchOptions { Placeholder = "Search files and folders" },
            StateKey = id,
            DeepLink = true
        };
        view.Columns.Add(new CanopyColumn("name", "Name") { Width = 380, Sortable = true });
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Width = 110, Sortable = true });
        view.Columns.Add(new CanopyColumn("items", "Items") { Kind = CanopyColumnKind.Number, Width = 80, Hidden = true });
        view.Columns.Add(new CanopyColumn("modified", "Modified") { Kind = CanopyColumnKind.DateTime, Width = 170, Sortable = true });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Width = 150, Sortable = true });
        view.Columns.Add(new CanopyColumn("state", "State") { Width = 100 });
        view.Icons["share"] = ShareIcon;
        view.Icons["folder"] = FolderIcon;
        view.Icons["file"] = FileIcon;
        view.Icons["history"] = HistoryIcon;
        view.Filters.Add(new CanopyFilter("changed", "Only changed in the last 7 days", "changed") { AncestorFlag = "changed-below" });
        foreach (var root in roots) {
            view.Roots.Add(root);
        }

        return view;
    }
}
