using CanopyX;
using CanopyX.AspNetCore;
using CanopyX.Data;
using CanopyX.Html;

namespace FleetInventory;

/// <summary>The grid definitions, their column allow-lists and the pages that host them.</summary>
public static class FleetGrid {
    public static CanopyDataGridView View(string id, string label, bool grouped) {
        var view = new CanopyDataGridView(id, label) {
            Source = CanopyGridSource.HostedOffset(), PageSize = 200, Selection = CanopySelectionMode.Multiple, StatusBar = true,
            Noun = "machines", StateKey = id, Density = CanopyGridDensity.Compact
        };
        view.Columns.Add(new CanopyColumn("name", "Machine") { Sortable = true, RowHeader = true, Sizing = CanopyColumnSizing.Preferred(170, 140, 260) });
        view.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(130, 100, 200) });
        view.Columns.Add(new CanopyColumn("os", "Operating system") {
            Sortable = true, Sizing = CanopyColumnSizing.Preferred(150, 120, 200),
            Presenter = CanopyGridPresenter.Enum(new Dictionary<string, CanopyTone> { ["Windows"] = CanopyTone.Info, ["Linux"] = CanopyTone.Success, ["macOS"] = CanopyTone.Neutral, ["FreeBSD"] = CanopyTone.Warning })
        });
        view.Columns.Add(new CanopyColumn("model", "Model") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(140, 110, 220) });
        view.Columns.Add(new CanopyColumn("cores", "Cores") { Kind = CanopyColumnKind.Number, Sortable = true, Aggregatable = true, Sizing = CanopyColumnSizing.Preferred(90, 80, 120) });
        view.Columns.Add(new CanopyColumn("memory", "Memory (GB)") { Kind = CanopyColumnKind.Number, Sortable = true, Aggregatable = true, Sizing = CanopyColumnSizing.Preferred(120, 100, 160) });
        view.Columns.Add(new CanopyColumn("online", "Online") { Sortable = true, Presenter = CanopyGridPresenter.Boolean(), Sizing = CanopyColumnSizing.Preferred(90, 80, 120) });
        view.Columns.Add(new CanopyColumn("lastSeen", "Last seen") { Kind = CanopyColumnKind.DateTime, Sortable = true, Sizing = CanopyColumnSizing.Preferred(170, 140, 220) });
        view.Columns.Add(new CanopyColumn("team", "Team") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(120, 100, 200) });
        foreach (var search in new[] { "name", "site", "model", "team" }) view.SearchColumns.Add(search);
        view.Reporting = new CanopyGridReporting { HeaderFilters = true, FilterGroups = true, SelectionControls = true };
        foreach (var facet in new[] { "site", "os", "model", "team", "online", "cores" }) view.Reporting.FacetColumns.Add(facet);
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("machines", "name", CanopyGridAggregateOperation.Count, "Machines"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("memory", "memory", CanopyGridAggregateOperation.Sum, "Total memory (GB)"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("cores", "cores", CanopyGridAggregateOperation.Average, "Average cores"));
        if (grouped) view.Reporting.Grouping = new CanopyGridGrouping("site");
        return view;
    }

    /// <summary>The allow-list: only these expressions can be sorted, filtered, searched, grouped or exported.</summary>
    public static CanopyColumnMap<Machine> Map(CanopyDataGridView view) => new CanopyColumnMap<Machine>(view)
        .Key(machine => machine.Id)
        .Column("name", machine => machine.Name)
        .Column("site", machine => machine.Site)
        .Column("os", machine => machine.Os)
        .Column("model", machine => machine.Model)
        .Column("cores", machine => machine.Cores)
        .Column("memory", machine => machine.MemoryGb, column => column.Cell(value => new CanopyCell(value) { Text = value.ToString("N1", System.Globalization.CultureInfo.InvariantCulture) }))
        .Column("online", machine => machine.Online)
        .Column("lastSeen", machine => machine.LastSeen)
        .Column("team", machine => machine.Team!.Name);

    /// <summary>A complete page: the grid with the reporting runtime inline, plus the script that connects it to its endpoints.</summary>
    public static string Page(CanopyDataGridView view, CanopyDataSchema schema, string endpoint, CanopyTheme theme) {
        var html = view.ToHtmlPage(new CanopyHtmlOptions { Title = "Fleet inventory: " + view.Label, Theme = theme });
        return html.Replace("</head>", CanopyRemoteScript.Element(schema, endpoint, ("csv", "CSV from server (all matching rows)")) + "</head>");
    }
}