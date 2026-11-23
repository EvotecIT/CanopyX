using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// An action a flat grid offers on each row. Activating it raises a proposal the host accepts or rejects in its own
/// <c>onRowAction</c> hook; CanopyX never carries the action out (docs/row-actions.md).
/// </summary>
public sealed class CanopyRowAction {
    private string? _disabledReason;

    /// <summary>Creates an action.</summary>
    /// <param name="id">The identifier sent to the host, unique among the grid's row actions.</param>
    /// <param name="label">The button's accessible name and tooltip, and the menu entry's text.</param>
    /// <param name="icon">The button's icon, one of the row keys of <see cref="CanopyActionIcons"/>; none draws a check mark.</param>
    /// <exception cref="ArgumentException">The identifier is invalid or the label is blank or longer than 200 characters.</exception>
    public CanopyRowAction(string id, string label, Icon icon = default) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Label = Text(label, 200, nameof(label));
        Icon = icon;
    }

    /// <summary>Gets the identifier sent to the host.</summary>
    public string Id { get; }

    /// <summary>Gets the button's accessible name and the menu entry's text.</summary>
    public string Label { get; }

    /// <summary>
    /// Gets or sets the icon: <see cref="CanopyActionIcons.Check"/>, <c>Play</c>, <c>Pause</c>, <c>Stop</c>, <c>Retry</c>,
    /// <c>Edit</c>, <c>Delete</c>, <c>Copy</c>, <c>Open</c>, <c>Close</c> or <c>Download</c>; none draws a check mark.
    /// </summary>
    public Icon Icon { get; set; }

    /// <summary>
    /// Gets or sets the colour of the button: <see cref="Tone.None"/> or <see cref="Tone.Neutral"/> for the quiet default,
    /// <see cref="Tone.Danger"/> for an action that removes or stops something, or <see cref="PrimaryTone"/> for the row's
    /// main action.
    /// </summary>
    public Tone Tone { get; set; }

    /// <summary>The named tone that paints a row action in the accent colour, for the row's main action.</summary>
    public static Tone PrimaryTone { get; } = Tone.Named("primary");

    /// <summary>Gets or sets the rows that offer the action; null offers it on every row that is not locked.</summary>
    public CanopyFormatCondition? When { get; set; }

    /// <summary>Gets or sets the rows on which the action shows but cannot run; null leaves it enabled.</summary>
    public CanopyFormatCondition? DisabledWhen { get; set; }

    /// <summary>Gets or sets why the action is disabled, the description of its button on those rows (at most 500 characters).</summary>
    public string? DisabledReason {
        get => _disabledReason;
        set => _disabledReason = value == null ? null : Text(value, 500, nameof(value));
    }

    /// <summary>Gets or sets whether the grid reads its rows again after the host accepts the action.</summary>
    public bool Refresh { get; set; }

    private static string Text(string value, int max, string name) {
        if (string.IsNullOrWhiteSpace(value) || value.Length > max) throw new ArgumentException("Row action text needs visible text of at most " + max + " characters.", name);
        return value;
    }

    internal void Validate(IDictionary<string, CanopyColumn> columns) {
        if (!Icon.IsEmpty && !CanopyActionIcons.RowKeys.Contains(Icon.Key)) throw new InvalidOperationException("Row action '" + Id + "' has icon '" + Icon.Key + "', which row actions do not draw; use a row key of CanopyActionIcons.");
        if (Tone != Tone.None && Tone != Tone.Neutral && Tone != Tone.Danger && Tone != PrimaryTone)
            throw new InvalidOperationException("Row action '" + Id + "' has tone '" + Tone.Name + "'; a row action is neutral, Tone.Danger or CanopyRowAction.PrimaryTone.");
        CanopyRowActions.ValidateCondition(When, columns);
        CanopyRowActions.ValidateCondition(DisabledWhen, columns);
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("label", Label);
        if (!Icon.IsEmpty && Icon.Key != "check") writer.Property("icon", Icon.Key);
        if (Tone != Tone.None && Tone != Tone.Neutral) writer.Property("tone", Tone.Name);
        if (When != null) { writer.Name("when"); When.WriteJson(writer); }
        if (DisabledWhen != null) { writer.Name("disabledWhen"); DisabledWhen.WriteJson(writer); }
        writer.OptionalProperty("disabledReason", DisabledReason);
        if (Refresh) writer.Property("refresh", true);
        writer.EndObject();
    }
}
