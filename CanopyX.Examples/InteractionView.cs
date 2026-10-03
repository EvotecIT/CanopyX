namespace CanopyX.Examples;

/// <summary>Defines a tree whose page supplies the data source and governs every proposed action.</summary>
internal static class InteractionView {
    internal static CanopyView Create() {
        var view = new CanopyView("interactions", "Project records") {
            DragDrop = true, Selection = CanopySelectionMode.Multiple,
            Source = CanopySource.Remote("api/records?ref={ref}&cursor={cursor}")
        };
        view.Columns.Add(new CanopyColumn("name", "Project / task") { Width = 380, Editable = true });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Width = 190, Editable = true });
        view.ContextActions.Add(new CanopyContextAction("inspect", "Inspect record"));
        return view;
    }
}
