using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// One step of a flow (<see cref="CanopyFlow.Steps"/>): a form with fields and sections, a page of text, or the review page.
/// Branching is ordered steps with conditions: a step shows only while its <see cref="Condition"/> holds.
/// </summary>
public sealed class CanopyFlowStep : CanopyFlowFieldContainer<CanopyFlowStep> {
    /// <summary>Creates a form step.</summary>
    /// <param name="id">The id, unique among the flow's steps: a letter, then up to 63 letters, digits, hyphens and underscores.</param>
    /// <param name="title">The title, a question or a noun ("Which server sends the mail?"), never "Step 3". Only a review step may leave it null for the translated default.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlowStep(string id, string? title) {
        Id = CanopyFlowValues.RequireIdentifier(id, nameof(id), "A step id");
        Title = title;
    }

    /// <summary>Gets the step's id.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the title. Plain text of at most 200 characters; null only on a review step.</summary>
    public string? Title { get; set; }

    /// <summary>Gets or sets a line under the title. Plain text of at most 1,000 characters.</summary>
    public string? Description { get; set; }

    /// <summary>Gets or sets what the step holds.</summary>
    public CanopyFlowStepKind Kind { get; set; }

    /// <summary>Gets the step's sections, after its own fields.</summary>
    public IList<CanopyFlowSection> Sections { get; } = new List<CanopyFlowSection>();

    /// <summary>Gets or sets the condition under which the step shows; null always shows it. A review step always shows.</summary>
    public CanopyFlowCondition? Condition { get; set; }

    /// <summary>Gets or sets whether the rail marks the step optional. Its fields still follow their own required setting.</summary>
    public bool IsOptional { get; set; }

    /// <summary>Gets or sets the text above the submit button of a review step. Plain text of at most 1,000 characters.</summary>
    public string? DeclarationText { get; set; }

    /// <summary>Gets or sets whether a review step in edit mode shows only the changed answers first; null shows only the changes.</summary>
    public bool? ShowChangesOnly { get; set; }

    /// <summary>Shows the step only while a condition holds (<see cref="Condition"/>).</summary>
    /// <param name="condition">The condition.</param>
    /// <returns>The step.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="condition"/> is null.</exception>
    public CanopyFlowStep When(CanopyFlowCondition condition) { Condition = condition ?? throw new ArgumentNullException(nameof(condition)); return this; }

    /// <summary>Marks the step optional in the rail (<see cref="IsOptional"/>).</summary>
    /// <returns>The step.</returns>
    public CanopyFlowStep Optional() { IsOptional = true; return this; }

    /// <summary>Sets the line under the title (<see cref="Description"/>).</summary>
    /// <param name="text">Plain text.</param>
    /// <returns>The step.</returns>
    public CanopyFlowStep Describe(string text) { Description = text; return this; }

    /// <summary>Sets the text above a review step's submit button (<see cref="DeclarationText"/>).</summary>
    /// <param name="text">Plain text, for example "The settings apply to new messages."</param>
    /// <returns>The step.</returns>
    public CanopyFlowStep Declaration(string text) { DeclarationText = text; return this; }

    /// <summary>Sets whether a review step in edit mode shows only the changed answers first (<see cref="ShowChangesOnly"/>).</summary>
    /// <param name="changesOnly">Whether only the changes show first.</param>
    /// <returns>The step.</returns>
    public CanopyFlowStep ChangesOnly(bool changesOnly = true) { ShowChangesOnly = changesOnly; return this; }

    /// <summary>Adds a section of fields.</summary>
    /// <param name="id">The section id, unique among the flow's sections.</param>
    /// <param name="label">The heading.</param>
    /// <param name="configure">Adds the section's fields and sets its other settings.</param>
    /// <returns>The step.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="configure"/> is null.</exception>
    public CanopyFlowStep Section(string id, string label, Action<CanopyFlowSection> configure) {
        if (configure == null) throw new ArgumentNullException(nameof(configure));
        var section = new CanopyFlowSection(id, label);
        configure(section);
        Sections.Add(section);
        return this;
    }

    /// <summary>Every field of the step: its own, then each section's, with the section that holds it.</summary>
    internal IEnumerable<(CanopyFlowField Field, CanopyFlowSection? Section)> AllFields() {
        foreach (var field in Fields) yield return (field, null);
        foreach (var section in Sections) {
            if (section == null) continue;
            foreach (var field in section.Fields) yield return (field, section);
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id);
        if (Kind != CanopyFlowStepKind.Form) writer.Property("type", Kind == CanopyFlowStepKind.Info ? "info" : "review");
        writer.OptionalProperty("title", Title).OptionalProperty("description", Description);
        if (IsOptional) writer.Property("optional", true);
        if (Condition != null) {
            writer.Name("when");
            Condition.WriteJson(writer);
        }

        if (Fields.Count > 0) {
            writer.Name("fields").BeginArray();
            foreach (var field in Fields) field.WriteJson(writer);
            writer.EndArray();
        }

        if (Sections.Count > 0) {
            writer.Name("sections").BeginArray();
            foreach (var section in Sections) section.WriteJson(writer);
            writer.EndArray();
        }

        writer.OptionalProperty("declaration", DeclarationText);
        if (ShowChangesOnly.HasValue) writer.Property("changesOnly", ShowChangesOnly.Value);
        writer.EndObject();
    }

    internal static CanopyFlowStep Read(object? node) {
        var map = CanopyFlowContract.Object(node, "A step", "id", "type", "title", "description", "optional", "when", "fields", "sections", "declaration", "changesOnly");
        var id = CanopyFlowContract.RequiredText(map, "id", "A step");
        if (!CanopyFlowValues.IsIdentifier(id)) throw new InvalidOperationException("A step has an invalid id.");
        var what = "Step " + id;
        var step = new CanopyFlowStep(id, CanopyFlowContract.Text(map, "title", what)) {
            Description = CanopyFlowContract.Text(map, "description", what),
            IsOptional = CanopyFlowContract.Boolean(map, "optional", what) ?? false,
            DeclarationText = CanopyFlowContract.Text(map, "declaration", what),
            ShowChangesOnly = CanopyFlowContract.Boolean(map, "changesOnly", what)
        };
        var type = CanopyFlowContract.Text(map, "type", what);
        if (type != null) step.Kind = CanopyFlowContract.Choose(type, what, "type", ("form", CanopyFlowStepKind.Form), ("info", CanopyFlowStepKind.Info), ("review", CanopyFlowStepKind.Review));
        if (map.TryGetValue("when", out var when)) step.Condition = CanopyFlowCondition.Read(when, what + " (when)");
        foreach (var item in CanopyFlowContract.Items(map, "fields", what, CanopyFlow.MaxFields)) step.Fields.Add(CanopyFlowField.Read(item));
        foreach (var item in CanopyFlowContract.Items(map, "sections", what, CanopyFlow.MaxSteps)) step.Sections.Add(CanopyFlowSection.Read(item));
        return step;
    }
}