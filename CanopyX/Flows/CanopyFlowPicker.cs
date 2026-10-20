using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The record picker of a pick step (<see cref="CanopyFlowStep.Picker"/>): an ordinary grid or tree view (its search, facets, filters,
/// saved views and record drawer) whose selection is the answer of the step's one <see cref="Field"/>. The answer is the chosen
/// records as <c>{ id, label }</c>, the label being the text of <see cref="LabelColumn"/>, so the review page and the proposal list
/// them without the view. A tray lists what is chosen and survives searches and paging.
/// </summary>
/// <remarks>Pages with a pick step use the data-grid entry point (or the reporting one when the grid needs it), which holds grids and trees.</remarks>
public sealed class CanopyFlowPicker {
    private int _height = 420;

    /// <summary>Creates a picker over a flat grid.</summary>
    /// <param name="field">The step's field, of kind <see cref="CanopyFlowFieldKind.Pick"/>.</param>
    /// <param name="view">The grid the reader picks from.</param>
    /// <exception cref="ArgumentNullException">An argument is null.</exception>
    public CanopyFlowPicker(CanopyFlowField field, CanopyDataGridView view) {
        Field = field ?? throw new ArgumentNullException(nameof(field));
        GridView = view ?? throw new ArgumentNullException(nameof(view));
    }

    /// <summary>Creates a picker over a tree.</summary>
    /// <param name="field">The step's field, of kind <see cref="CanopyFlowFieldKind.Pick"/>.</param>
    /// <param name="view">The tree the reader picks from.</param>
    /// <exception cref="ArgumentNullException">An argument is null.</exception>
    public CanopyFlowPicker(CanopyFlowField field, CanopyTreeView view) {
        Field = field ?? throw new ArgumentNullException(nameof(field));
        TreeView = view ?? throw new ArgumentNullException(nameof(view));
    }

    /// <summary>Creates a picker over a view document: the JSON a grid or tree view writes (<see cref="CanopyDataGridView.ToJson"/>). Reading a flow document gives this form.</summary>
    /// <param name="field">The step's field, of kind <see cref="CanopyFlowFieldKind.Pick"/>.</param>
    /// <param name="viewJson">The view document.</param>
    /// <exception cref="ArgumentNullException">An argument is null.</exception>
    public CanopyFlowPicker(CanopyFlowField field, string viewJson) {
        Field = field ?? throw new ArgumentNullException(nameof(field));
        ViewJson = viewJson ?? throw new ArgumentNullException(nameof(viewJson));
    }

    /// <summary>Gets the step's field: its id keys the answer; its label, help, requirement, item counts, parameter and path apply as to any field.</summary>
    public CanopyFlowField Field { get; }

    /// <summary>Gets the grid the reader picks from, or null.</summary>
    public CanopyDataGridView? GridView { get; }

    /// <summary>Gets the tree the reader picks from, or null.</summary>
    public CanopyTreeView? TreeView { get; }

    /// <summary>Gets the view document the reader picks from, when the picker was created from one (or read from a flow document); null otherwise.</summary>
    public string? ViewJson { get; }

    /// <summary>Gets or sets the column whose text labels a chosen record; null uses the view's first column (a tree's node label when the node has no such cell).</summary>
    public string? LabelColumn { get; set; }

    /// <summary>Gets or sets whether the tray of chosen records shows beside (or below) the view. Default true.</summary>
    public bool ShowsTray { get; set; } = true;

    /// <summary>Gets or sets the view's height in pixels, 160 to 1,200. Default 420.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The height is outside 160 to 1,200.</exception>
    public int Height {
        get => _height;
        set => _height = value < 160 || value > 1200 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A picker is 160 to 1200 pixels tall.") : value;
    }

    /// <summary>Sets the column whose text labels a chosen record (<see cref="LabelColumn"/>).</summary>
    /// <param name="columnId">A column of the view.</param>
    /// <returns>The picker.</returns>
    public CanopyFlowPicker Label(string columnId) { LabelColumn = columnId; return this; }

    /// <summary>Leaves out the tray of chosen records (<see cref="ShowsTray"/>).</summary>
    /// <returns>The picker.</returns>
    public CanopyFlowPicker NoTray() { ShowsTray = false; return this; }

    /// <summary>The view document, validated: a grid or tree view of the canopyx/2 protocol, with its column ids.</summary>
    internal (string Json, string Type, List<string> Columns) Document() {
        string json;
        if (GridView != null) { GridView.Validate(); json = GridView.ToJson(); }
        else if (TreeView != null) { TreeView.Validate(); json = TreeView.ToJson(); }
        else json = ViewJson!;
        if (!(CanopyJsonReader.Parse(json) is Dictionary<string, object?> map) || !(map.TryGetValue("protocol", out var protocol) && protocol as string == CanopyProtocol.Version) ||
            !(map.TryGetValue("type", out var type) && (type as string == "grid" || type as string == "view")))
            throw new InvalidOperationException("The picker of field " + Field.Id + " needs a grid or tree view document of protocol " + CanopyProtocol.Version + ".");
        var columns = new List<string>();
        if (map.TryGetValue("columns", out var list) && list is List<object?> items) {
            foreach (var item in items) if (item is Dictionary<string, object?> column && column.TryGetValue("id", out var id) && id is string name) columns.Add(name);
        }

        return (json, (string)type!, columns);
    }

    internal void Validate(string step) {
        if (Field.Kind != CanopyFlowFieldKind.Pick) throw new InvalidOperationException("The field of pick step " + step + " is of kind Pick.");
        var (_, _, columns) = Document();
        var label = LabelColumn ?? (columns.Count > 0 ? columns[0] : null);
        if (label == null || !columns.Contains(label)) throw new InvalidOperationException("The picker of step " + step + " needs a label column its view declares.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        var (json, _, _) = Document();
        writer.BeginObject().Name("field");
        Field.WriteJson(writer, pick: true);
        writer.Name("view").Raw(json).OptionalProperty("label", LabelColumn);
        if (!ShowsTray) writer.Property("tray", false);
        if (Height != 420) writer.Property("height", Height);
        writer.EndObject();
    }

    internal static CanopyFlowPicker Read(object? node, string what) {
        var map = CanopyFlowContract.Object(node, what + " (pick)", "field", "view", "label", "tray", "height");
        if (!map.TryGetValue("field", out var fieldNode) || !(fieldNode is Dictionary<string, object?> fieldMap)) throw new InvalidOperationException(what + " needs a pick field.");
        var field = CanopyFlowField.Read(new Dictionary<string, object?>(fieldMap, StringComparer.Ordinal) { ["type"] = "pick" });
        if (!map.TryGetValue("view", out var view) || view == null) throw new InvalidOperationException(what + " needs a view.");
        var writer = new CanopyJsonWriter(1024);
        CanopyFlowContract.WriteNode(writer, view);
        var picker = new CanopyFlowPicker(field, writer.ToString()) { LabelColumn = CanopyFlowContract.Text(map, "label", what), ShowsTray = CanopyFlowContract.Boolean(map, "tray", what) ?? true };
        var height = CanopyFlowContract.Integer(map, "height", what);
        if (height.HasValue) {
            try { picker.Height = height.Value; } catch (ArgumentException error) { throw new InvalidOperationException(what + ": " + error.Message, error); }
        }

        return picker;
    }
}