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
    /// <param name="icon">The button's icon.</param>
    /// <exception cref="ArgumentException">The identifier is invalid or the label is blank or longer than 200 characters.</exception>
    public CanopyRowAction(string id, string label, CanopyRowActionIcon icon = CanopyRowActionIcon.Check) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Label = Text(label, 200, nameof(label));
        Icon = icon;
    }

    /// <summary>Gets the identifier sent to the host.</summary>
    public string Id { get; }

    /// <summary>Gets the button's accessible name and the menu entry's text.</summary>
    public string Label { get; }

    /// <summary>Gets or sets the icon.</summary>
    public CanopyRowActionIcon Icon { get; set; }

    /// <summary>Gets or sets the colour of the button.</summary>
    public CanopyRowActionTone Tone { get; set; }

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
        if (!Enum.IsDefined(typeof(CanopyRowActionIcon), Icon)) throw new ArgumentOutOfRangeException(nameof(Icon), Icon, "Unknown row action icon.");
        if (!Enum.IsDefined(typeof(CanopyRowActionTone), Tone)) throw new ArgumentOutOfRangeException(nameof(Tone), Tone, "Unknown row action tone.");
        CanopyRowActions.ValidateCondition(When, columns);
        CanopyRowActions.ValidateCondition(DisabledWhen, columns);
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("label", Label);
        if (Icon != CanopyRowActionIcon.Check) writer.Property("icon", Icon.ToString().ToLowerInvariant());
        if (Tone != CanopyRowActionTone.Neutral) writer.Property("tone", Tone == CanopyRowActionTone.Primary ? "primary" : "danger");
        if (When != null) { writer.Name("when"); When.WriteJson(writer); }
        if (DisabledWhen != null) { writer.Name("disabledWhen"); DisabledWhen.WriteJson(writer); }
        writer.OptionalProperty("disabledReason", DisabledReason);
        if (Refresh) writer.Property("refresh", true);
        writer.EndObject();
    }
}
