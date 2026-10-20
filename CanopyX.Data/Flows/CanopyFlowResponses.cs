using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX.Data;

/// <summary>
/// The answers of a flow's <c>options</c> and <c>fields</c> routes, and the draft a <c>PUT draft</c> request saves, checked as the
/// browser will read them. The other routes answer with <see cref="CanopyFlowCheckResult"/>, <see cref="CanopyFlowValidationResult"/>,
/// <see cref="CanopyFlowPreview"/>, <see cref="CanopyFlowStepStatus.ToJson"/> and <see cref="CanopyFlowAnswer"/>.
/// </summary>
public static class CanopyFlowResponses {
    /// <summary>The most characters a saved draft holds.</summary>
    public const int MaxDraftLength = 512 * 1024;

    /// <summary>Writes the options of a field whose options come from the host: <c>{ "options": [...] }</c>.</summary>
    /// <param name="field">The field.</param>
    /// <param name="options">The options (at most 1,000, distinct values).</param>
    /// <returns>Compact JSON.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="field"/> is null.</exception>
    /// <exception cref="InvalidOperationException">An option is not valid, or two share a value.</exception>
    public static string Options(CanopyFlowField field, IEnumerable<CanopyFlowOption>? options) {
        if (field == null) throw new ArgumentNullException(nameof(field));
        var list = new List<CanopyFlowOption>();
        foreach (var option in options ?? new CanopyFlowOption[0]) {
            if (option == null || list.Count >= CanopyFlowValues.MaxOptions) throw new InvalidOperationException("The options of " + field.Id + " hold a null option or more than 1000.");
            option.Validate(field.Id);
            foreach (var earlier in list) if (CanopyFlowValues.SameScalar(earlier.Value, option.Value)) throw new InvalidOperationException("The options of " + field.Id + " repeat a value.");
            list.Add(option);
        }

        var writer = new CanopyJsonWriter(256);
        writer.BeginObject().Name("options").BeginArray();
        foreach (var option in list) option.WriteJson(writer);
        return writer.EndArray().EndObject().ToString();
    }

    /// <summary>Writes the fields of a host section: <c>{ "fields": [...] }</c>, checked as the browser reads them.</summary>
    /// <param name="flow">The flow.</param>
    /// <param name="section">The section, whose fields come from the host.</param>
    /// <param name="fields">The fields (at most 64, of the plain kinds, without a path, host options or dependencies).</param>
    /// <returns>Compact JSON.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> or <paramref name="section"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The flow or a field is not valid.</exception>
    public static string Fields(CanopyFlow flow, CanopyFlowSection section, IEnumerable<CanopyFlowField>? fields) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (section == null) throw new ArgumentNullException(nameof(section));
        if (!section.IsFromHost) throw new InvalidOperationException("Section " + section.Id + " has fields of its own.");
        var admitted = new CanopyFlowSubmissionReader(flow, null).Admit(section, fields);
        var writer = new CanopyJsonWriter(512);
        writer.BeginObject().Name("fields").BeginArray();
        foreach (var field in admitted) field.WriteJson(writer);
        return writer.EndArray().EndObject().ToString();
    }

    /// <summary>
    /// Reads the body of a <c>PUT draft</c> request (<c>{ "flow", "draft" }</c>) and returns the draft to store: a <c>flowDraft</c>
    /// of this flow whose answers name its non-secret, non-sensitive fields (or host-section fields), at most
    /// <see cref="MaxDraftLength"/> characters. <c>GET draft</c> answers the stored text, or <c>null</c>.
    /// </summary>
    /// <param name="flow">The flow.</param>
    /// <param name="json">The request body.</param>
    /// <returns>The draft, as compact JSON.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> or <paramref name="json"/> is null.</exception>
    /// <exception cref="CanopyRequestException">The request or the draft is malformed, or the draft holds a secret or sensitive answer.</exception>
    public static string Draft(CanopyFlow flow, string json) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (json == null) throw new ArgumentNullException(nameof(json));
        flow.Validate();
        var map = CanopyFlowRequest.Envelope(flow, CanopyFlowRequest.ParseJson(json), "draft");
        if (!(map.TryGetValue("draft", out var node) && node is Dictionary<string, object?> draft)) throw CanopyRequestException.Document("The request needs a draft object.");
        foreach (var key in draft.Keys) {
            if (Array.IndexOf(new[] { "kind", "version", "flow", "step", "completed", "values", "saved", "baseline", "preset" }, key) < 0) throw CanopyRequestException.Document("The draft has the unknown property '" + CanopyFlowRequest.Clip(key) + "'.");
        }

        if (!(draft.TryGetValue("kind", out var kind) && kind as string == "flowDraft" && draft.TryGetValue("version", out var version) && version is long number && number == 1 &&
            draft.TryGetValue("flow", out var id) && id as string == flow.Id)) throw CanopyRequestException.Document("A draft has kind \"flowDraft\", version 1 and this flow's id.");
        var steps = new HashSet<string>(StringComparer.Ordinal);
        foreach (var step in flow.Steps) steps.Add(step.Id);
        // A task list's hub is no step of the document; its draft names it "#tasks".
        if (flow.Mode == CanopyFlowMode.Tasks) steps.Add("#tasks");
        if (draft.TryGetValue("step", out var at) && !(at is string open && steps.Contains(open))) throw CanopyRequestException.Document("The draft's step is a step of the flow.");
        if (draft.TryGetValue("completed", out var completed)) {
            if (!(completed is List<object?> done) || done.Count > CanopyFlow.MaxSteps) throw CanopyRequestException.Document("The draft's completed steps are a list of step ids.");
            foreach (var item in done) if (!(item is string step && steps.Contains(step))) throw CanopyRequestException.Document("The draft's completed steps are a list of step ids.");
        }

        foreach (var name in new[] { "saved", "baseline", "preset" }) {
            if (draft.TryGetValue(name, out var text) && !(text is string value && value.Length <= 256)) throw CanopyRequestException.Document("The draft's " + name + " is text of at most 256 characters.");
        }

        if (draft.TryGetValue("values", out var values)) {
            // Every answer must fit its field (hidden ones too: a draft keeps them); a sensitive field's never travels.
            CanopyFlowRequest.Answers(flow, values);
            if (values is Dictionary<string, object?> answers) {
                foreach (var field in CanopyFlowValidator.Fields(flow)) {
                    if (field.IsSensitive && answers.ContainsKey(field.Id)) throw CanopyRequestException.Document("The draft holds the sensitive field " + field.Id + ".");
                }
            }
        }

        var writer = new CanopyJsonWriter(1024);
        CanopyFlowContract.WriteNode(writer, draft);
        var stored = writer.ToString();
        if (stored.Length > MaxDraftLength) throw CanopyRequestException.Limit("The draft is larger than the endpoint keeps.");
        return stored;
    }
}
