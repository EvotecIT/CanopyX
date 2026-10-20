using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A server check of a form step (<see cref="CanopyFlowStep.Checks"/>): a named host action such as "Test sign-in" or "Send a
/// test message" that tests some of the step's answers. The host runs it through the <c>check</c> hook or an endpoint, and answers
/// pass, warning or fail with a message and details; changing a field the check names marks its result stale.
/// </summary>
public sealed class CanopyFlowCheck {
    /// <summary>Creates a check.</summary>
    /// <param name="id">The id, unique among the flow's checks: a letter, then up to 63 letters, digits, hyphens and underscores.</param>
    /// <param name="label">The button's text, for example "Send a test message": plain text of at most 200 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlowCheck(string id, string label) {
        Id = CanopyFlowValues.RequireIdentifier(id, nameof(id), "A check id");
        Label = label;
    }

    /// <summary>Gets the check's id, which the host's hook receives.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the button's text. Plain text of at most 200 characters.</summary>
    public string Label { get; set; }

    /// <summary>Gets or sets a line under the button. Plain text of at most 1,000 characters.</summary>
    public string? Description { get; set; }

    /// <summary>Gets the ids of the fields the check tests (1 to 64); changing one marks its result stale. Secret fields among them reach the hook through its <c>secret(id)</c> reader.</summary>
    public IList<string> FieldIds { get; } = new List<string>();

    /// <summary>Gets or sets whether the check gates its step.</summary>
    public CanopyFlowCheckRequirement Requirement { get; set; }

    /// <summary>Adds the fields the check tests (<see cref="FieldIds"/>).</summary>
    /// <param name="ids">Field ids.</param>
    /// <returns>The check.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="ids"/> is null.</exception>
    public CanopyFlowCheck Fields(params string[] ids) {
        if (ids == null) throw new ArgumentNullException(nameof(ids));
        foreach (var id in ids) FieldIds.Add(id);
        return this;
    }

    /// <summary>Blocks Next until the check passes on the current answers (<see cref="CanopyFlowCheckRequirement.Pass"/>).</summary>
    /// <returns>The check.</returns>
    public CanopyFlowCheck RequirePass() { Requirement = CanopyFlowCheckRequirement.Pass; return this; }

    /// <summary>Requires the check to have run on the current answers without failing (<see cref="CanopyFlowCheckRequirement.Run"/>).</summary>
    /// <returns>The check.</returns>
    public CanopyFlowCheck RequireRun() { Requirement = CanopyFlowCheckRequirement.Run; return this; }

    /// <summary>Sets the line under the button (<see cref="Description"/>).</summary>
    /// <param name="text">Plain text.</param>
    /// <returns>The check.</returns>
    public CanopyFlowCheck Describe(string text) { Description = text; return this; }

    internal void Validate(string step) {
        var what = "Check " + Id + " of step " + step;
        CanopyFlowValues.CheckShort(Label, what + " (label)", required: true);
        CanopyFlowValues.CheckLong(Description, what + " (description)");
        if (!Enum.IsDefined(typeof(CanopyFlowCheckRequirement), Requirement)) throw new InvalidOperationException(what + " has an unknown requirement.");
        if (FieldIds.Count < 1 || FieldIds.Count > 64) throw new InvalidOperationException(what + " tests 1 to 64 fields.");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var id in FieldIds) if (id == null || !seen.Add(id)) throw new InvalidOperationException(what + " names a field twice or names none.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("label", Label).OptionalProperty("description", Description).StringArray("fields", FieldIds);
        if (Requirement != CanopyFlowCheckRequirement.None) writer.Property("required", Requirement == CanopyFlowCheckRequirement.Pass ? "pass" : "run");
        writer.EndObject();
    }

    internal static CanopyFlowCheck Read(object? node, string what) {
        var map = CanopyFlowContract.Object(node, what + " (check)", "id", "label", "description", "fields", "required");
        var id = CanopyFlowContract.RequiredText(map, "id", what);
        if (!CanopyFlowValues.IsIdentifier(id)) throw new InvalidOperationException(what + " has a check with an invalid id.");
        var check = new CanopyFlowCheck(id, CanopyFlowContract.RequiredText(map, "label", what)) { Description = CanopyFlowContract.Text(map, "description", what) };
        foreach (var item in CanopyFlowContract.Items(map, "fields", what, 64)) check.FieldIds.Add(item as string ?? throw new InvalidOperationException(what + " has a check field that is not text."));
        var required = CanopyFlowContract.Text(map, "required", what);
        if (required != null) check.Requirement = CanopyFlowContract.Choose(required, what, "required", ("pass", CanopyFlowCheckRequirement.Pass), ("run", CanopyFlowCheckRequirement.Run));
        return check;
    }
}