namespace CanopyX.Examples;

/// <summary>Defines the query and paging contract used by the browser-hosted records example.</summary>
internal static class QueryRecordsView {
    internal static CanopyTreeView Create() {
        var view = new CanopyTreeView("query-records", "Query records") {
            PageSize = 6,
            Selection = CanopySelectionMode.Multiple,
            Search = new CanopySearchOptions { Placeholder = "Search records" },
            Source = CanopySource.RemoteQuery("api/records?ref={ref}&cursor={cursor}&view={viewQuery}",
                "api/search?q={query}&limit={limit}&view={viewQuery}", "api/counts?ids={ids}&view={viewQuery}")
        };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sizing = CanopyColumnSizing.Preferred(300), Sortable = true });
        view.Columns.Add(new CanopyColumn("value", "Value") { Sizing = CanopyColumnSizing.Preferred(130), Kind = CanopyColumnKind.Number, Sortable = true });
        view.Filters.Add(new CanopyFilter("flagged", "Flagged records", "flagged"));
        return view;
    }
}
