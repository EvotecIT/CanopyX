using System;
using System.Collections;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX.Data;

/// <summary>
/// Reads a proposal against its flow (70-flow-submit.js on the server): the envelope, the answers of visible fields with host
/// sections loaded through <see cref="CanopyFlowReadOptions.SectionFields"/>, the secrets' states and values, every field's
/// checks, then the changes, the patch and the command, computed again from the answers.
/// </summary>
internal sealed class CanopyFlowSubmissionReader {
    private static readonly CanopyFlowFieldKind[] DynamicKinds = {
        CanopyFlowFieldKind.Text, CanopyFlowFieldKind.Number, CanopyFlowFieldKind.Date, CanopyFlowFieldKind.DateTime, CanopyFlowFieldKind.Time,
        CanopyFlowFieldKind.Select, CanopyFlowFieldKind.Toggle, CanopyFlowFieldKind.Lookup, CanopyFlowFieldKind.Choice, CanopyFlowFieldKind.MultiChoice,
        CanopyFlowFieldKind.TextArea, CanopyFlowFieldKind.List, CanopyFlowFieldKind.Duration
    };

    private readonly CanopyFlow _flow;
    private readonly CanopyFlowReadOptions _options;
    private readonly CanopyLabels _labels;
    private readonly Dictionary<string, Owner> _owners = new Dictionary<string, Owner>(StringComparer.Ordinal);
    private readonly List<Owner> _order = new List<Owner>();
    private readonly Dictionary<string, object?> _answers = new Dictionary<string, object?>(StringComparer.Ordinal);
    private readonly Dictionary<string, bool> _visible = new Dictionary<string, bool>(StringComparer.Ordinal);
    private readonly Dictionary<string, IEnumerable<CanopyFlowOption>?> _hostOptions = new Dictionary<string, IEnumerable<CanopyFlowOption>?>(StringComparer.Ordinal);

    private sealed class Owner {
        internal Owner(CanopyFlowField field, CanopyFlowSection? section, CanopyFlowStep step, bool dynamic) {
            Field = field;
            Section = section;
            Step = step;
            Dynamic = dynamic;
        }

        internal CanopyFlowField Field { get; }

        internal CanopyFlowSection? Section { get; }

        internal CanopyFlowStep Step { get; }

        internal bool Dynamic { get; }
    }

    internal CanopyFlowSubmissionReader(CanopyFlow flow, CanopyFlowReadOptions? options) {
        flow.Validate();
        _flow = flow;
        _options = options ?? new CanopyFlowReadOptions();
        _labels = flow.Labels ?? new CanopyLabels();
        foreach (var step in flow.Steps) {
            foreach (var (field, section) in step.AllFields()) Add(new Owner(field, section, step, false));
        }
    }

    private void Add(Owner owner) {
        _owners[owner.Field.Id] = owner;
        _order.Add(owner);
    }

    private Dictionary<string, object?> _map = new Dictionary<string, object?>(StringComparer.Ordinal);
    private readonly List<KeyValuePair<string, object?>> _pending = new List<KeyValuePair<string, object?>>();

    /// <summary>Reads a proposal whose host sections' fields come from <see cref="CanopyFlowReadOptions.SectionFields"/>.</summary>
    internal CanopyFlowSubmission Read(object? node, Dictionary<string, string> secretValues, bool secretsTravel) {
        foreach (var (section, step, answers) in Begin(node)) {
            if (_options.SectionFields == null) throw new InvalidOperationException("Section " + section.Id + " takes its fields from the host: set CanopyFlowReadOptions.SectionFields.");
            AddHostFields(section, step, _options.SectionFields(section, answers));
        }

        return Finish(secretValues, secretsTravel);
    }

    /// <summary>Reads the envelope and the answers of the flow's own fields; returns the visible host sections whose fields the caller loads next.</summary>
    internal List<(CanopyFlowSection Section, CanopyFlowStep Step, IReadOnlyDictionary<string, object?> Answers)> Begin(object? node) {
        if (!(node is Dictionary<string, object?> map)) throw CanopyRequestException.Document("A proposal is a JSON object.");
        _map = map;
        foreach (var key in map.Keys) {
            if (Array.IndexOf(new[] { "kind", "flow", "version", "mode", "baseline", "values", "secrets", "changes", "patch", "checks", "command", "preset" }, key) < 0)
                throw CanopyRequestException.Document("The proposal has the unknown property '" + CanopyFlowRequest.Clip(key) + "'.");
        }

        if (!(Text(map, "kind") == "flowSubmission" && map.TryGetValue("version", out var version) && version is long number && number == 1)) throw CanopyRequestException.Document("A proposal has kind \"flowSubmission\" and version 1.");
        if (Text(map, "flow") != _flow.Id) throw CanopyRequestException.Document("The proposal names another flow.");
        var edit = _flow.IsEditMode || _flow.Initial.Count > 0 || _flow.StoredSecrets.Count > 0 || _flow.Baseline != null;
        if (Text(map, "mode") != (edit ? "edit" : "create")) throw CanopyRequestException.Document("The proposal's mode is not the flow's.");
        Text(map, "baseline");
        // The browser's changes, patch and command are recomputed in Finish; they are read only to refuse what is not a proposal.
        foreach (var name in new[] { "changes", "patch" }) if (map.TryGetValue(name, out var list) && !(list is List<object?> items && items.Count <= 4 * CanopyFlow.MaxFields)) throw CanopyRequestException.Document("The proposal's " + name + " is a list.");
        if (map.TryGetValue("command", out var command) && !(command is string)) throw CanopyRequestException.Document("The proposal's command is text.");
        return ReadValues(map.TryGetValue("values", out var values) ? values : null);
    }

    /// <summary>The visible fields whose options come from the host and that hold an answer, with the visible answers of the flow's own fields.</summary>
    internal (List<CanopyFlowField> Fields, IReadOnlyDictionary<string, object?> Answers) HostOptionFields() {
        var fields = new List<CanopyFlowField>();
        var answers = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var owner in _order) {
            if (owner.Dynamic || owner.Field.Kind == CanopyFlowFieldKind.Secret || !IsVisible(owner.Field.Id) || !_answers.TryGetValue(owner.Field.Id, out var value)) continue;
            answers[owner.Field.Id] = value;
            if (owner.Field.OptionsSource == CanopyFlowOptionsSource.Host && value != null) fields.Add(owner.Field);
        }

        return (fields, answers);
    }

    /// <summary>Keeps a host-option field's current options, loaded by the caller, for its check.</summary>
    internal void SetHostOptions(string fieldId, IEnumerable<CanopyFlowOption>? options) => _hostOptions[fieldId] = options;

    /// <summary>Adds a host section's fields, as the host defines them for the answers <see cref="Begin"/> gave.</summary>
    internal void AddHostFields(CanopyFlowSection section, CanopyFlowStep step, IEnumerable<CanopyFlowField>? fields) {
        foreach (var field in Admit(section, fields)) Add(new Owner(field, section, step, true));
    }

    /// <summary>Reads a draft's partial answers. Hidden answers stay, so their host sections need metadata too.</summary>
    internal List<(CanopyFlowSection Section, CanopyFlowStep Step, IReadOnlyDictionary<string, object?> Answers)> BeginDraft(object? values) =>
        ReadValues(values, draft: true);

    /// <summary>Checks every draft answer against its admitted field and refuses secrets, sensitive answers and unknown ids.</summary>
    internal void FinishDraft() {
        ReadPendingValues();
        foreach (var entry in _answers) if (_owners[entry.Key].Field.IsSensitive)
            throw CanopyRequestException.Document("The draft holds the sensitive field " + entry.Key + ".");
    }

    private void ReadPendingValues() {
        foreach (var entry in _pending) {
            if (!_owners.TryGetValue(entry.Key, out var owner)) throw CanopyRequestException.Document("The values name '" + CanopyFlowRequest.Clip(entry.Key) + "', which is no field the flow shows.");
            Answer(owner.Field, entry.Value);
        }
    }

    /// <summary>Reads the answers of host-section fields, the secrets and the checks, checks every visible field, and computes the rest.</summary>
    internal CanopyFlowSubmission Finish(Dictionary<string, string> secretValues, bool secretsTravel) {
        var map = _map;
        ReadPendingValues();

        foreach (var entry in _answers) {
            if (!IsVisible(entry.Key)) throw CanopyRequestException.Document("The proposal carries an answer of the hidden field " + entry.Key + ".");
        }

        var edit = _flow.IsEditMode || _flow.Initial.Count > 0 || _flow.StoredSecrets.Count > 0 || _flow.Baseline != null;
        var baseline = Text(map, "baseline");
        var secrets = ReadSecrets(map.TryGetValue("secrets", out var states) ? states : null, secretValues, secretsTravel);
        var claims = ReadChecks(map.TryGetValue("checks", out var checks) ? checks : null);
        var preset = Text(map, "preset");
        if (preset != null && (preset.Length == 0 || preset.Length > 200)) throw CanopyRequestException.Document("The proposal's preset is an id of at most 200 characters.");
        var errors = Check(secrets, secretValues);
        if (errors.Count > 0) throw new CanopyFlowSubmissionException(errors);

        var visibleValues = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var owner in _order) {
            if (owner.Field.Kind == CanopyFlowFieldKind.Secret || !IsVisible(owner.Field.Id)) continue;
            visibleValues[owner.Field.Id] = _answers.TryGetValue(owner.Field.Id, out var value) ? value : null;
        }

        var (changes, patch) = Changes(visibleValues, edit);
        var typed = new List<string>();
        foreach (var entry in secrets) if (entry.Value == CanopyFlowSecretState.Set) typed.Add(entry.Key);
        var staticValues = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var entry in visibleValues) if (!_owners[entry.Key].Dynamic) staticValues[entry.Key] = entry.Value;
        var line = CanopyFlowCommandLine.Format(_flow, staticValues, typed);
        return new CanopyFlowSubmission(_flow, edit, baseline, visibleValues, secrets, changes, patch, claims, line, preset, secretValues);
    }

    private static string? Text(Dictionary<string, object?> map, string name) {
        if (!map.TryGetValue(name, out var value) || value == null) return null;
        return value as string ?? throw CanopyRequestException.Document("The proposal's " + name + " is text.");
    }

    /// <summary>The answers of the flow's own fields, each in its kind's canonical form; the rest wait for the host sections' fields.</summary>
    private List<(CanopyFlowSection, CanopyFlowStep, IReadOnlyDictionary<string, object?>)> ReadValues(object? node, bool draft = false) {
        if (node != null) {
            if (!(node is Dictionary<string, object?> map) || map.Count > 2 * CanopyFlow.MaxFields) throw CanopyRequestException.Document("The proposal's values are an object of answers.");
            foreach (var entry in map) {
                if (_owners.TryGetValue(entry.Key, out var owner)) Answer(owner.Field, entry.Value);
                else _pending.Add(entry);
            }
        }

        return draft && _pending.Count == 0 ? new List<(CanopyFlowSection, CanopyFlowStep, IReadOnlyDictionary<string, object?>)>() : HostSections(draft);
    }

    private void Answer(CanopyFlowField field, object? raw) {
        if (field.Kind == CanopyFlowFieldKind.Secret) throw CanopyRequestException.Document("The proposal's values carry the secret field " + field.Id + "; secrets travel apart.");
        if (raw == null) { _answers[field.Id] = null; return; }
        var value = CanopyFlowValues.TryCanonical(field, raw, out var error);
        if (error != null) throw CanopyRequestException.Document("The answer of " + field.Id + " " + error);
        _answers[field.Id] = value;
    }

    /// <summary>The visible host sections, with the visible answers of the flow's own fields their fields may depend on.</summary>
    private List<(CanopyFlowSection, CanopyFlowStep, IReadOnlyDictionary<string, object?>)> HostSections(bool includeHidden = false) {
        var answers = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var owner in _order) if (owner.Field.Kind != CanopyFlowFieldKind.Secret && IsVisible(owner.Field.Id) && _answers.TryGetValue(owner.Field.Id, out var value)) answers[owner.Field.Id] = value;
        var sections = new List<(CanopyFlowSection, CanopyFlowStep, IReadOnlyDictionary<string, object?>)>();
        foreach (var step in _flow.Steps) {
            foreach (var section in step.Sections) if (section.IsFromHost && (includeHidden || Shown(step.Condition) && Shown(section.Condition))) sections.Add((section, step, answers));
        }

        return sections;
    }
    /// <summary>Checks a host section's fields as the browser reads them (readDynamic): at most 64, of the plain kinds, without a
    /// path, host options or dependencies, with ids of their own and conditions that read the flow's own fields only.</summary>
    internal List<CanopyFlowField> Admit(CanopyFlowSection section, IEnumerable<CanopyFlowField>? fields) {
        var admitted = new List<CanopyFlowField>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var field in fields ?? new CanopyFlowField[0]) {
            if (field == null || admitted.Count >= 64) throw new InvalidOperationException("Section " + section.Id + " has a null field or more than 64.");
            field.Validate();
            if (Array.IndexOf(DynamicKinds, field.Kind) < 0 || field.ConfigPath != null || field.ParameterName != null || field.OptionsSource == CanopyFlowOptionsSource.Host || field.DependsOnIds.Count > 0)
                throw new InvalidOperationException("Field " + field.Id + " of section " + section.Id + " has a type, path, parameter, source or dependency a host section cannot supply.");
            if (_owners.ContainsKey(field.Id) || !ids.Add(field.Id)) throw new InvalidOperationException("Field " + field.Id + " of section " + section.Id + " repeats the id of another field.");
            if (field.Condition != null) {
                field.Condition.Validate();
                foreach (var id in field.Condition.Fields()) {
                    if (!_owners.TryGetValue(id, out var tested) || tested.Dynamic || tested.Field.Kind == CanopyFlowFieldKind.Secret) throw new InvalidOperationException("The condition of field " + field.Id + " reads " + id + ", which is not a field of the flow's own.");
                }
            }

            admitted.Add(field);
        }

        return admitted;
    }

    private bool Shown(CanopyFlowCondition? condition) => condition == null || condition.EvaluateWith(Read);

    private object? Read(string id) {
        if (!IsVisible(id) || !_answers.TryGetValue(id, out var value)) return null;
        return _owners[id].Field.Kind == CanopyFlowFieldKind.Pick ? CanopyFlowRecordValues.PickIds(value) : value;
    }

    /// <summary>A field shows when its step, section and own conditions hold, reading hidden fields as empty (the flow has no cycles).</summary>
    private bool IsVisible(string id) {
        if (_visible.TryGetValue(id, out var known)) return known;
        if (!_owners.TryGetValue(id, out var owner)) return false;
        var shown = Shown(owner.Step.Condition) && Shown(owner.Section?.Condition) && Shown(owner.Field.Condition);
        _visible[id] = shown;
        return shown;
    }

    private Dictionary<string, CanopyFlowSecretState> ReadSecrets(object? node, Dictionary<string, string> values, bool secretsTravel) {
        var states = new Dictionary<string, CanopyFlowSecretState>(StringComparer.Ordinal);
        if (node != null) {
            if (!(node is Dictionary<string, object?> map) || map.Count > CanopyFlow.MaxFields) throw CanopyRequestException.Document("The proposal's secrets are an object of states.");
            foreach (var entry in map) {
                if (!_owners.TryGetValue(entry.Key, out var owner) || owner.Field.Kind != CanopyFlowFieldKind.Secret || !IsVisible(entry.Key)) throw CanopyRequestException.Document("The proposal's secrets name '" + CanopyFlowRequest.Clip(entry.Key) + "', which is no secret field the flow shows.");
                var state = entry.Value is Dictionary<string, object?> body && body.Count == 1 && body.TryGetValue("state", out var name) ? name as string : null;
                if (state == "set") states[entry.Key] = CanopyFlowSecretState.Set;
                else if (state == "keep" && Keeps(owner.Field)) states[entry.Key] = CanopyFlowSecretState.Keep;
                else throw CanopyRequestException.Document("The secret " + entry.Key + " is { state: \"set\" }, or { state: \"keep\" } when a stored value stays.");
            }
        }

        // A stored secret the reader emptied, where blank does not keep it, is cleared.
        foreach (var owner in _order) {
            if (owner.Field.Kind == CanopyFlowFieldKind.Secret && !states.ContainsKey(owner.Field.Id) && IsVisible(owner.Field.Id) && _flow.StoredSecrets.Contains(owner.Field.Id)) states[owner.Field.Id] = CanopyFlowSecretState.Clear;
        }

        foreach (var id in values.Keys) {
            if (!(states.TryGetValue(id, out var state) && state == CanopyFlowSecretState.Set)) throw CanopyRequestException.Document("A secret travels for " + CanopyFlowRequest.Clip(id) + ", which the proposal does not set.");
        }

        if (secretsTravel) {
            foreach (var entry in states) if (entry.Value == CanopyFlowSecretState.Set && !values.ContainsKey(entry.Key)) throw CanopyRequestException.Document("The proposal sets the secret " + entry.Key + " but its value does not travel.");
        }

        return states;
    }

    private bool Keeps(CanopyFlowField field) => _flow.StoredSecrets.Contains(field.Id) && field.KeepsWhenBlank != false;

    /// <summary>Every visible field's checks; messages by field id.</summary>
    private Dictionary<string, string> Check(Dictionary<string, CanopyFlowSecretState> secrets, Dictionary<string, string> secretValues) {
        var errors = new Dictionary<string, string>(StringComparer.Ordinal);
        Dictionary<string, object?>? answers = null;
        foreach (var owner in _order) {
            var field = owner.Field;
            if (!IsVisible(field.Id)) continue;
            string? problem;
            if (field.Kind == CanopyFlowFieldKind.Secret) {
                var has = secrets.TryGetValue(field.Id, out var state);
                var typed = secretValues.TryGetValue(field.Id, out var value) ? value : null;
                // A secret set without its value (a proposal read without secrets) is the host's to read; only its absence is checked.
                var kept = has && (state == CanopyFlowSecretState.Keep || state == CanopyFlowSecretState.Set && typed == null);
                problem = CanopyFlowFieldRules.SecretProblem(field, typed, kept, _labels);
            } else {
                var value = _answers.TryGetValue(field.Id, out var answer) ? answer : null;
                problem = CanopyFlowFieldRules.Problem(field, value, _labels);
                if (problem == null && field.OptionsSource == CanopyFlowOptionsSource.Host && value != null) {
                    if (_hostOptions.TryGetValue(field.Id, out var loaded)) problem = HostOption(field, value, loaded);
                    else if (_options.HostOptions != null) {
                        answers ??= VisibleAnswers();
                        problem = HostOption(field, value, _options.HostOptions(field, answers));
                    }
                }
            }

            if (problem != null) errors[field.Id] = problem;
        }

        return errors;
    }

    private Dictionary<string, object?> VisibleAnswers() {
        var answers = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var entry in _answers) if (IsVisible(entry.Key)) answers[entry.Key] = entry.Value;
        return answers;
    }

    /// <summary>A host-option answer is among the options the host offers now, and none of them is disabled.</summary>
    private string? HostOption(CanopyFlowField field, object value, IEnumerable<CanopyFlowOption>? options) {
        var chosen = value is IList list ? list : new List<object> { value };
        foreach (var item in chosen) {
            var found = false;
            foreach (var option in options ?? new CanopyFlowOption[0]) {
                if (option != null && option.DisabledReason == null && CanopyFlowValues.SameScalar(option.Value, item!)) { found = true; break; }
            }

            if (!found) return field.Validation.Message ?? CanopyFlowFieldRules.Fill(_labels.GridEditChoice, ("column", field.Label));
        }

        return null;
    }

    /// <summary>The changes (edit mode) and the JSON patch, as the browser's submission() builds them.</summary>
    private (List<CanopyFlowChange> Changes, List<CanopyFlowPatchOperation> Patch) Changes(Dictionary<string, object?> values, bool edit) {
        var changes = new List<CanopyFlowChange>();
        var patch = new List<CanopyFlowPatchOperation>();
        foreach (var entry in values) {
            var field = _owners[entry.Key].Field;
            var to = Normal(entry.Value);
            var from = Normal(_flow.Initial.TryGetValue(field.Id, out var initial) ? CanopyFlowValues.Canonical(field, initial, "The initial value") : null);
            var changed = !Same(from, to);
            if (edit && changed) changes.Add(new CanopyFlowChange(field.Id, field.ConfigPath, from, to));
            if (field.ConfigPath == null) continue;
            var pointer = Pointer(field.ConfigPath);
            if (edit) {
                if (!changed) continue;
                patch.Add(to == null ? new CanopyFlowPatchOperation("remove", pointer, null) : new CanopyFlowPatchOperation(from == null ? "add" : "replace", pointer, to));
            } else if (to != null) {
                patch.Add(new CanopyFlowPatchOperation("add", pointer, to));
            }
        }

        return (changes, patch);
    }

    private static object? Normal(object? value) => value == null || value is string text && text.Length == 0 || value is ICollection list && list.Count == 0 ? null : value;

    private static bool Same(object? left, object? right) {
        var a = new CanopyJsonWriter(64);
        CanopyFlowValues.Write(a, left);
        var b = new CanopyJsonWriter(64);
        CanopyFlowValues.Write(b, right);
        return string.Equals(a.ToString(), b.ToString(), StringComparison.Ordinal);
    }

    private static string Pointer(string path) {
        var parts = path.Split('.');
        for (var index = 0; index < parts.Length; index++) parts[index] = parts[index].Replace("~", "~0").Replace("/", "~1");
        return "/" + string.Join("/", parts);
    }

    private IReadOnlyDictionary<string, CanopyFlowCheckClaim> ReadChecks(object? node) {
        var claims = new Dictionary<string, CanopyFlowCheckClaim>(StringComparer.Ordinal);
        if (node == null) return claims;
        if (!(node is Dictionary<string, object?> map) || map.Count > 8 * CanopyFlow.MaxSteps) throw CanopyRequestException.Document("The proposal's checks are an object of results.");
        var known = new HashSet<string>(StringComparer.Ordinal);
        foreach (var step in _flow.Steps) foreach (var check in step.Checks) known.Add(check.Id);
        foreach (var entry in map) {
            if (!known.Contains(entry.Key) || !(entry.Value is Dictionary<string, object?> result)) throw CanopyRequestException.Document("The proposal's checks name '" + CanopyFlowRequest.Clip(entry.Key) + "', which is no check of the flow.");
            foreach (var key in result.Keys) if (key != "status" && key != "at") throw CanopyRequestException.Document("A check result is { status, at }.");
            var status = result.TryGetValue("status", out var name) ? name as string : null;
            var at = result.TryGetValue("at", out var time) ? time as string : null;
            if (at != null && at.Length > 64) throw CanopyRequestException.Document("A check result's time is ISO 8601 text.");
            claims[entry.Key] = new CanopyFlowCheckClaim(entry.Key, status switch {
                "pass" => CanopyFlowCheckStatus.Pass,
                "warning" => CanopyFlowCheckStatus.Warning,
                "fail" => CanopyFlowCheckStatus.Fail,
                _ => throw CanopyRequestException.Document("A check result's status is pass, warning or fail.")
            }, at);
        }

        return claims;
    }
}
