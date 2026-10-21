using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// An acknowledgement on the review page (<see cref="CanopyFlowStep.Acknowledgement"/>): a check box the reader must tick before
/// submitting, shown only while its <see cref="Condition"/> holds ("I understand the listener is not encrypted").
/// </summary>
public sealed class CanopyFlowAcknowledgement {
    /// <summary>Creates an acknowledgement.</summary>
    /// <param name="label">What the reader confirms: plain text of at most 400 characters.</param>
    /// <param name="condition">When it shows, or null for always.</param>
    public CanopyFlowAcknowledgement(string label, CanopyFlowCondition? condition = null) {
        Label = label;
        Condition = condition;
    }

    /// <summary>Gets or sets what the reader confirms. Plain text of at most 400 characters.</summary>
    public string Label { get; set; }

    /// <summary>Gets or sets when the acknowledgement shows; null always shows it.</summary>
    public CanopyFlowCondition? Condition { get; set; }

    internal void Validate() => CanopyFlowValues.CheckText(Label ?? throw new InvalidOperationException("An acknowledgement needs a label."), "The acknowledgement label", 400);

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("label", Label);
        if (Condition != null) {
            writer.Name("when");
            Condition.WriteJson(writer);
        }

        writer.EndObject();
    }

    internal static CanopyFlowAcknowledgement Read(object? node) {
        const string what = "The acknowledgement";
        var map = CanopyFlowContract.Object(node, what, "label", "when");
        return new CanopyFlowAcknowledgement(CanopyFlowContract.RequiredText(map, "label", what), map.TryGetValue("when", out var when) ? CanopyFlowCondition.Read(when, what + " (when)") : null);
    }
}