using System;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds a labelled text input with a live mask (docs/ui-mask.md): separators appear as the reader types and other characters are dropped.</summary>
/// <remarks>Without the runtime the input is an ordinary text field. This builder emits no assets or executable code.</remarks>
public sealed class CanopyMaskedInput {
    private static readonly string[] Presets = { "ipv4", "mac", "guid", "date", "time", "time-seconds", "date-time", "postcode", "credit-card" };

    /// <summary>Creates an input with a page-unique identity, a form field name, a plain text label and a mask.</summary>
    /// <param name="id">The input's page-unique identity.</param>
    /// <param name="name">The form field name.</param>
    /// <param name="label">The visible label.</param>
    /// <param name="mask">A preset (ipv4, mac, guid, date, time, time-seconds, date-time, postcode, credit-card) or a pattern of slots and literals:
    /// 0 a digit, a a letter, A an upper-case letter, h a hex digit, * a letter or digit, and \ before a character makes it literal.</param>
    public CanopyMaskedInput(string id, string name, string label, string mask) {
        Id = UiHtml.Id(id, nameof(id));
        Name = UiHtml.Text(name, nameof(name));
        Label = UiHtml.Text(label, nameof(label));
        Mask = UiHtml.Text(mask, nameof(mask));
    }

    /// <summary>Gets the input's identity.</summary>
    public string Id { get; }
    /// <summary>Gets the form field name.</summary>
    public string Name { get; }
    /// <summary>Gets the visible label.</summary>
    public string Label { get; }
    /// <summary>Gets the preset or pattern.</summary>
    public string Mask { get; }
    /// <summary>Gets or sets the starting value; the runtime fits it to the mask.</summary>
    public string? Value { get; set; }
    /// <summary>Gets or sets the empty field's hint, such as "__:__".</summary>
    public string? Placeholder { get; set; }
    /// <summary>Gets or sets whether a form requires an answer.</summary>
    public bool Required { get; set; }

    /// <summary>Renders the label and the input with encoded text.</summary>
    /// <exception cref="ArgumentException">The mask is neither a preset nor a pattern with a slot.</exception>
    public string ToHtmlFragment() {
        if (Array.IndexOf(Presets, Mask) < 0 && !HasSlot(Mask)) throw new ArgumentException("A mask needs at least one slot (0, a, A, h or *) or a preset name.", nameof(Mask));
        var html = new StringBuilder("<label");
        UiHtml.Attribute(html, "for", Id);
        html.Append('>').Append(UiHtml.Encode(Label)).Append("</label><input type=\"text\"");
        UiHtml.Attribute(html, "id", Id);
        UiHtml.Attribute(html, "name", Name);
        UiHtml.Attribute(html, "value", Value);
        UiHtml.Attribute(html, "placeholder", Placeholder);
        if (Required) html.Append(" required");
        html.Append(" autocomplete=\"off\" spellcheck=\"false\" data-cx-mask=\"").Append(UiHtml.Encode(Mask)).Append("\">");
        return html.ToString();
    }

    private static bool HasSlot(string mask) {
        for (var index = 0; index < mask.Length; index++) {
            if (mask[index] == '\\') { index++; continue; }
            if ("0aAh*".IndexOf(mask[index]) >= 0) return true;
        }
        return false;
    }
}
