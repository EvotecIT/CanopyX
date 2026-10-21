using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX.Data;

/// <summary>What a server check found (the <c>check</c> hook's answer): pass, warning or fail, a message, details and messages by field.</summary>
public sealed class CanopyFlowCheckResult {
    private CanopyFlowCheckResult(CanopyFlowCheckStatus status, string? message) {
        Status = status;
        Message = CanopyFlowText.Optional(message, nameof(message));
    }

    /// <summary>Gets the status.</summary>
    public CanopyFlowCheckStatus Status { get; }

    /// <summary>Gets the message, or null.</summary>
    public string? Message { get; }

    /// <summary>Gets the details the check panel lists (at most 20 show).</summary>
    public IList<CanopyFlowDetail> Details { get; } = new List<CanopyFlowDetail>();

    /// <summary>Gets messages by field id, shown beside the fields.</summary>
    public IDictionary<string, string> FieldErrors { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>The check passed.</summary>
    /// <param name="message">A line for the reader, or null.</param>
    /// <returns>The result.</returns>
    public static CanopyFlowCheckResult Pass(string? message = null) => new CanopyFlowCheckResult(CanopyFlowCheckStatus.Pass, message);

    /// <summary>The check passed with a warning the reader may have to acknowledge.</summary>
    /// <param name="message">The warning.</param>
    /// <returns>The result.</returns>
    public static CanopyFlowCheckResult Warning(string message) => new CanopyFlowCheckResult(CanopyFlowCheckStatus.Warning, CanopyFlowText.Require(message, nameof(message)));

    /// <summary>The check failed.</summary>
    /// <param name="message">Why.</param>
    /// <returns>The result.</returns>
    public static CanopyFlowCheckResult Fail(string message) => new CanopyFlowCheckResult(CanopyFlowCheckStatus.Fail, CanopyFlowText.Require(message, nameof(message)));

    /// <summary>Adds a detail.</summary>
    /// <param name="label">The label.</param>
    /// <param name="value">The value.</param>
    /// <returns>The result.</returns>
    public CanopyFlowCheckResult Detail(string label, string value) { Details.Add(new CanopyFlowDetail(label, value)); return this; }

    /// <summary>Adds a message beside a field.</summary>
    /// <param name="fieldId">The field's id.</param>
    /// <param name="message">The message.</param>
    /// <returns>The result.</returns>
    public CanopyFlowCheckResult FieldError(string fieldId, string message) { FieldErrors[fieldId] = CanopyFlowText.Require(message, nameof(message)); return this; }

    /// <summary>Writes the result as the browser reads it.</summary>
    /// <returns>Compact JSON.</returns>
    public string ToJson() {
        var writer = new CanopyJsonWriter(128);
        writer.BeginObject().Property("status", Status == CanopyFlowCheckStatus.Pass ? "pass" : Status == CanopyFlowCheckStatus.Warning ? "warning" : "fail").OptionalProperty("message", Message);
        if (Details.Count > 0) {
            writer.Name("details").BeginArray();
            foreach (var detail in Details) writer.BeginObject().Property("label", detail.Label).Property("value", detail.Value).EndObject();
            writer.EndArray();
        }

        CanopyFlowJson.Messages(writer, "fieldErrors", FieldErrors);
        return writer.EndObject().ToString();
    }
}