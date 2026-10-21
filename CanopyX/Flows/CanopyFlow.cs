using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A guided form: steps with typed fields, conditions, validation and a review page, written as the flow document
/// (<c>{ "kind": "flow", "version": 1 }</c>) that the browser's flow entry point renders. CanopyX never writes: on submit the
/// browser raises <c>canopyx:flowSubmit</c> with the visible answers, and the host applies the change (see docs/flow.md).
/// </summary>
/// <remarks>
/// <para>
/// Build a flow with its properties or the fluent helpers: <see cref="Step"/>, <see cref="Info"/> and <see cref="Review"/>
/// append steps, and each step adds its fields with methods such as <see cref="CanopyFlowFieldContainer{TContainer}.Text"/>.
/// The whole document is checked when it is written (<see cref="Validate"/>, <see cref="ToContract"/> and the HTML writers),
/// and <see cref="FromContract"/> reads a document back with the same checks.
/// </para>
/// <para>
/// In create mode fields start from their defaults. A flow that edits existing settings carries their current values in
/// <see cref="Initial"/>, the secret fields that already hold a value in <see cref="StoredSecrets"/> (never the values) and the
/// host's revision in <see cref="Baseline"/>.
/// </para>
/// </remarks>
public sealed class CanopyFlow {
    /// <summary>The most steps a flow holds.</summary>
    public const int MaxSteps = 64;

    /// <summary>The most fields a flow holds across its steps and sections.</summary>
    public const int MaxFields = 1000;

    /// <summary>Creates a flow.</summary>
    /// <param name="id">The flow's id: a letter, then up to 63 letters, digits, hyphens and underscores.</param>
    /// <param name="title">The flow's heading: plain text of at most 200 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlow(string id, string title) {
        Id = CanopyFlowValues.RequireIdentifier(id, nameof(id), "A flow id");
        Title = title;
    }

    /// <summary>Gets the flow's id, which the proposal names.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the flow's heading. Plain text of at most 200 characters.</summary>
    public string Title { get; set; }

    /// <summary>Gets or sets a line under the heading. Plain text of at most 1,000 characters.</summary>
    public string? Description { get; set; }

    /// <summary>Gets or sets how the flow opens its steps.</summary>
    public CanopyFlowMode Mode { get; set; }

    /// <summary>Gets or sets the stepper the flow draws. Narrow hosts (below 640 pixels) stack the steps, and a flow with one visible step shows no rail.</summary>
    public CanopyFlowOrientation Orientation { get; set; }

    /// <summary>Gets or sets the spacing of the form, as the grid densities; null uses the normal spacing.</summary>
    public CanopyGridDensity? Density { get; set; }

    /// <summary>Gets or sets the zone date-and-time fields show and enter.</summary>
    public CanopyTimeZone TimeZone { get; set; }

    /// <summary>Gets the steps, in order: 1 to 64, with a review step, when present, last.</summary>
    public IList<CanopyFlowStep> Steps { get; } = new List<CanopyFlowStep>();

    /// <summary>
    /// Gets or sets whether to preserve edit mode when <see cref="Initial"/> is empty. Reading a document with an
    /// <c>initial</c> property sets this to true. Non-empty <see cref="Initial"/> or <see cref="StoredSecrets"/>, or a
    /// <see cref="Baseline"/>, also enable edit mode when this is false.
    /// </summary>
    public bool IsEditMode { get; set; }

    /// <summary>
    /// Gets the values an edit-mode flow edits, by field id, as <see cref="CanopyFlowField.DefaultValue"/> takes them; empty in
    /// create mode or when <see cref="IsEditMode"/>, <see cref="StoredSecrets"/> or <see cref="Baseline"/> identifies an edit
    /// with no non-secret initial values.
    /// Secret fields never have one: list them in <see cref="StoredSecrets"/>.
    /// </summary>
    public IDictionary<string, object?> Initial { get; } = new Dictionary<string, object?>(StringComparer.Ordinal);

    /// <summary>Gets the ids of secret fields that already hold a stored value. Never the values.</summary>
    public ISet<string> StoredSecrets { get; } = new SortedSet<string>(StringComparer.Ordinal);

    /// <summary>Gets or sets the host's revision of the edited settings, which the proposal echoes. At most 256 characters.</summary>
    public string? Baseline { get; set; }

    /// <summary>Gets or sets the submit button's settings; null uses the translated default text.</summary>
    public CanopyFlowSubmit? Submit { get; set; }

    /// <summary>Gets or sets where the flow opens: in the page, or in a dialog or drawer a launch button opens.</summary>
    public CanopyFlowContainer Container { get; set; }

    /// <summary>Gets or sets the launch button's text of a dialog or drawer flow; null uses the flow's title. Plain text of at most 80 characters.</summary>
    public string? LaunchLabel { get; set; }

    /// <summary>Gets or sets the equivalent command the review page and the proposal show; null shows none.</summary>
    public CanopyFlowCommand? Command { get; set; }

    /// <summary>Gets the presets the reader can start from (at most 32).</summary>
    public IList<CanopyFlowPreset> Presets { get; } = new List<CanopyFlowPreset>();

    /// <summary>Gets or sets where the flow keeps its draft.</summary>
    public CanopyFlowDraftStore Draft { get; set; }

    /// <summary>Gets or sets whether the page's address names the open step (<c>#flow-id/step-id</c>), so a link opens that step.</summary>
    public bool DeepLinks { get; set; }

    /// <summary>Gets or sets the routes that answer the flow's hooks without script (CanopyX.AspNetCore's <c>MapCanopyFlow</c>); null uses none.</summary>
    public CanopyFlowEndpoint? Endpoint { get; set; }

    /// <summary>Appends a pick step over a flat grid: its selection is the answer of the step's one field.</summary>
    /// <param name="id">The step id, unique in the flow; the answer's field takes the same id unless <paramref name="configure"/> sets another label.</param>
    /// <param name="title">The step's title, a question such as "Which servers?"; the field takes it as its label.</param>
    /// <param name="view">The grid the reader picks from.</param>
    /// <param name="configure">Sets the label column, the tray and the field's settings (<see cref="CanopyFlowPicker.Field"/>), or null.</param>
    /// <returns>The flow.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    public CanopyFlow Pick(string id, string title, CanopyDataGridView view, Action<CanopyFlowPicker>? configure = null) =>
        AddPick(id, title, new CanopyFlowPicker(new CanopyFlowField(id, CanopyFlowFieldKind.Pick, title), view), configure);

    /// <summary>Appends a pick step over a tree: its selection is the answer of the step's one field.</summary>
    /// <param name="id">The step id, unique in the flow; the answer's field takes the same id.</param>
    /// <param name="title">The step's title; the field takes it as its label.</param>
    /// <param name="view">The tree the reader picks from.</param>
    /// <param name="configure">Sets the label column, the tray and the field's settings, or null.</param>
    /// <returns>The flow.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    public CanopyFlow Pick(string id, string title, CanopyTreeView view, Action<CanopyFlowPicker>? configure = null) =>
        AddPick(id, title, new CanopyFlowPicker(new CanopyFlowField(id, CanopyFlowFieldKind.Pick, title), view), configure);

    private CanopyFlow AddPick(string id, string title, CanopyFlowPicker picker, Action<CanopyFlowPicker>? configure) {
        configure?.Invoke(picker);
        Steps.Add(new CanopyFlowStep(id, title) { Kind = CanopyFlowStepKind.Pick, Picker = picker });
        return this;
    }

    /// <summary>Adds a preset the reader can start from (<see cref="Presets"/>).</summary>
    /// <param name="id">The preset id.</param>
    /// <param name="label">The name the reader picks.</param>
    /// <param name="configure">Sets the preset's answers.</param>
    /// <returns>The flow.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="configure"/> is null.</exception>
    public CanopyFlow Preset(string id, string label, Action<CanopyFlowPreset> configure) {
        if (configure == null) throw new ArgumentNullException(nameof(configure));
        var preset = new CanopyFlowPreset(id, label);
        configure(preset);
        Presets.Add(preset);
        return this;
    }

    /// <summary>Answers the flow's hooks with the routes CanopyX.AspNetCore's <c>MapCanopyFlow</c> serves (<see cref="Endpoint"/>).</summary>
    /// <param name="url">The route group's path, for example <c>/api/flows/mail</c>.</param>
    /// <param name="routes">The routes it serves.</param>
    /// <returns>The flow.</returns>
    public CanopyFlow UseEndpoint(string url, CanopyFlowRoutes routes) { Endpoint = new CanopyFlowEndpoint(url, routes); return this; }

    /// <summary>
    /// Writes the equivalent command of a set of answers with the browser's rules (see "The equivalent command" in docs/flow.md):
    /// visible, non-empty, changed answers by parameter name, secrets that were typed as <c>&lt;secret&gt;</c>.
    /// </summary>
    /// <param name="answers">The answers by field id, as <see cref="VisibleValues"/> takes them.</param>
    /// <param name="typedSecrets">The ids of secret fields that were typed, or null.</param>
    /// <returns>The command line, or null when the flow has no <see cref="Command"/>.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="answers"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The flow is not valid.</exception>
    public string? FormatCommand(IReadOnlyDictionary<string, object?> answers, IEnumerable<string>? typedSecrets = null) {
        if (answers == null) throw new ArgumentNullException(nameof(answers));
        Validate();
        return CanopyFlowCommandLine.Format(this, answers, typedSecrets);
    }

    /// <summary>
    /// Gets or sets the translations of the texts the flow writes itself. The document carries the flow labels and the shared
    /// form messages (<see cref="CanopyLabels.GridEditRequired"/> and the other field checks) that differ from English.
    /// </summary>
    public CanopyLabels? Labels { get; set; }

    /// <summary>Appends a form step.</summary>
    /// <param name="id">The step id, unique in the flow.</param>
    /// <param name="title">The title, a question or a noun.</param>
    /// <param name="configure">Adds the step's fields and sets its other settings, or null.</param>
    /// <returns>The flow.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlow Step(string id, string title, Action<CanopyFlowStep>? configure = null) {
        var step = new CanopyFlowStep(id, title);
        configure?.Invoke(step);
        Steps.Add(step);
        return this;
    }

    /// <summary>Appends a step of text only.</summary>
    /// <param name="id">The step id, unique in the flow.</param>
    /// <param name="title">The title.</param>
    /// <param name="description">The text under the title, or null.</param>
    /// <returns>The flow.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlow Info(string id, string title, string? description = null) {
        Steps.Add(new CanopyFlowStep(id, title) { Kind = CanopyFlowStepKind.Info, Description = description });
        return this;
    }

    /// <summary>Appends the review page, with the id <c>review</c> and the translated default title.</summary>
    /// <param name="configure">Sets the declaration, the changes-only default, a title or other settings, or null.</param>
    /// <returns>The flow.</returns>
    public CanopyFlow Review(Action<CanopyFlowStep>? configure = null) {
        var step = new CanopyFlowStep("review", null) { Kind = CanopyFlowStepKind.Review };
        configure?.Invoke(step);
        Steps.Add(step);
        return this;
    }

    /// <summary>Checks the whole flow as the writers do.</summary>
    /// <exception cref="InvalidOperationException">The flow is not valid; the message names the first problem.</exception>
    public void Validate() => CanopyFlowValidator.Validate(this);

    /// <summary>
    /// Returns the answers the proposal would carry: the answers of visible fields only, without secrets. Conditions read a
    /// hidden field as empty, so a field whose condition depends on a hidden answer follows that answer's emptiness.
    /// </summary>
    /// <param name="answers">The answers by field id, as <see cref="CanopyFlowCondition.Evaluate"/> takes them.</param>
    /// <returns>The answers of the visible, non-secret fields that <paramref name="answers"/> holds, in field order.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="answers"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The flow is not valid.</exception>
    public IReadOnlyDictionary<string, object?> VisibleValues(IReadOnlyDictionary<string, object?> answers) {
        if (answers == null) throw new ArgumentNullException(nameof(answers));
        Validate();
        return CanopyFlowValidator.VisibleValues(this, answers);
    }

    /// <summary>Writes the flow document as compact JSON.</summary>
    /// <returns>The document.</returns>
    /// <exception cref="InvalidOperationException">The flow is not valid.</exception>
    public string ToContract() {
        Validate();
        var writer = new CanopyJsonWriter(1024);
        WriteJson(writer);
        return writer.ToString();
    }

    /// <summary>Reads a flow document.</summary>
    /// <param name="json">The document, as <see cref="ToContract"/> writes it.</param>
    /// <returns>The flow.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="json"/> is null.</exception>
    /// <exception cref="FormatException">The text is not valid JSON, nests deeper than 64 levels or is longer than 4 MiB.</exception>
    /// <exception cref="InvalidOperationException">The document is not a valid flow: another kind or version, an unknown property, or any rule <see cref="Validate"/> checks.</exception>
    public static CanopyFlow FromContract(string json) {
        var flow = Read(CanopyJsonReader.Parse(json));
        flow.Validate();
        return flow;
    }

    private void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("kind", "flow").Property("version", 1).Property("id", Id).Property("title", Title).OptionalProperty("description", Description);
        if (Mode != CanopyFlowMode.Linear) writer.Property("mode", Mode == CanopyFlowMode.Free ? "free" : "tasks");
        if (Orientation != CanopyFlowOrientation.Auto || Container != CanopyFlowContainer.Inline) {
            writer.Name("layout").BeginObject();
            if (Orientation != CanopyFlowOrientation.Auto) writer.Property("orientation", Orientation == CanopyFlowOrientation.Horizontal ? "horizontal" : "vertical");
            if (Container != CanopyFlowContainer.Inline) writer.Property("container", Container == CanopyFlowContainer.Dialog ? "dialog" : "drawer").OptionalProperty("launch", LaunchLabel);
            writer.EndObject();
        }

        if (Density.HasValue) writer.Property("density", Density.Value == CanopyGridDensity.Compact ? "compact" : Density.Value == CanopyGridDensity.Comfortable ? "comfortable" : "normal");
        if (TimeZone == CanopyTimeZone.Local) writer.Property("timeZone", "local");
        writer.Name("steps").BeginArray();
        foreach (var step in Steps) step.WriteJson(writer);
        writer.EndArray();
        if (IsEditMode || Initial.Count > 0 || StoredSecrets.Count > 0 || Baseline != null) {
            writer.Name("initial").BeginObject();
            foreach (var field in CanopyFlowValidator.Fields(this)) {
                if (!Initial.TryGetValue(field.Id, out var value)) continue;
                writer.Name(field.Id);
                CanopyFlowValues.Write(writer, CanopyFlowValues.Canonical(field, value, "The initial value"));
            }

            writer.EndObject();
        }

        if (StoredSecrets.Count > 0) writer.StringArray("storedSecrets", new List<string>(StoredSecrets));
        writer.OptionalProperty("baseline", Baseline);
        if (Submit != null) writer.Name("submit").BeginObject().OptionalProperty("label", Submit.Label).EndObject();
        WriteHostSettings(writer);
        if (Labels != null && Labels.HasFlowLabels) {
            writer.Name("labels");
            Labels.WriteFlowJson(writer);
        }

        writer.EndObject();
    }

    private void WriteHostSettings(CanopyJsonWriter writer) {
        if (Command != null) {
            writer.Name("command");
            Command.WriteJson(writer);
        }

        if (Presets.Count > 0) {
            var fields = new Dictionary<string, CanopyFlowField>(StringComparer.Ordinal);
            foreach (var field in CanopyFlowValidator.Fields(this)) fields[field.Id] = field;
            writer.Name("presets").BeginArray();
            foreach (var preset in Presets) preset.WriteJson(writer, fields);
            writer.EndArray();
        }

        if (Draft != CanopyFlowDraftStore.None) writer.Property("draft", Draft == CanopyFlowDraftStore.Session ? "session" : Draft == CanopyFlowDraftStore.Local ? "local" : "host");
        if (DeepLinks) writer.Property("deepLinks", true);
        if (Endpoint != null) {
            writer.Name("endpoint");
            Endpoint.WriteJson(writer);
        }
    }

    private static void ReadHostSettings(Dictionary<string, object?> map, CanopyFlow flow, string what) {
        if (map.TryGetValue("command", out var command)) flow.Command = CanopyFlowCommand.Read(command);
        foreach (var item in CanopyFlowContract.Items(map, "presets", what, 32)) flow.Presets.Add(CanopyFlowPreset.Read(item));
        var draft = CanopyFlowContract.Text(map, "draft", what);
        if (draft != null) flow.Draft = CanopyFlowContract.Choose(draft, what, "draft", ("none", CanopyFlowDraftStore.None), ("session", CanopyFlowDraftStore.Session), ("local", CanopyFlowDraftStore.Local), ("host", CanopyFlowDraftStore.Host));
        flow.DeepLinks = CanopyFlowContract.Boolean(map, "deepLinks", what) ?? false;
        if (map.TryGetValue("endpoint", out var endpoint)) flow.Endpoint = CanopyFlowEndpoint.Read(endpoint);
    }

    private static CanopyFlow Read(object? node) {
        const string what = "The flow document";
        var map = CanopyFlowContract.Object(node, what, "kind", "version", "id", "title", "description", "mode", "layout", "density", "timeZone",
            "steps", "initial", "storedSecrets", "baseline", "submit", "labels", "command", "presets", "draft", "deepLinks", "endpoint");
        if (CanopyFlowContract.Text(map, "kind", what) != "flow" || !(map.TryGetValue("version", out var version) && version is long number && number == 1))
            throw new InvalidOperationException(what + " must have kind \"flow\" and version 1.");
        var id = CanopyFlowContract.RequiredText(map, "id", what);
        if (!CanopyFlowValues.IsIdentifier(id)) throw new InvalidOperationException(what + " has an invalid id.");
        var flow = new CanopyFlow(id, CanopyFlowContract.RequiredText(map, "title", what)) {
            Description = CanopyFlowContract.Text(map, "description", what),
            Baseline = CanopyFlowContract.Text(map, "baseline", what)
        };
        var mode = CanopyFlowContract.Text(map, "mode", what);
        if (mode != null) flow.Mode = CanopyFlowContract.Choose(mode, what, "mode", ("linear", CanopyFlowMode.Linear), ("free", CanopyFlowMode.Free), ("tasks", CanopyFlowMode.Tasks));
        if (map.TryGetValue("layout", out var layout)) {
            var layoutMap = CanopyFlowContract.Object(layout, what + " (layout)", "orientation", "container", "launch");
            var orientation = CanopyFlowContract.Text(layoutMap, "orientation", what);
            if (orientation != null) flow.Orientation = CanopyFlowContract.Choose(orientation, what, "orientation", ("auto", CanopyFlowOrientation.Auto), ("horizontal", CanopyFlowOrientation.Horizontal), ("vertical", CanopyFlowOrientation.Vertical));
            var container = CanopyFlowContract.Text(layoutMap, "container", what);
            if (container != null) flow.Container = CanopyFlowContract.Choose(container, what, "container", ("inline", CanopyFlowContainer.Inline), ("dialog", CanopyFlowContainer.Dialog), ("drawer", CanopyFlowContainer.Drawer));
            flow.LaunchLabel = CanopyFlowContract.Text(layoutMap, "launch", what);
        }

        ReadHostSettings(map, flow, what);

        var density = CanopyFlowContract.Text(map, "density", what);
        if (density != null) flow.Density = CanopyFlowContract.Choose(density, what, "density", ("compact", CanopyGridDensity.Compact), ("normal", CanopyGridDensity.Default), ("comfortable", CanopyGridDensity.Comfortable));
        var zone = CanopyFlowContract.Text(map, "timeZone", what);
        if (zone != null) flow.TimeZone = CanopyFlowContract.Choose(zone, what, "timeZone", ("utc", CanopyTimeZone.Utc), ("local", CanopyTimeZone.Local));
        if (!map.ContainsKey("steps")) throw new InvalidOperationException(what + " needs 'steps'.");
        foreach (var item in CanopyFlowContract.Items(map, "steps", what, MaxSteps)) flow.Steps.Add(CanopyFlowStep.Read(item));
        if (map.TryGetValue("initial", out var initial)) {
            if (!(initial is Dictionary<string, object?> values)) throw new InvalidOperationException(what + " needs an object in 'initial'.");
            flow.IsEditMode = true;
            foreach (var entry in values) flow.Initial[entry.Key] = entry.Value;
        }

        foreach (var item in CanopyFlowContract.Items(map, "storedSecrets", what, MaxFields)) {
            if (!(item is string secret) || !flow.StoredSecrets.Add(secret)) throw new InvalidOperationException(what + " lists a stored secret that is not a field id, or lists one twice.");
        }

        if (map.TryGetValue("submit", out var submit)) {
            var submitMap = CanopyFlowContract.Object(submit, what + " (submit)", "label");
            flow.Submit = new CanopyFlowSubmit(CanopyFlowContract.Text(submitMap, "label", what));
        }

        if (map.TryGetValue("labels", out var labels)) flow.Labels = ReadLabels(labels);
        return flow;
    }

    private static CanopyLabels? ReadLabels(object? node) {
        if (!(node is Dictionary<string, object?> map)) throw new InvalidOperationException("The flow document needs an object in 'labels'.");
        if (map.Count == 0) return null;
        var labels = new CanopyLabels();
        foreach (var entry in map) {
            if (!(entry.Value is string text)) throw new InvalidOperationException("The flow label '" + entry.Key + "' needs text.");
            try {
                if (!labels.SetFlowLabel(entry.Key, text)) throw new InvalidOperationException("The flow document has the unknown label '" + entry.Key + "'.");
            } catch (ArgumentException error) {
                throw new InvalidOperationException(error.Message, error);
            }
        }

        return labels;
    }
}
