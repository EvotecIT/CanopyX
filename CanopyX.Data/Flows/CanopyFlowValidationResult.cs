using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX.Data;

/// <summary>
/// The host's rules for a step or the whole flow (the <c>validateStep</c> and <c>validateFlow</c> hooks' answer): errors block
/// moving on or submitting, warnings show on the review page, and messages by field show beside the fields.
/// </summary>
public sealed class CanopyFlowValidationResult {
    /// <summary>Gets the errors.</summary>
    public IList<string> Errors { get; } = new List<string>();

    /// <summary>Gets the warnings.</summary>
    public IList<string> Warnings { get; } = new List<string>();

    /// <summary>Gets messages by field id.</summary>
    public IDictionary<string, string> FieldErrors { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Gets whether the result holds no error and no field message.</summary>
    public bool IsValid => Errors.Count == 0 && FieldErrors.Count == 0;

    /// <summary>Adds an error.</summary>
    /// <param name="message">The message.</param>
    /// <returns>The result.</returns>
    public CanopyFlowValidationResult Error(string message) { Errors.Add(CanopyFlowText.Require(message, nameof(message))); return this; }

    /// <summary>Adds a warning.</summary>
    /// <param name="message">The message.</param>
    /// <returns>The result.</returns>
    public CanopyFlowValidationResult Warning(string message) { Warnings.Add(CanopyFlowText.Require(message, nameof(message))); return this; }

    /// <summary>Adds a message beside a field.</summary>
    /// <param name="fieldId">The field's id.</param>
    /// <param name="message">The message.</param>
    /// <returns>The result.</returns>
    public CanopyFlowValidationResult FieldError(string fieldId, string message) { FieldErrors[fieldId] = CanopyFlowText.Require(message, nameof(message)); return this; }

    /// <summary>Writes the result as the browser reads it.</summary>
    /// <returns>Compact JSON.</returns>
    public string ToJson() {
        var writer = new CanopyJsonWriter(128);
        writer.BeginObject();
        CanopyFlowJson.Texts(writer, "errors", Errors);
        CanopyFlowJson.Texts(writer, "warnings", Warnings);
        CanopyFlowJson.Messages(writer, "fieldErrors", FieldErrors);
        return writer.EndObject().ToString();
    }
}