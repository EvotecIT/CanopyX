namespace CanopyX;

/// <summary>How a flat grid edits (<see cref="CanopyGridEditing.Mode"/>).</summary>
public enum CanopyGridEditMode {
    /// <summary>One cell at a time: Enter applies and moves down, Tab applies and edits the next editable cell.</summary>
    Cell = 0,

    /// <summary>A whole row at a time: every editable cell of the row gets its editor, Tab moves between them and Enter applies and commits the row.</summary>
    Row
}