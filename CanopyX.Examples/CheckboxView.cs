namespace CanopyX.Examples;

/// <summary>Defines a lazy checkbox view; the page supplies a synthetic source that also works from disk.</summary>
internal static class CheckboxView {
    internal static CanopyTreeView Create() {
        var view = new CanopyTreeView("checkboxes", "Project checklist") {
            Checkboxes = CanopyCheckboxMode.Hierarchical,
            Selection = CanopySelectionMode.Multiple,
            PageSize = 50,
            Source = CanopySource.Remote("api/projects?ref={ref}&cursor={cursor}")
        };
        view.Columns.Add(new CanopyColumn("name", "Project / task") { Sizing = CanopyColumnSizing.Preferred(390) });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Sizing = CanopyColumnSizing.Preferred(190) });
        view.CheckIntents.Add(new CanopyCheckIntent(new[] { "atlas" }, true));
        view.CheckIntents.Add(new CanopyCheckIntent(new[] { "atlas", "atlas-0" }, false));
        return view;
    }
}
