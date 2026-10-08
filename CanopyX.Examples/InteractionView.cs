namespace CanopyX.Examples;

/// <summary>Defines a tree whose page supplies the data source and governs every proposed action.</summary>
internal static class InteractionView {
    internal static CanopyTreeView Create() {
        var view = new CanopyTreeView("interactions", "Project records") {
            DragDrop = true, Selection = CanopySelectionMode.Multiple,
            Source = CanopySource.Remote("api/records?ref={ref}&cursor={cursor}")
        };
        view.Columns.Add(new CanopyColumn("name", "Project / task") { Sizing = CanopyColumnSizing.Preferred(380), Editable = true });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Sizing = CanopyColumnSizing.Preferred(190), Editable = true });
        view.ContextActions.Add(new CanopyContextAction("inspect", "Inspect record"));
        return view;
    }
}
