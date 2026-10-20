using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// One option of a select, choice, multiple-choice or lookup field (<see cref="CanopyFlowField.Options"/>): a value and the
/// texts that present it. Choice cards show the label, description, badge and disabled reason; multiple choice groups options
/// by <see cref="Group"/>.
/// </summary>
public sealed class CanopyFlowOption {
    private object _value;

    /// <summary>Creates an option.</summary>
    /// <param name="value">The value: text, a number or true or false.</param>
    /// <param name="label">The text the reader sees, or null to show the value.</param>
    /// <exception cref="ArgumentException"><paramref name="value"/> is not text, a finite number within the safe integer magnitude, or a boolean.</exception>
    public CanopyFlowOption(object value, string? label = null) {
        _value = Scalar(value, nameof(value));
        Label = label;
    }

    /// <summary>Gets or sets the value the answer holds: text, a number (kept as a double) or true or false.</summary>
    /// <exception cref="ArgumentException">The value is not text, a finite number within the safe integer magnitude, or a boolean.</exception>
    public object Value {
        get => _value;
        set => _value = Scalar(value, nameof(value));
    }

    /// <summary>Gets or sets the text the reader sees; null shows the value. Plain text of at most 200 characters.</summary>
    public string? Label { get; set; }

    /// <summary>Gets or sets a line under the label (choice cards and suggestions). Plain text of at most 1,000 characters.</summary>
    public string? Description { get; set; }

    /// <summary>Gets or sets a short badge on a choice card, for example "Recommended". Plain text of at most 40 characters.</summary>
    public string? Badge { get; set; }

    /// <summary>Gets or sets why the option cannot be chosen; an option with a reason is shown disabled. Plain text of at most 400 characters.</summary>
    public string? DisabledReason { get; set; }

    /// <summary>Gets or sets the heading a multiple-choice field groups the option under. Plain text of at most 200 characters.</summary>
    public string? Group { get; set; }

    private static object Scalar(object value, string name) =>
        CanopyFlowValues.TryScalar(value, out var scalar) ? scalar : throw new ArgumentException("An option value is text, a finite number within the safe integer magnitude, or true or false.", name);

    internal void Validate(string field) {
        var what = "An option of field " + field;
        CanopyFlowValues.CheckShort(Label, what + " (label)");
        CanopyFlowValues.CheckLong(Description, what + " (description)");
        CanopyFlowValues.CheckText(Badge, what + " (badge)", 40);
        CanopyFlowValues.CheckText(DisabledReason, what + " (disabled reason)", 400);
        CanopyFlowValues.CheckShort(Group, what + " (group)");
        if (_value is string text && text.Length > CanopyFlowValues.MaxConditionText) throw new InvalidOperationException(what + " has a value longer than 4096 characters.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("value");
        CanopyFlowValues.Write(writer, _value);
        writer.OptionalProperty("label", Label).OptionalProperty("description", Description).OptionalProperty("badge", Badge)
            .OptionalProperty("disabledReason", DisabledReason).OptionalProperty("group", Group);
        writer.EndObject();
    }
}
