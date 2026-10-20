using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A typed confirmation on the review page (<see cref="CanopyFlowStep.Confirmation"/>) for destructive flows: submitting waits until
/// the reader types <see cref="Text"/>, or the answer of <see cref="FieldId"/>, exactly.
/// </summary>
public sealed class CanopyFlowConfirmation {
    /// <summary>Creates a confirmation.</summary>
    /// <param name="label">The label of the box, for example "Type the domain name to continue"; <c>{text}</c> stands for what to type.</param>
    public CanopyFlowConfirmation(string label) {
        Label = label;
    }

    /// <summary>Gets or sets the label of the box. Plain text of at most 200 characters; <c>{text}</c> stands for what to type.</summary>
    public string Label { get; set; }

    /// <summary>Gets or sets the text to type, or null when <see cref="FieldId"/> names the field that holds it. At most 200 characters.</summary>
    public string? Text { get; set; }

    /// <summary>Gets or sets the text, select, choice or lookup field whose answer the reader types; null when <see cref="Text"/> is set.</summary>
    public string? FieldId { get; set; }

    internal void Validate() {
        CanopyFlowValues.CheckShort(Label, "The confirmation label", required: true);
        CanopyFlowValues.CheckShort(Text, "The confirmation text");
        if ((Text == null) == (FieldId == null)) throw new InvalidOperationException("A confirmation names the text to type or the field that holds it, not both.");
    }

    internal void WriteJson(CanopyJsonWriter writer) =>
        writer.BeginObject().Property("label", Label).OptionalProperty("text", Text).OptionalProperty("field", FieldId).EndObject();

    internal static CanopyFlowConfirmation Read(object? node) {
        const string what = "The confirmation";
        var map = CanopyFlowContract.Object(node, what, "label", "text", "field");
        return new CanopyFlowConfirmation(CanopyFlowContract.RequiredText(map, "label", what)) { Text = CanopyFlowContract.Text(map, "text", what), FieldId = CanopyFlowContract.Text(map, "field", what) };
    }
}