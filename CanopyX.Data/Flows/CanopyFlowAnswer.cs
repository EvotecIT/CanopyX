using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX.Data;

/// <summary>
/// The host's answer to a proposal (see "The proposal and the host's answer" in docs/flow.md): saved, accepted, error or
/// conflict, with an optional message, messages by field and by step, result rows and links. <see cref="ToJson"/> writes it
/// as the browser reads it, so an endpoint returns it as is.
/// </summary>
public sealed class CanopyFlowAnswer {
    private CanopyFlowAnswer(CanopyFlowAnswerStatus status, string? message) {
        Status = status;
        Message = CanopyFlowText.Optional(message, nameof(message));
    }

    /// <summary>Gets the status.</summary>
    public CanopyFlowAnswerStatus Status { get; }

    /// <summary>Gets the message, or null for the translated default.</summary>
    public string? Message { get; }

    /// <summary>Gets messages by field id; the review page shows each beside its field.</summary>
    public IDictionary<string, string> FieldErrors { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Gets messages by step id.</summary>
    public IDictionary<string, string> StepErrors { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Gets the result panel's rows (at most 50 show).</summary>
    public IList<CanopyFlowResultRow> Result { get; } = new List<CanopyFlowResultRow>();

    /// <summary>Gets the result panel's links (at most 10 show).</summary>
    public IList<CanopyFlowLink> Links { get; } = new List<CanopyFlowLink>();

    /// <summary>The change is applied.</summary>
    /// <param name="message">A line for the result panel, or null.</param>
    /// <returns>The answer.</returns>
    public static CanopyFlowAnswer Saved(string? message = null) => new CanopyFlowAnswer(CanopyFlowAnswerStatus.Saved, message);

    /// <summary>The change is accepted and runs on.</summary>
    /// <param name="message">A line for the progress panel, or null.</param>
    /// <returns>The answer.</returns>
    public static CanopyFlowAnswer Accepted(string? message = null) => new CanopyFlowAnswer(CanopyFlowAnswerStatus.Accepted, message);

    /// <summary>The change was refused.</summary>
    /// <param name="message">Why, for the reader, or null for the translated default.</param>
    /// <returns>The answer.</returns>
    public static CanopyFlowAnswer Error(string? message = null) => new CanopyFlowAnswer(CanopyFlowAnswerStatus.Error, message);

    /// <summary>The settings changed since the flow opened.</summary>
    /// <param name="message">A line for the reader, or null for the translated default.</param>
    /// <returns>The answer.</returns>
    public static CanopyFlowAnswer Conflict(string? message = null) => new CanopyFlowAnswer(CanopyFlowAnswerStatus.Conflict, message);

    /// <summary>Adds a message beside a field.</summary>
    /// <param name="fieldId">The field's id.</param>
    /// <param name="message">The message.</param>
    /// <returns>The answer.</returns>
    public CanopyFlowAnswer FieldError(string fieldId, string message) { FieldErrors[fieldId] = CanopyFlowText.Require(message, nameof(message)); return this; }

    /// <summary>Adds a message to a step.</summary>
    /// <param name="stepId">The step's id.</param>
    /// <param name="message">The message.</param>
    /// <returns>The answer.</returns>
    public CanopyFlowAnswer StepError(string stepId, string message) { StepErrors[stepId] = CanopyFlowText.Require(message, nameof(message)); return this; }

    /// <summary>Adds a row to the result panel.</summary>
    /// <param name="label">The label.</param>
    /// <param name="value">The value.</param>
    /// <param name="once">Whether the value is shown once only.</param>
    /// <returns>The answer.</returns>
    public CanopyFlowAnswer AddResult(string label, string value, bool once = false) { Result.Add(new CanopyFlowResultRow(label, value, once)); return this; }

    /// <summary>Adds a link to the result panel.</summary>
    /// <param name="label">The text.</param>
    /// <param name="href">The address.</param>
    /// <returns>The answer.</returns>
    public CanopyFlowAnswer AddLink(string label, string href) { Links.Add(new CanopyFlowLink(label, href)); return this; }

    /// <summary>Writes the answer as the browser reads it.</summary>
    /// <returns>Compact JSON.</returns>
    public string ToJson() {
        var writer = new CanopyJsonWriter(256);
        writer.BeginObject().Property("status", Status switch {
            CanopyFlowAnswerStatus.Saved => "saved",
            CanopyFlowAnswerStatus.Accepted => "accepted",
            CanopyFlowAnswerStatus.Conflict => "conflict",
            _ => "error"
        }).OptionalProperty("message", Message);
        CanopyFlowJson.Messages(writer, "fieldErrors", FieldErrors);
        CanopyFlowJson.Messages(writer, "stepErrors", StepErrors);
        if (Result.Count > 0) {
            writer.Name("result").BeginArray();
            foreach (var row in Result) {
                writer.BeginObject().Property("label", row.Label).Property("value", row.Value);
                if (row.IsShownOnce) writer.Property("once", true);
                writer.EndObject();
            }

            writer.EndArray();
        }

        if (Links.Count > 0) {
            writer.Name("links").BeginArray();
            foreach (var link in Links) writer.BeginObject().Property("label", link.Label).Property("href", link.Href).EndObject();
            writer.EndArray();
        }

        return writer.EndObject().ToString();
    }
}