namespace CanopyX.Examples;

/// <summary>Defines a lazy checkbox view; the page supplies a synthetic source that also works from disk.</summary>
internal static class CheckboxView {
    internal static CanopyView Create() {
        var view = new CanopyView("checkboxes", "Project checklist") {
            Checkboxes = CanopyCheckboxMode.Hierarchical,
            Selection = CanopySelectionMode.Multiple,
            PageSize = 50,
            Source = CanopySource.Remote("api/projects?ref={ref}&cursor={cursor}")
        };
        view.Columns.Add(new CanopyColumn("name", "Project / task") { Width = 390 });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Width = 190 });
        view.CheckIntents.Add(new CanopyCheckIntent(new[] { "atlas" }, true));
        view.CheckIntents.Add(new CanopyCheckIntent(new[] { "atlas", "atlas-0" }, false));
        return view;
    }
}
