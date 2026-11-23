using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds a searchable select (docs/ui-select.md): a label and a native select the runtime turns into a combobox.</summary>
/// <remarks>Without the runtime the native select works as it is and submits the same values. This builder emits no assets or executable code.</remarks>
[PowerForge.Fluent.Fluent]
public sealed class CanopySelect {
    /// <summary>Creates a select with a page-unique identity, a form field name and a plain text label.</summary>
    public CanopySelect(string id, string name, string label, CanopySelectOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Name = UiHtml.Text(name, nameof(name));
        Label = UiHtml.Text(label, nameof(label));
        Options = options ?? new CanopySelectOptions();
    }

    /// <summary>Gets the identity of the native select; the wrapper is <c>{Id}-select</c>.</summary>
    public string Id { get; }
    /// <summary>Gets the form field name.</summary>
    public string Name { get; }
    /// <summary>Gets the visible label.</summary>
    public string Label { get; }
    /// <summary>Gets the options in order.</summary>
    public IList<CanopySelectOption> Items { get; } = new List<CanopySelectOption>();
    /// <summary>Gets the typed options.</summary>
    public CanopySelectOptions Options { get; }

    /// <summary>Renders the label, the wrapper and the native select with encoded text.</summary>
    /// <exception cref="ArgumentException">An option is null, a select starts with more values than it allows, or an address is unsafe.</exception>
    /// <exception cref="ArgumentOutOfRangeException">A count is out of range.</exception>
    public string ToHtmlFragment() {
        if (Options.MinLength < 0) throw new ArgumentOutOfRangeException(nameof(Options.MinLength), "The fewest characters cannot be negative.");
        if (Options.Max < 1) throw new ArgumentOutOfRangeException(nameof(Options.Max), "A multiple select takes at least one value.");
        var selected = 0;
        foreach (var item in Items) {
            if (item == null) throw new ArgumentException("Items cannot contain null entries.");
            if (item.Selected) selected++;
            if (item.Flag != null && (item.Flag.Length != 2 || !AsciiLetter(item.Flag[0]) || !AsciiLetter(item.Flag[1]))) throw new ArgumentException("A flag is a two-letter country code.");
            if (item.Avatar != null) Address(item.Avatar);
        }
        if (!Options.Multiple && selected > 1) throw new ArgumentException("A single select starts with one value at most.");
        if (Options.Multiple && selected > Options.Max) throw new ArgumentException("A multiple select cannot start with more values than Max.");
        if (Options.Source != null) Address(Options.Source);
        var html = new StringBuilder("<label");
        UiHtml.Attribute(html, "for", Id);
        html.Append('>').Append(UiHtml.Encode(Label)).Append("</label><div");
        UiHtml.Attribute(html, "id", Id + "-select");
        html.Append(" class=\"cx-select\" data-cx-select");
        if (!Options.Search) UiHtml.Attribute(html, "data-search", "false");
        if (Options.Tags) UiHtml.Attribute(html, "data-tags", "true");
        UiHtml.Attribute(html, "data-source", Options.Source);
        if (Options.MinLength != null) UiHtml.Attribute(html, "data-min-length", UiHtml.Number(Options.MinLength.Value));
        if (Options.Max != null) UiHtml.Attribute(html, "data-max", UiHtml.Number(Options.Max.Value));
        UiHtml.Attribute(html, "data-placeholder", Options.Placeholder);
        html.Append("><select");
        UiHtml.Attribute(html, "id", Id);
        UiHtml.Attribute(html, "name", Name);
        if (Options.Multiple) html.Append(" multiple");
        if (Options.Required) html.Append(" required");
        if (Options.Disabled) html.Append(" disabled");
        html.Append('>');
        if (!Options.Multiple) html.Append("<option value=\"\">").Append(UiHtml.Encode(Options.Placeholder ?? string.Empty)).Append("</option>");
        string? group = null;
        foreach (var item in Items) {
            if (item.Group != group) {
                if (group != null) html.Append("</optgroup>");
                group = item.Group;
                if (group != null) { html.Append("<optgroup"); UiHtml.Attribute(html, "label", group); html.Append('>'); }
            }
            html.Append("<option");
            UiHtml.Attribute(html, "value", item.Value);
            UiHtml.Attribute(html, "data-description", item.Description);
            UiHtml.Attribute(html, "data-badge", item.Badge);
            if (item.Badge != null) UiHtml.Attribute(html, "data-tone", item.BadgeTone.WireName());
            UiHtml.Attribute(html, "data-icon", UiHtml.IconKey(item.Icon));
            UiHtml.Attribute(html, "data-avatar", item.Avatar);
            UiHtml.Attribute(html, "data-flag", item.Flag?.ToLowerInvariant());
            if (item.Selected) html.Append(" selected");
            if (item.Disabled) html.Append(" disabled");
            html.Append('>').Append(UiHtml.Encode(item.Label)).Append("</option>");
        }
        if (group != null) html.Append("</optgroup>");
        return html.Append("</select></div>").ToString();
    }

    private static bool AsciiLetter(char c) => c is >= 'A' and <= 'Z' or >= 'a' and <= 'z';

    private static void Address(string value) {
        foreach (var c in value) if (c < ' ' || c == '\u007f') throw new ArgumentException("An address cannot contain control characters.");
        var trimmed = value.TrimStart();
        if (trimmed.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase) || trimmed.StartsWith("vbscript:", StringComparison.OrdinalIgnoreCase) ||
            trimmed.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && !trimmed.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("An address must be a web, relative or image data address.");
    }
}
