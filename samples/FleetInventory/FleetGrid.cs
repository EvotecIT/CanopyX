using CanopyX;
using CanopyX.AspNetCore;
using CanopyX.Data;
using CanopyX.Html;

namespace FleetInventory;

/// <summary>The grid definitions, their column allow-lists and the pages that host them.</summary>
public static class FleetGrid {
    public static readonly string[] Sites = { "Amsterdam", "Austin", "Berlin", "Singapore", "São Paulo", "Sydney", "Toronto", "Warsaw" };
    public static readonly string[] Models = { "Rack 1U", "Rack 2U", "Blade", "Tower", "Mini PC", "Laptop", "Virtual machine" };

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

    /// <summary>The machines with editable columns: typed editors and the checks the server repeats before it saves.</summary>
    public static CanopyDataGridView EditableView() {
        var view = View("machines-edit", "Edit machines", grouped: false);
        void Edit(string id, CanopyCellEditor? editor, CanopyCellValidation? validation = null) {
            var column = view.Columns.First(item => item.Id == id);
            column.Editable = true;
            column.Editor = editor;
            column.Validation = validation;
        }
        Edit("name", CanopyCellEditor.Text(), new CanopyCellValidation { Required = true, MaxLength = 40, Pattern = "[a-z0-9-]+", Message = "Use 1 to 40 lowercase letters, digits and hyphens." });
        Edit("site", CanopyCellEditor.Select(Sites));
        Edit("os", CanopyCellEditor.Select("Windows", "Linux", "macOS", "FreeBSD"), new CanopyCellValidation { Required = true });
        Edit("model", CanopyCellEditor.Select(Models), new CanopyCellValidation { Required = true });
        Edit("cores", CanopyCellEditor.Number(1, 512, 1));
        Edit("memory", CanopyCellEditor.Number(0.5, 4096), new CanopyCellValidation { Required = true });
        Edit("online", CanopyCellEditor.Toggle());
        return view;
    }

    /// <summary>The machines grouped at runtime by site (busiest sites first) and operating system, with a distinct count of models.</summary>
    public static CanopyDataGridView GroupedView() {
        var view = View("machines-by-site-os", "Machines by site and operating system", grouped: false);
        view.Reporting!.Groupable = true;
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("models", "model", CanopyGridAggregateOperation.DistinctCount, "Models"));
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("site", descending: true, aggregate: "machines"));
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("os"));
        return view;
    }

    /// <summary>The allow-list: only these expressions can be sorted, filtered, searched, grouped, exported or written.</summary>
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
    public static string Page(CanopyDataGridView view, CanopyDataSchema schema, string endpoint, CanopyTheme theme, string? note = null) {
        var html = view.ToHtmlPage(new CanopyHtmlOptions { Title = "Fleet inventory: " + view.Label, Theme = theme });
        html = html.Replace("</head>", CanopyRemoteScript.Element(schema, endpoint, ("csv", "CSV from server (all matching rows)")) + "</head>");
        return note == null ? html : html.Replace("<main class=\"cx-main\">", "<main class=\"cx-main\">" + note);
    }
}
