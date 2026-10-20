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

    /// <summary>Gets the server checks of a form step (at most 8): named host actions that test some of its answers.</summary>
    public IList<CanopyFlowCheck> Checks { get; } = new List<CanopyFlowCheck>();

    /// <summary>Gets or sets the group a task list shows the step under. Plain text of at most 200 characters.</summary>
    public string? GroupLabel { get; set; }

    /// <summary>Gets or sets the record picker of a pick step (<see cref="CanopyFlowStepKind.Pick"/>).</summary>
    public CanopyFlowPicker? Picker { get; set; }

    /// <summary>Gets or sets the typed confirmation of a review step.</summary>
    public CanopyFlowConfirmation? Confirmation { get; set; }

    /// <summary>Gets or sets the acknowledgement of a review step.</summary>
    public CanopyFlowAcknowledgement? Acknowledgement { get; set; }

    /// <summary>
    /// Gets or sets whether a review step shows the host's preview of what submitting does (the <c>preview</c> hook or an
    /// endpoint's route), so a page written as one file carries the preview part.
    /// </summary>
    public bool ShowsPreview { get; set; }

    /// <summary>Shows the host's preview on a review step (<see cref="ShowsPreview"/>).</summary>
    /// <returns>The step.</returns>
    public CanopyFlowStep Preview() { ShowsPreview = true; return this; }

    /// <summary>Adds a server check to a form step (<see cref="Checks"/>).</summary>
    /// <param name="id">The check id, unique among the flow's checks.</param>
    /// <param name="label">The button's text.</param>
    /// <param name="configure">Names the fields it tests and sets its requirement.</param>
    /// <returns>The step.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlowStep Check(string id, string label, Action<CanopyFlowCheck>? configure = null) {
        var check = new CanopyFlowCheck(id, label);
        configure?.Invoke(check);
        Checks.Add(check);
        return this;
    }

    /// <summary>Sets the group a task list shows the step under (<see cref="GroupLabel"/>).</summary>
    /// <param name="label">Plain text.</param>
    /// <returns>The step.</returns>
    public CanopyFlowStep Group(string label) { GroupLabel = label; return this; }

    /// <summary>Asks the reader to type a text before submitting (<see cref="Confirmation"/>).</summary>
    /// <param name="label">The label of the box; <c>{text}</c> stands for what to type.</param>
    /// <param name="text">The text to type.</param>
    /// <returns>The step.</returns>
    public CanopyFlowStep Confirm(string label, string text) { Confirmation = new CanopyFlowConfirmation(label) { Text = text }; return this; }

    /// <summary>Asks the reader to type a field's answer before submitting (<see cref="Confirmation"/>), such as the domain they act on.</summary>
    /// <param name="label">The label of the box; <c>{text}</c> stands for what to type.</param>
    /// <param name="fieldId">The text, select, choice or lookup field whose answer the reader types.</param>
    /// <returns>The step.</returns>
    public CanopyFlowStep ConfirmField(string label, string fieldId) { Confirmation = new CanopyFlowConfirmation(label) { FieldId = fieldId }; return this; }

    /// <summary>Asks the reader to tick an acknowledgement before submitting, shown while a condition holds (<see cref="Acknowledgement"/>).</summary>
    /// <param name="label">What the reader confirms.</param>
    /// <param name="condition">When it shows, or null for always.</param>
    /// <returns>The step.</returns>
    public CanopyFlowStep Acknowledge(string label, CanopyFlowCondition? condition = null) { Acknowledgement = new CanopyFlowAcknowledgement(label, condition); return this; }

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
        if (Picker != null) yield return (Picker.Field, null);
        foreach (var field in Fields) yield return (field, null);
        foreach (var section in Sections) {
            if (section == null) continue;
            foreach (var field in section.Fields) yield return (field, section);
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id);
        if (Kind != CanopyFlowStepKind.Form) writer.Property("type", Kind == CanopyFlowStepKind.Info ? "info" : Kind == CanopyFlowStepKind.Pick ? "pick" : "review");
        writer.OptionalProperty("title", Title).OptionalProperty("description", Description).OptionalProperty("group", GroupLabel);
        if (IsOptional) writer.Property("optional", true);
        if (Picker != null) {
            writer.Name("pick");
            Picker.WriteJson(writer);
        }

        if (Checks.Count > 0) {
            writer.Name("checks").BeginArray();
            foreach (var check in Checks) check.WriteJson(writer);
            writer.EndArray();
        }
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
        if (ShowsPreview) writer.Property("preview", true);
        if (Confirmation != null) {
            writer.Name("confirm");
            Confirmation.WriteJson(writer);
        }

        if (Acknowledgement != null) {
            writer.Name("acknowledge");
            Acknowledgement.WriteJson(writer);
        }

        writer.EndObject();
    }

    internal static CanopyFlowStep Read(object? node) {
        var map = CanopyFlowContract.Object(node, "A step", "id", "type", "title", "description", "optional", "when", "fields", "sections", "declaration", "changesOnly",
            "checks", "group", "pick", "confirm", "acknowledge", "preview");
        var id = CanopyFlowContract.RequiredText(map, "id", "A step");
        if (!CanopyFlowValues.IsIdentifier(id)) throw new InvalidOperationException("A step has an invalid id.");
        var what = "Step " + id;
        var step = new CanopyFlowStep(id, CanopyFlowContract.Text(map, "title", what)) {
            Description = CanopyFlowContract.Text(map, "description", what),
            IsOptional = CanopyFlowContract.Boolean(map, "optional", what) ?? false,
            DeclarationText = CanopyFlowContract.Text(map, "declaration", what),
            ShowChangesOnly = CanopyFlowContract.Boolean(map, "changesOnly", what),
            GroupLabel = CanopyFlowContract.Text(map, "group", what),
            ShowsPreview = CanopyFlowContract.Boolean(map, "preview", what) ?? false
        };
        var type = CanopyFlowContract.Text(map, "type", what);
        if (type != null) step.Kind = CanopyFlowContract.Choose(type, what, "type", ("form", CanopyFlowStepKind.Form), ("info", CanopyFlowStepKind.Info), ("review", CanopyFlowStepKind.Review), ("pick", CanopyFlowStepKind.Pick));
        if (map.TryGetValue("pick", out var pick)) step.Picker = CanopyFlowPicker.Read(pick, what);
        foreach (var item in CanopyFlowContract.Items(map, "checks", what, 8)) step.Checks.Add(CanopyFlowCheck.Read(item, what));
        if (map.TryGetValue("confirm", out var confirm)) step.Confirmation = CanopyFlowConfirmation.Read(confirm);
        if (map.TryGetValue("acknowledge", out var acknowledge)) step.Acknowledgement = CanopyFlowAcknowledgement.Read(acknowledge);
        if (map.TryGetValue("when", out var when)) step.Condition = CanopyFlowCondition.Read(when, what + " (when)");
        foreach (var item in CanopyFlowContract.Items(map, "fields", what, CanopyFlow.MaxFields)) step.Fields.Add(CanopyFlowField.Read(item));
        foreach (var item in CanopyFlowContract.Items(map, "sections", what, CanopyFlow.MaxSteps)) step.Sections.Add(CanopyFlowSection.Read(item));
        return step;
    }
}