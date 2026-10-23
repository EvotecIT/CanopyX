using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds an encoded menu tree with actions, checks, submenus, separators and group labels.</summary>
/// <remarks>Hosts load the CanopyX UI stylesheet and runtime once per page. Render the trigger separately or provide a labelled existing trigger matching TriggerId. Handle action identities through runtime events.</remarks>
public sealed class CanopyMenu {
    /// <summary>Creates a menu with a page-unique identity.</summary>
    public CanopyMenu(string id, CanopyMenuOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Options = options ?? new CanopyMenuOptions();
    }

    /// <summary>Gets the root menu identity.</summary>
    public string Id { get; }
    /// <summary>Gets the identity of the trigger that labels the menu.</summary>
    public string TriggerId => UiOverlayHtml.TriggerId(Id, Options.TriggerId);
    /// <summary>Gets entries in display order.</summary>
    public IList<CanopyMenuItem> Items { get; } = new List<CanopyMenuItem>();
    /// <summary>Gets the typed menu options.</summary>
    public CanopyMenuOptions Options { get; }

    /// <summary>Renders a separate menu trigger button with encoded text and ARIA references.</summary>
    public string ToTriggerHtmlFragment(string label) => UiOverlayHtml.Trigger(Id, TriggerId, label, "menu");

    /// <summary>Renders a closed menu tree. All text and attribute values are encoded; no action is executed.</summary>
    /// <exception cref="ArgumentException">An entry is null, identities collide, the tree cycles, or entry semantics are contradictory.</exception>
    public string ToHtmlFragment() {
        UiHtml.EnumValue(Options.Placement);
        var domIds = new HashSet<string>(StringComparer.Ordinal);
        UiHtml.Unique(domIds, Id);
        UiHtml.Unique(domIds, TriggerId);
        Validate(Items, domIds, new HashSet<string>(StringComparer.Ordinal));
        var html = new StringBuilder();
        Menu(html, Id, TriggerId, Items, true);
        return html.ToString();
    }

    private void Validate(IList<CanopyMenuItem> items, HashSet<string> domIds, HashSet<string> localIds) {
        foreach (var item in items) {
            if (item == null) throw new ArgumentException("Menus cannot contain null entries.");
            // A repeated object in a cycle necessarily repeats its immutable identity, stopping recursion here.
            UiHtml.Unique(localIds, item.Id);
            UiHtml.Unique(domIds, ItemId(item));
            var decoration = item.Kind == CanopyMenuItemKind.Separator || item.Kind == CanopyMenuItemKind.GroupLabel;
            if (decoration && (item.Children.Count > 0 || item.Checked.HasValue || item.Disabled || item.Danger || item.Icon != null || item.Shortcut != null || item.Badge != null || item.RadioGroup != null))
                throw new ArgumentException("Separators and group labels cannot carry action state.");
            if (item.RadioGroup != null && item.Kind != CanopyMenuItemKind.Radio)
                throw new ArgumentException("Only radio items can declare a radio group.");
            if (item.Children.Count > 0) {
                if (item.Kind != CanopyMenuItemKind.Action || item.Checked.HasValue)
                    throw new ArgumentException("Only ordinary actions can own submenus.");
                UiHtml.Unique(domIds, SubmenuId(item));
                Validate(item.Children, domIds, localIds);
            }
        }
    }

    private void Menu(StringBuilder html, string id, string labelledBy, IList<CanopyMenuItem> items, bool root) {
        html.Append("<div class=\"cx-menu\" role=\"menu\" data-cx-menu data-hfx-part=\"menu\" data-state=\"closed\" popover=\"manual\" hidden");
        UiHtml.Attribute(html, "id", id);
        UiHtml.Attribute(html, "aria-labelledby", labelledBy);
        UiHtml.Attribute(html, "data-cx-trigger", labelledBy);
        UiHtml.Attribute(html, "data-placement", root ? UiHtml.Token(Options.Placement) : "right");
        UiHtml.Attribute(html, "data-hfx-variant", Options.Variant);
        html.Append('>');
        foreach (var item in items) Entry(html, item);
        html.Append("</div>");
    }

    private void Entry(StringBuilder html, CanopyMenuItem item) {
        if (item.Kind == CanopyMenuItemKind.Separator || item.Kind == CanopyMenuItemKind.GroupLabel) {
            html.Append("<div");
            UiHtml.Attribute(html, "id", ItemId(item));
            UiHtml.Attribute(html, "class", item.Kind == CanopyMenuItemKind.Separator ? "cx-menu-separator" : "cx-menu-group-label");
            UiHtml.Attribute(html, "role", item.Kind == CanopyMenuItemKind.Separator ? "separator" : "presentation");
            html.Append('>');
            if (item.Kind == CanopyMenuItemKind.GroupLabel) html.Append(UiHtml.Encode(item.Label));
            html.Append("</div>");
            return;
        }
        var checkable = item.Checked.HasValue || item.Kind == CanopyMenuItemKind.Checkbox || item.Kind == CanopyMenuItemKind.Radio;
        html.Append("<button type=\"button\" class=\"cx-menu-item\" data-hfx-part=\"menu-item\" tabindex=\"-1\"");
        UiHtml.Attribute(html, "id", ItemId(item));
        UiHtml.Attribute(html, "data-item-id", item.Id);
        UiHtml.Attribute(html, "role", item.Kind == CanopyMenuItemKind.Radio ? "menuitemradio" : checkable ? "menuitemcheckbox" : "menuitem");
        if (checkable) UiHtml.Attribute(html, "aria-checked", UiHtml.Bool(item.Checked ?? false));
        UiHtml.Attribute(html, "data-radio-group", item.RadioGroup);
        if (item.Disabled) UiHtml.Attribute(html, "aria-disabled", "true");
        UiHtml.Attribute(html, "data-state", item.Disabled ? "disabled" : item.Checked == true ? "selected" : null);
        UiHtml.Attribute(html, "data-danger", UiHtml.Bool(item.Danger));
        if (item.Children.Count > 0) {
            UiHtml.Attribute(html, "aria-haspopup", "menu");
            UiHtml.Attribute(html, "aria-expanded", "false");
            UiHtml.Attribute(html, "aria-controls", SubmenuId(item));
        }
        html.Append('>');
        if (item.Icon != null || checkable) {
            html.Append("<span class=\"cx-menu-icon\" aria-hidden=\"true\"");
            UiHtml.Attribute(html, "data-icon", item.Icon);
            html.Append('>');
            if (item.Checked == true) html.Append("✓");
            html.Append("</span>");
        }
        UiHtml.Span(html, "cx-menu-label", item.Label);
        if (!string.IsNullOrEmpty(item.Badge)) UiHtml.Span(html, "cx-menu-badge", item.Badge!, "badge");
        if (item.Shortcut != null) html.Append(" <kbd>").Append(UiHtml.Encode(item.Shortcut)).Append("</kbd>");
        if (item.Children.Count > 0) html.Append("<span class=\"cx-menu-chevron\" aria-hidden=\"true\">›</span>");
        html.Append("</button>");
        if (item.Children.Count > 0) Menu(html, SubmenuId(item), ItemId(item), item.Children, false);
    }

    private string ItemId(CanopyMenuItem item) => Id + "-item-" + item.Id;
    private string SubmenuId(CanopyMenuItem item) => ItemId(item) + "-menu";
}
