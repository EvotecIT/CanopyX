using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using CanopyX.Json;

namespace CanopyX.Data;

/// <summary>
/// A flow's proposal read on the server (see "Reading a proposal on the server" in docs/flow.md). The browser's proposal is a
/// claim: <see cref="Parse"/> and <see cref="ParseRequest"/> read it against the flow the server builds, keep the answers of
/// visible fields only, check every answer with the flow's own rules, and compute the changes, the JSON patch and the
/// equivalent command again from the answers, never from what the browser says they are.
/// </summary>
/// <remarks>
/// <para>
/// A malformed proposal (another flow, an unknown, hidden or secret field among the values, a value of the wrong type, a secret
/// the proposal does not name) throws <see cref="CanopyRequestException"/>. Answers that fail the flow's checks throw
/// <see cref="CanopyFlowSubmissionException"/>, whose <see cref="CanopyFlowSubmissionException.ToAnswer"/> shows the messages
/// beside the fields.
/// </para>
/// <para>
/// Check results (<see cref="Checks"/>) are what the browser reports: a host that relies on a check runs it again before applying
/// the change. The typed confirmation and the acknowledgement of the review page are the reader's consent in the browser; they
/// do not travel.
/// </para>
/// </remarks>
public sealed class CanopyFlowSubmission {
    private readonly Dictionary<string, string> _secretValues;

    internal CanopyFlowSubmission(CanopyFlow flow, bool edit, string? baseline, IReadOnlyDictionary<string, object?> values, IReadOnlyDictionary<string, CanopyFlowSecretState> secrets,
        IReadOnlyList<CanopyFlowChange> changes, IReadOnlyList<CanopyFlowPatchOperation> patch, IReadOnlyDictionary<string, CanopyFlowCheckClaim> checks, string? command,
        string? presetId, Dictionary<string, string> secretValues) {
        Flow = flow;
        IsEdit = edit;
        Baseline = baseline;
        Values = values;
        Secrets = secrets;
        Changes = changes;
        Patch = patch;
        Checks = checks;
        Command = command;
        PresetId = presetId;
        _secretValues = secretValues;
    }

    /// <summary>Gets the flow the proposal was read against.</summary>
    public CanopyFlow Flow { get; }

    /// <summary>Gets whether the proposal edits existing settings (the flow is in edit mode) rather than creating them.</summary>
    public bool IsEdit { get; }

    /// <summary>Gets the baseline the proposal echoes: the revision of the settings the reader started from, or null.</summary>
    public string? Baseline { get; }

    /// <summary>Gets whether the proposal's baseline is the flow's <see cref="CanopyFlow.Baseline"/>; false means the settings changed since the flow opened, and the host answers <see cref="CanopyFlowAnswer.Conflict"/>.</summary>
    public bool IsCurrent => string.Equals(Baseline, Flow.Baseline, StringComparison.Ordinal);

    /// <summary>
    /// Gets the answers of the visible, non-secret fields (host-section fields included), in field order, in their canonical form:
    /// null, text (dates <c>yyyy-MM-dd</c>, times <c>HH:mm</c>, moments ISO 8601 UTC, durations ISO 8601), a <see cref="double"/>,
    /// a <see cref="bool"/>, a list of them, a list of records (dictionaries by column id) or a list of picked records (<c>id</c>, <c>label</c>).
    /// </summary>
    public IReadOnlyDictionary<string, object?> Values { get; }

    /// <summary>Gets the state of each visible secret field the proposal sets, keeps or clears. Never the values: read them with <see cref="ReadSecret"/>.</summary>
    public IReadOnlyDictionary<string, CanopyFlowSecretState> Secrets { get; }

    /// <summary>Gets, in edit mode, the answers that differ from the edited settings, computed from <see cref="CanopyFlow.Initial"/>.</summary>
    public IReadOnlyList<CanopyFlowChange> Changes { get; }

    /// <summary>Gets the JSON patch of the fields with a setting path (<see cref="CanopyFlowField.ConfigPath"/>), computed from the answers.</summary>
    public IReadOnlyList<CanopyFlowPatchOperation> Patch { get; }

    /// <summary>Gets the check results the browser reports, by check id. Claims only: run a check again before relying on it.</summary>
    public IReadOnlyDictionary<string, CanopyFlowCheckClaim> Checks { get; }

    /// <summary>Gets the equivalent command of the answers, computed by the server, or null when the flow has none.</summary>
    public string? Command { get; }

    /// <summary>Gets the id of the preset the answers started from, or null; it may name a preset the host's store saved.</summary>
    public string? PresetId { get; }

    /// <summary>Reads a secret the reader typed, once: a second read, or a field the proposal does not set, returns null.</summary>
    /// <param name="fieldId">The secret field's id.</param>
    /// <returns>The value, or null.</returns>
    public string? ReadSecret(string fieldId) {
        if (fieldId == null || !_secretValues.TryGetValue(fieldId, out var value)) return null;
        _secretValues.Remove(fieldId);
        return value;
    }

    /// <summary>Writes <see cref="Patch"/> as a JSON Patch document (RFC 6902).</summary>
    /// <returns>Compact JSON.</returns>
    public string PatchToJson() {
        var writer = new CanopyJsonWriter(256);
        writer.BeginArray();
        foreach (var operation in Patch) {
            writer.BeginObject().Property("op", operation.Op).Property("path", operation.Path);
            if (operation.Op != "remove") {
                writer.Name("value");
                CanopyFlowValues.Write(writer, operation.Value);
            }

            writer.EndObject();
        }

        return writer.EndArray().ToString();
    }

    /// <summary>Reads a proposal (<c>flowSubmission</c>, as the browser's <c>canopyx:flowSubmit</c> event carries it) against a flow.</summary>
    /// <param name="flow">The flow, as the server builds it for this request: in edit mode with the current settings and baseline.</param>
    /// <param name="json">The proposal.</param>
    /// <param name="secrets">The secrets the reader typed, by field id, or null when none travel.</param>
    /// <param name="options">Host-section fields and host options, or null.</param>
    /// <returns>The submission.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> or <paramref name="json"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The flow is not valid.</exception>
    /// <exception cref="CanopyRequestException">The proposal is malformed or names what the flow does not show.</exception>
    /// <exception cref="CanopyFlowSubmissionException">The answers fail the flow's checks.</exception>
    public static CanopyFlowSubmission Parse(CanopyFlow flow, string json, IReadOnlyDictionary<string, string>? secrets = null, CanopyFlowReadOptions? options = null) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (json == null) throw new ArgumentNullException(nameof(json));
        var copy = new Dictionary<string, string>(StringComparer.Ordinal);
        if (secrets != null) foreach (var entry in secrets) copy[entry.Key] = entry.Value;
        return new CanopyFlowSubmissionReader(flow, options).Read(CanopyFlowRequest.ParseJson(json), copy, secrets != null);
    }

    /// <summary>
    /// Reads the body the browser posts to an endpoint's <c>submit</c> route: <c>{ "flow", "submission", "secrets" }</c>, the
    /// proposal and the values of the secrets it sets.
    /// </summary>
    /// <param name="flow">The flow, as the server builds it for this request.</param>
    /// <param name="json">The request body.</param>
    /// <param name="options">Host-section fields and host options, or null.</param>
    /// <returns>The submission.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> or <paramref name="json"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The flow is not valid.</exception>
    /// <exception cref="CanopyRequestException">The request is malformed or names what the flow does not show.</exception>
    /// <exception cref="CanopyFlowSubmissionException">The answers fail the flow's checks.</exception>
    public static CanopyFlowSubmission ParseRequest(CanopyFlow flow, string json, CanopyFlowReadOptions? options = null) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (json == null) throw new ArgumentNullException(nameof(json));
        var map = CanopyFlowRequest.Envelope(flow, CanopyFlowRequest.ParseJson(json), "submission", "secrets");
        if (!map.TryGetValue("submission", out var submission)) throw CanopyRequestException.Document("The request needs 'submission'.");
        var secrets = CanopyFlowRequest.SecretMap(map);
        return new CanopyFlowSubmissionReader(flow, options).Read(submission, secrets, true);
    }

    /// <summary>
    /// Reads the body of an endpoint's <c>submit</c> route as <see cref="ParseRequest"/> does, loading host sections' fields with
    /// <see cref="CanopyFlowReadOptions.SectionFieldsAsync"/> (or <see cref="CanopyFlowReadOptions.SectionFields"/>) and host
    /// options with <see cref="CanopyFlowReadOptions.HostOptionsAsync"/> (or <see cref="CanopyFlowReadOptions.HostOptions"/>).
    /// </summary>
    /// <param name="flow">The flow, as the server builds it for this request.</param>
    /// <param name="json">The request body.</param>
    /// <param name="options">Host-section fields and host options, or null.</param>
    /// <param name="cancellationToken">Cancels loading host sections' fields.</param>
    /// <returns>The submission.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> or <paramref name="json"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The flow is not valid, or it has host sections and the options load none.</exception>
    /// <exception cref="CanopyRequestException">The request is malformed or names what the flow does not show.</exception>
    /// <exception cref="CanopyFlowSubmissionException">The answers fail the flow's checks.</exception>
    public static async Task<CanopyFlowSubmission> ParseRequestAsync(CanopyFlow flow, string json, CanopyFlowReadOptions? options = null, CancellationToken cancellationToken = default) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (json == null) throw new ArgumentNullException(nameof(json));
        var map = CanopyFlowRequest.Envelope(flow, CanopyFlowRequest.ParseJson(json), "submission", "secrets");
        if (!map.TryGetValue("submission", out var submission)) throw CanopyRequestException.Document("The request needs 'submission'.");
        var secrets = CanopyFlowRequest.SecretMap(map);
        var reader = new CanopyFlowSubmissionReader(flow, options);
        foreach (var (section, step, answers) in reader.Begin(submission)) {
            IEnumerable<CanopyFlowField>? fields;
            if (options?.SectionFieldsAsync != null) fields = await options.SectionFieldsAsync(section, answers, cancellationToken).ConfigureAwait(false);
            else if (options?.SectionFields != null) fields = options.SectionFields(section, answers);
            else throw new InvalidOperationException("Section " + section.Id + " takes its fields from the host: set CanopyFlowReadOptions.SectionFieldsAsync.");
            reader.AddHostFields(section, step, fields);
        }

        if (options?.HostOptionsAsync != null) {
            var (hostFields, answers) = reader.HostOptionFields();
            foreach (var field in hostFields) reader.SetHostOptions(field.Id, await options.HostOptionsAsync(field, answers, cancellationToken).ConfigureAwait(false));
        }

        return reader.Finish(secrets, true);
    }
}
