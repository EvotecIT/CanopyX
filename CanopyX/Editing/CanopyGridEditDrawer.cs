namespace CanopyX;

/// <summary>When the record drawer of an editable flat grid becomes an edit form (<see cref="CanopyGridEditing.Drawer"/>).</summary>
public enum CanopyGridEditDrawer {
    /// <summary>On phones, where cells are small and columns hide; wider screens edit in the cells.</summary>
    Phone = 0,

    /// <summary>On every width.</summary>
    Always,

    /// <summary>Never; the drawer stays read-only.</summary>
    Never
}