using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A titled group of fields inside a flow step (<see cref="CanopyFlowStep.Sections"/>), drawn with the record panel's label and
/// value layout, with an optional condition of its own.
/// </summary>
public sealed class CanopyFlowSection : CanopyFlowFieldContainer<CanopyFlowSection> {
    /// <summary>Creates a section.</summary>
    /// <param name="id">The id, unique among the flow's sections: a letter, then up to 63 letters, digits, hyphens and underscores.</param>
    /// <param name="label">The heading: plain text of at most 200 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlowSection(string id, string label) {
        Id = CanopyFlowValues.RequireIdentifier(id, nameof(id), "A section id");
        Label = label;
    }

    /// <summary>Gets the section's id.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the heading. Plain text of at most 200 characters.</summary>
    public string Label { get; set; }

    /// <summary>Gets or sets a line under the heading. Plain text of at most 1,000 characters.</summary>
    public string? Description { get; set; }

    /// <summary>Gets or sets the condition under which the section shows; null always shows it.</summary>
    public CanopyFlowCondition? Condition { get; set; }

    /// <summary>Sets the line under the heading (<see cref="Description"/>).</summary>
    /// <param name="text">Plain text.</param>
    /// <returns>The section.</returns>
    public CanopyFlowSection Describe(string text) { Description = text; return this; }

    /// <summary>Shows the section only while a condition holds (<see cref="Condition"/>).</summary>
    /// <param name="condition">The condition.</param>
    /// <returns>The section.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="condition"/> is null.</exception>
    public CanopyFlowSection When(CanopyFlowCondition condition) { Condition = condition ?? throw new ArgumentNullException(nameof(condition)); return this; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("label", Label).OptionalProperty("description", Description);
        if (Condition != null) {
            writer.Name("when");
            Condition.WriteJson(writer);
        }

        writer.Name("fields").BeginArray();
        foreach (var field in Fields) field.WriteJson(writer);
        writer.EndArray().EndObject();
    }

    internal static CanopyFlowSection Read(object? node) {
        var map = CanopyFlowContract.Object(node, "A section", "id", "label", "description", "when", "fields");
        var id = CanopyFlowContract.RequiredText(map, "id", "A section");
        if (!CanopyFlowValues.IsIdentifier(id)) throw new InvalidOperationException("A section has an invalid id.");
        var what = "Section " + id;
        var section = new CanopyFlowSection(id, CanopyFlowContract.RequiredText(map, "label", what)) { Description = CanopyFlowContract.Text(map, "description", what) };
        if (map.TryGetValue("when", out var when)) section.Condition = CanopyFlowCondition.Read(when, what + " (when)");
        foreach (var item in CanopyFlowContract.Items(map, "fields", what, CanopyFlow.MaxFields)) section.Fields.Add(CanopyFlowField.Read(item));
        return section;
    }
}