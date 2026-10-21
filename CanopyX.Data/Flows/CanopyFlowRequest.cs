using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX.Data;

/// <summary>
/// A request one of a flow's hooks sends to an endpoint (<c>options</c>, <c>fields</c>, <c>check</c>, <c>validate</c>,
/// <c>preview</c> or <c>status</c>; see "An endpoint" in docs/flow.md), read against the flow: the field, section, check or step
/// it names, the reader's current answers, and for a check the secrets among the fields it tests.
/// </summary>
/// <remarks>
/// The answers are what the reader has typed so far, not a proposal: they are read with the field kinds' value rules but not
/// checked as required or in range. Answers of host-section fields are read as values or lists of values.
/// </remarks>
public sealed class CanopyFlowRequest {
    private const int MaxSecretLength = 65536;
    private readonly Dictionary<string, string> _secrets;

    private CanopyFlowRequest(CanopyFlow flow, CanopyFlowRoutes route, IReadOnlyDictionary<string, object?> values, Dictionary<string, string> secrets) {
        Flow = flow;
        Route = route;
        Values = values;
        _secrets = secrets;
    }

    /// <summary>Gets the flow.</summary>
    public CanopyFlow Flow { get; }

    /// <summary>Gets the route the request came to.</summary>
    public CanopyFlowRoutes Route { get; }

    /// <summary>Gets the field whose options an <c>options</c> request asks for, or null.</summary>
    public CanopyFlowField? Field { get; private set; }

    /// <summary>Gets the host section whose fields a <c>fields</c> request asks for, or null.</summary>
    public CanopyFlowSection? Section { get; private set; }

    /// <summary>Gets the check a <c>check</c> request runs, or null.</summary>
    public CanopyFlowCheck? Check { get; private set; }

    /// <summary>Gets the step a <c>validate</c> request checks, or null when it checks the whole flow.</summary>
    public CanopyFlowStep? Step { get; private set; }

    /// <summary>
    /// Gets the reader's current answers by field id: the visible, non-secret fields of the flow in each field kind's canonical
    /// form (answers of hidden fields are left out), and host-section fields' answers as values or lists of values.
    /// </summary>
    public IReadOnlyDictionary<string, object?> Values { get; }

    /// <summary>Reads, once, a secret a <c>check</c> request carries for a secret field the check tests; null when it carries none.</summary>
    /// <param name="fieldId">The secret field's id.</param>
    /// <returns>The value, or null.</returns>
    public string? ReadSecret(string fieldId) {
        if (fieldId == null || !_secrets.TryGetValue(fieldId, out var value)) return null;
        _secrets.Remove(fieldId);
        return value;
    }

    /// <summary>Reads a hook's request body.</summary>
    /// <param name="flow">The flow, as the server builds it for this request.</param>
    /// <param name="route">The route: <see cref="CanopyFlowRoutes.Options"/>, <see cref="CanopyFlowRoutes.Fields"/>, <see cref="CanopyFlowRoutes.Check"/>,
    /// <see cref="CanopyFlowRoutes.Validate"/>, <see cref="CanopyFlowRoutes.Preview"/> or <see cref="CanopyFlowRoutes.Status"/>.</param>
    /// <param name="json">The request body.</param>
    /// <returns>The request.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> or <paramref name="json"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="route"/> is not one of the routes above.</exception>
    /// <exception cref="InvalidOperationException">The flow is not valid.</exception>
    /// <exception cref="CanopyRequestException">The request is malformed or names what the flow does not have.</exception>
    public static CanopyFlowRequest Parse(CanopyFlow flow, CanopyFlowRoutes route, string json) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (json == null) throw new ArgumentNullException(nameof(json));
        var name = route switch {
            CanopyFlowRoutes.Options => "field",
            CanopyFlowRoutes.Fields => "section",
            CanopyFlowRoutes.Check => "check",
            CanopyFlowRoutes.Validate => "step",
            CanopyFlowRoutes.Preview => "values",
            CanopyFlowRoutes.Status => "values",
            _ => throw new ArgumentException("Only the options, fields, check, validate, preview and status routes take a request of values.", nameof(route))
        };
        flow.Validate();
        var map = route == CanopyFlowRoutes.Check ? Envelope(flow, ParseJson(json), "check", "values", "secrets") : Envelope(flow, ParseJson(json), name, "values");
        var values = Answers(flow, map.TryGetValue("values", out var raw) ? raw : null);
        var secrets = route == CanopyFlowRoutes.Check ? SecretMap(map) : new Dictionary<string, string>(StringComparer.Ordinal);
        var request = new CanopyFlowRequest(flow, route, values, secrets);
        var id = map.TryGetValue(name, out var item) ? item as string : null;
        if (route == CanopyFlowRoutes.Validate) {
            if (map.ContainsKey("step")) request.Step = Find(flow.Steps, step => step.Id == id) ?? throw CanopyRequestException.Document("The request names no step of the flow.");
        } else if (route == CanopyFlowRoutes.Options) {
            foreach (var field in CanopyFlowValidator.Fields(flow)) if (field.Id == id && field.OptionsSource == CanopyFlowOptionsSource.Host) request.Field = field;
            if (request.Field == null) throw CanopyRequestException.Document("The request names no field whose options come from the host.");
        } else if (route == CanopyFlowRoutes.Fields) {
            foreach (var step in flow.Steps) foreach (var section in step.Sections) if (section.Id == id && section.IsFromHost) request.Section = section;
            if (request.Section == null) throw CanopyRequestException.Document("The request names no section whose fields come from the host.");
        } else if (route == CanopyFlowRoutes.Check) {
            foreach (var step in flow.Steps) foreach (var check in step.Checks) if (check.Id == id) request.Check = check;
            if (request.Check == null) throw CanopyRequestException.Document("The request names no check of the flow.");
            foreach (var secret in secrets.Keys) {
                if (!request.Check.FieldIds.Contains(secret) || Kind(flow, secret) != CanopyFlowFieldKind.Secret) throw CanopyRequestException.Document("The request carries a secret the check does not test.");
            }
        }

        return request;
    }

    /// <summary>
    /// A <c>fields</c> request for a host section with given answers, as the submit route asks the same handler for the fields
    /// whose answers a proposal carries (<see cref="CanopyFlowReadOptions.SectionFieldsAsync"/>).
    /// </summary>
    /// <param name="flow">The flow.</param>
    /// <param name="section">The host section.</param>
    /// <param name="values">The answers, as the reader gives them.</param>
    /// <returns>The request.</returns>
    /// <exception cref="ArgumentNullException">An argument is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="section"/> takes no fields from the host.</exception>
    public static CanopyFlowRequest ForSection(CanopyFlow flow, CanopyFlowSection section, IReadOnlyDictionary<string, object?> values) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (section == null) throw new ArgumentNullException(nameof(section));
        if (values == null) throw new ArgumentNullException(nameof(values));
        if (!section.IsFromHost) throw new ArgumentException("The section has fields of its own.", nameof(section));
        return new CanopyFlowRequest(flow, CanopyFlowRoutes.Fields, values, new Dictionary<string, string>(StringComparer.Ordinal)) { Section = section };
    }

    /// <summary>
    /// An <c>options</c> request for a field whose options come from the host, with given answers, as the submit route asks the
    /// same handler for the options a proposal's answer must be among (<see cref="CanopyFlowReadOptions.HostOptionsAsync"/>).
    /// </summary>
    /// <param name="flow">The flow.</param>
    /// <param name="field">The field.</param>
    /// <param name="values">The answers, as the reader gives them.</param>
    /// <returns>The request.</returns>
    /// <exception cref="ArgumentNullException">An argument is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="field"/> takes no options from the host.</exception>
    public static CanopyFlowRequest ForField(CanopyFlow flow, CanopyFlowField field, IReadOnlyDictionary<string, object?> values) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (field == null) throw new ArgumentNullException(nameof(field));
        if (values == null) throw new ArgumentNullException(nameof(values));
        if (field.OptionsSource != CanopyFlowOptionsSource.Host) throw new ArgumentException("The field's options are its own.", nameof(field));
        return new CanopyFlowRequest(flow, CanopyFlowRoutes.Options, values, new Dictionary<string, string>(StringComparer.Ordinal)) { Field = field };
    }

    private static T? Find<T>(IEnumerable<T> items, Func<T, bool> match) where T : class {
        foreach (var item in items) if (item != null && match(item)) return item;
        return null;
    }

    private static CanopyFlowFieldKind? Kind(CanopyFlow flow, string id) {
        foreach (var field in CanopyFlowValidator.Fields(flow)) if (field.Id == id) return field.Kind;
        return null;
    }

    internal static object? ParseJson(string json) {
        try {
            return CanopyJsonReader.Parse(json);
        } catch (FormatException error) {
            throw new CanopyRequestException(CanopyRequestError.InvalidJson, "The request is not valid JSON: " + error.Message);
        }
    }

    /// <summary>The request object: the flow's id under <c>flow</c> and only the named properties besides.</summary>
    internal static Dictionary<string, object?> Envelope(CanopyFlow flow, object? node, params string[] allowed) {
        if (!(node is Dictionary<string, object?> map)) throw CanopyRequestException.Document("The request is a JSON object.");
        foreach (var key in map.Keys) {
            if (key != "flow" && Array.IndexOf(allowed, key) < 0) throw CanopyRequestException.Document("The request has the unknown property '" + Clip(key) + "'.");
        }

        if (!(map.TryGetValue("flow", out var id) && id is string text && text == flow.Id)) throw CanopyRequestException.Document("The request names another flow.");
        return map;
    }

    /// <summary>The <c>secrets</c> object of a request: non-empty texts by field id.</summary>
    internal static Dictionary<string, string> SecretMap(Dictionary<string, object?> map) {
        var secrets = new Dictionary<string, string>(StringComparer.Ordinal);
        if (!map.TryGetValue("secrets", out var node) || node == null) return secrets;
        if (!(node is Dictionary<string, object?> entries) || entries.Count > CanopyFlow.MaxFields) throw CanopyRequestException.Document("The request's secrets are an object of texts.");
        foreach (var entry in entries) {
            if (!(entry.Value is string value) || value.Length == 0 || value.Length > MaxSecretLength) throw CanopyRequestException.Document("The request's secrets are non-empty texts of at most 65536 characters.");
            secrets[entry.Key] = value;
        }

        return secrets;
    }

    /// <summary>The reader's answers of a hook request: static fields in their canonical form, host-section answers as sent.</summary>
    internal static IReadOnlyDictionary<string, object?> Answers(CanopyFlow flow, object? node) {
        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        if (node == null) return result;
        if (!(node is Dictionary<string, object?> map) || map.Count > 2 * CanopyFlow.MaxFields) throw CanopyRequestException.Document("The request's values are an object of answers.");
        var fields = new Dictionary<string, CanopyFlowField>(StringComparer.Ordinal);
        foreach (var field in CanopyFlowValidator.Fields(flow)) fields[field.Id] = field;
        var hostSections = false;
        foreach (var step in flow.Steps) foreach (var section in step.Sections) hostSections |= section.IsFromHost;
        foreach (var entry in map) {
            if (fields.TryGetValue(entry.Key, out var field)) {
                if (field.Kind == CanopyFlowFieldKind.Secret) throw CanopyRequestException.Document("The request's values carry the secret field " + field.Id + ".");
                if (entry.Value == null) { result[field.Id] = null; continue; }
                var value = CanopyFlowValues.TryCanonical(field, entry.Value, out var error);
                if (error != null) throw CanopyRequestException.Document("The answer of " + field.Id + " " + error);
                result[field.Id] = value;
            } else if (hostSections && CanopyFlowValues.IsIdentifier(entry.Key)) {
                // A host-section field holds a scalar or a list of them; anything else is no answer of one.
                result[entry.Key] = HostAnswer(entry.Key, entry.Value);
            } else {
                throw CanopyRequestException.Document("The request's values name '" + Clip(entry.Key) + "', which is no field of the flow.");
            }
        }

        // Answers of hidden fields stay out, as the browser leaves them out: conditions read only the visible ones.
        var visible = CanopyFlowValidator.VisibleFieldIds(flow, result);
        foreach (var id in new List<string>(result.Keys)) if (fields.ContainsKey(id) && !visible.Contains(id)) result.Remove(id);
        return result;
    }

    private static object? HostAnswer(string id, object? value) {
        if (value == null) return null;
        if (CanopyFlowValues.TryScalar(value, out var scalar)) return scalar;
        if (value is List<object?> items && items.Count <= CanopyFlowValues.MaxItems) {
            var list = new List<object>();
            foreach (var item in items) {
                if (!CanopyFlowValues.TryScalar(item, out var element)) throw CanopyRequestException.Document("The answer of " + Clip(id) + " is a value or a list of values.");
                list.Add(element);
            }

            return list;
        }

        throw CanopyRequestException.Document("The answer of " + Clip(id) + " is a value or a list of values.");
    }

    internal static string Clip(string text) => text.Length > 64 ? text.Substring(0, 64) + "…" : text;
}
