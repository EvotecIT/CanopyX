using System.Collections.Generic;

namespace CanopyX.Html.Ui;

/// <summary>A typed menu entry; action identities are metadata for host event handlers, never executable callback strings.</summary>
public sealed class CanopyMenuItem {
    /// <summary>Creates an entry with a menu-wide unique identity and plain text label.</summary>
    public CanopyMenuItem(string id, string label, CanopyMenuItemKind kind = CanopyMenuItemKind.Action) {
        Id = UiHtml.Id(id, nameof(id));
        UiHtml.EnumValue(kind);
        Label = kind == CanopyMenuItemKind.Separator ? label : UiHtml.Text(label, nameof(label));
        Kind = kind;
    }

    /// <summary>Gets the local identity, unique throughout the entire menu tree.</summary>
    public string Id { get; }
    /// <summary>Gets the encoded visible label. Separators do not render it.</summary>
    public string Label { get; }
    /// <summary>Gets the semantic entry kind.</summary>
    public CanopyMenuItemKind Kind { get; }
    /// <summary>Gets or sets an encoded icon name, never raw icon markup.</summary>
    public string? Icon { get; set; }
    /// <summary>Gets or sets an encoded shortcut hint; the host owns actual shortcut registration.</summary>
    public string? Shortcut { get; set; }
    /// <summary>Gets or sets an encoded count or status badge, preserved by the runtime's menu layout.</summary>
    public string? Badge { get; set; }
    /// <summary>Gets or sets an encoded radio group identity. Radio items in the same menu and group are mutually exclusive; null uses the default group.</summary>
    public string? RadioGroup { get; set; }
    /// <summary>Gets or sets checked state. A non-null value on an Action entry projects it as a checkbox item.</summary>
    public bool? Checked { get; set; }
    /// <summary>Gets or sets whether activation is blocked. The runtime may still focus the entry.</summary>
    public bool Disabled { get; set; }
    /// <summary>Gets or sets whether the action uses the danger treatment.</summary>
    public bool Danger { get; set; }
    /// <summary>Gets the child entries for an action submenu. Checkable entries cannot contain children.</summary>
    public IList<CanopyMenuItem> Children { get; } = new List<CanopyMenuItem>();
}
